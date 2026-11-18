import {
  observationSchema,
  type Observation,
  type RouteState,
} from "@greenwave/shared";
import type { IPublishPacket } from "mqtt";
import type { Logger } from "pino";
import type { Metrics } from "./metrics";
import type { ProcessResult } from "./process-observation";

type HandlerDeps = {
  processObservation: (observation: Observation) => Promise<ProcessResult>;
  /** Resolves on the broker's PUBACK. */
  publishState: (state: RouteState) => Promise<void>;
  metrics: Metrics;
  logger: Logger;
  /** A database or publish failure: exits, so the broker redelivers. */
  onFatal: (error: unknown) => void;
};

type Packet = Pick<IPublishPacket, "topic" | "payload">;

/** MQTT.js's callback: called with an error, it skips the PUBACK. */
type Done = (error?: Error) => void;

/**
 * MQTT.js handles inbound packets one at a time: the next one, a PUBACK
 * included, waits until `done` is called. So `done` follows the commit, and
 * the state's publish is started but never awaited before it; awaiting its
 * PUBACK here would wait for a packet stuck behind this one.
 */
export const createMessageHandler = ({
  processObservation,
  publishState,
  metrics,
  logger,
  onFatal,
}: HandlerDeps) => {
  let stopping = false;
  let inFlight = Promise.resolve();

  /** Logs and counts what it rejects: it would fail again on every redelivery. */
  const parse = ({ topic, payload }: Packet) => {
    let json: unknown;
    try {
      json = JSON.parse(payload.toString());
    } catch {
      metrics.invalidMessage();
      logger.warn({ topic }, "invalid JSON observation");

      return undefined;
    }

    const parsed = observationSchema.safeParse(json);
    if (!parsed.success) {
      metrics.invalidMessage();
      logger.warn(
        { topic, issue: parsed.error.issues[0] },
        "invalid observation",
      );

      return undefined;
    }

    return parsed.data;
  };

  const handle = async (packet: Packet, done: Done) => {
    const observation = parse(packet);
    if (!observation) return done();

    logger.debug({ eventId: observation.eventId }, "processing observation");
    const result = await processObservation(observation);
    if (result.status === "duplicate") metrics.duplicateMessage();
    else
      metrics.processedMessage(Date.now() - Date.parse(observation.observedAt));

    if (result.status === "current")
      publishState(result.state).then(
        () => metrics.publishedMessage(),
        onFatal,
      );
    done();
  };

  return {
    handleMessage: (packet: Packet, done: Done) => {
      // Released without a PUBACK, so the broker redelivers it after the
      // restart. Releasing it lets MQTT.js reach the states' PUBACKs behind it.
      if (stopping) return done(new Error("backend stopping"));

      inFlight = handle(packet, done).catch(onFatal);
    },
    /**
     * Releases new messages without a PUBACK, and resolves once the one in
     * flight is committed.
     */
    stop: async () => {
      stopping = true;
      await inFlight;
    },
  };
};
