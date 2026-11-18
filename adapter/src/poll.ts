import { observationTopic, type Observation } from "@greenwave/shared";
import { Cron } from "croner";
import { type Logger } from "pino";
import { TrafficError } from "./tomtom-schema";

/** Rejects on any failure; the poll then publishes nothing for that route. */
export type ReadObservation = (routeId: string) => Promise<Observation>;

export type PollSummary =
  /** The broker was disconnected, so nothing was read. */
  | { status: "skipped" }
  | { status: "done"; published: number; failed: number; ms: number };

type PollDeps = {
  cityId: string;
  routeIds: readonly string[];
  readObservation: ReadObservation;
  /** Resolves on the broker's PUBACK. */
  publish: (topic: string, payload: string) => Promise<void>;
  isConnected: () => boolean;
  logger: Logger;
};

/**
 * One poll: every route read and published in parallel, each failing on its
 * own. A `TrafficError` is TomTom saying no and is logged at `warn`, except a
 * refused key. Anything else is a failure nobody classified, or a bug, and is
 * logged at `error` with its stack, so a bug shows as `failed: 13` every
 * minute rather than as a crash.
 */
export const createPoll = ({
  cityId,
  routeIds,
  readObservation,
  publish,
  isConnected,
  logger,
}: PollDeps) => {
  const logFailure = (routeId: string, error: unknown) => {
    if (!(error instanceof TrafficError))
      logger.error({ routeId, err: error }, "route failed");
    else if (error.code === "unauthorized")
      logger.error(
        { routeId },
        `${error.code}: ${error.message} (check TOMTOM_API_KEY)`,
      );
    else logger.warn({ routeId }, `${error.code}: ${error.message}`);
  };

  const runRoute = async (routeId: string) => {
    try {
      const observation = await readObservation(routeId);
      await publish(
        observationTopic(cityId, observation.routeId),
        JSON.stringify(observation),
      );
      logger.debug({ routeId, eventId: observation.eventId }, "published");

      return true;
    } catch (error) {
      logFailure(routeId, error);

      return false;
    }
  };

  return async (): Promise<PollSummary> => {
    if (!isConnected()) {
      logger.info("poll skipped: broker disconnected");

      return { status: "skipped" };
    }

    const start = performance.now();
    // In parallel: thirteen 8-second timeouts in a row could take two minutes.
    // The explicit arrow keeps `map`'s index out of `runRoute`.
    const outcomes = await Promise.all(routeIds.map((id) => runRoute(id)));
    const published = outcomes.filter(Boolean).length;
    const summary = {
      published,
      failed: outcomes.length - published,
      ms: Math.round(performance.now() - start),
    };
    logger.info(summary, "poll");

    return { status: "done", ...summary };
  };
};

/**
 * Runs `poll` at second 0 of every minute on the wall clock. A boundary that
 * finds the previous poll still running is skipped and reported to `onSkip`,
 * never queued. Guarded here rather than with croner's `protect`: croner 11
 * keeps re-checking a skipped boundary every 30 seconds, reports it again each
 * time, and starts a catch-up poll off the boundary once the long one ends.
 * `onBug` gets any error that escapes `poll`, which handles every route's own.
 */
export const schedulePolls = (
  poll: () => Promise<unknown>,
  { onSkip, onBug }: { onSkip: () => void; onBug: (error: unknown) => void },
) => {
  let polling = false;

  return new Cron("* * * * *", { catch: onBug }, async () => {
    if (polling) return onSkip();

    polling = true;
    try {
      await poll();
    } finally {
      polling = false;
    }
  });
};
