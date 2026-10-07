import "server-only";

import { trafficMutations } from "@/lib/traffic/mutations";
import { type RouteFailure } from "@/lib/traffic/serialization";
import { readMonitoredRoutes } from "@/lib/traffic/tomtom-service";

export type TrafficHistoryRun = {
  /** The UTC hour this run's rows are keyed under. */
  recordedAt: string;
  /** Rows actually written — 0 when the hour was already recorded. */
  inserted: number;
  recorded: { routeId: number; segmentCount: number }[];
  failed: RouteFailure[];
};

/**
 * Records one hourly observation of every segment on every monitored route.
 *
 * No `requireAuth()`: this runs from the cron route, which has no session and
 * checks `CRON_SECRET` instead. Never wrap it in an action — `"use server"`
 * exports are public endpoints.
 *
 * Reads uncached (`0`) so the row describes this moment, like a snapshot. No
 * `updateTag` afterwards: it is Server-Action-only, and nothing re-renders off
 * this write — the map's 60s read cache simply ages out.
 */
export const recordTrafficHistory = async (): Promise<TrafficHistoryRun> => {
  const recordedAt = toHourSlot(new Date());
  const outcomes = await readMonitoredRoutes(0);
  const answered = outcomes.flatMap((outcome) =>
    outcome.ok ? [outcome.details] : [],
  );

  const { count } =
    answered.length > 0
      ? await trafficMutations.recordHistory(answered, recordedAt)
      : { count: 0 };

  return {
    recordedAt: recordedAt.toISOString(),
    inserted: count,
    recorded: answered.map(({ routeId, detailedSegments }) => ({
      routeId,
      segmentCount: detailedSegments.length,
    })),
    failed: outcomes.flatMap((outcome): RouteFailure[] =>
      outcome.ok ? [] : [{ routeId: outcome.routeId, error: outcome.error }],
    ),
  };
};

/**
 * Taken once from the run's own clock rather than TomTom's `date` header:
 * thirteen reads can land on both sides of an hour boundary, and the slot is
 * what keys the rows.
 */
const toHourSlot = (date: Date) => {
  const slot = new Date(date);
  slot.setUTCMinutes(0, 0, 0);

  return slot;
};
