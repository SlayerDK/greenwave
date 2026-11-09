"use server";

import { requireAuth } from "@/lib/auth/session";
import { trafficMutations } from "@/lib/traffic/mutations";
import {
  MONITORED_ROUTE_IDS,
  TrafficError,
  trafficTag,
} from "@/lib/traffic/schema";
import { type RouteFailure } from "@/lib/traffic/serialization";
import { fetchRouteDetails } from "@/lib/traffic/tomtom-service";
import { type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";
import { updateTag } from "next/cache";

type RecordedSnapshot = { routeId: number; segmentCount: number };

type SnapshotOutcome =
  | { ok: true; recorded: RecordedSnapshot }
  | { ok: false; failed: RouteFailure };

/**
 * One transaction per route rather than one spanning all thirteen: a route
 * TomTom cannot serve must not roll back the twelve that were recorded.
 */
const recordRoute = async (routeId: number): Promise<SnapshotOutcome> => {
  try {
    // Uncached (`0`) so the snapshot captures the moment it was taken rather
    // than whatever the 60s read cache happens to hold.
    const { details } = await fetchRouteDetails(routeId, 0);
    await trafficMutations.recordSnapshot(details);

    return {
      ok: true,
      recorded: { routeId, segmentCount: details.detailedSegments.length },
    };
  } catch (error) {
    if (error instanceof TrafficError)
      return { ok: false, failed: { routeId, error: error.message } };

    throw error;
  }
};

/**
 * Records one poll of every monitored route. Thirteen uncached upstream reads
 * and thirteen transactions per click — the only writer of snapshot history.
 */
export const recordRouteSnapshotsAction = async (): Promise<
  ActionResult<{ recorded: RecordedSnapshot[]; failed: RouteFailure[] }>
> =>
  safeAction(async () => {
    await requireAuth();

    const outcomes = await Promise.all(MONITORED_ROUTE_IDS.map(recordRoute));
    const recorded = outcomes.flatMap((outcome) =>
      outcome.ok ? [outcome.recorded] : [],
    );

    // The uncached reads above are newer than anything the read cache holds, so
    // expire those entries. Without this the `router.refresh()` that follows a
    // successful record re-renders straight out of the cache and the map keeps
    // painting the payload these snapshots just superseded.
    //
    // `updateTag`, not `revalidateTag`: the latter is stale-while-revalidate,
    // which would hand that very stale payload to the refresh we are about to
    // trigger. This is read-your-own-writes, which is what `updateTag` is for.
    //
    // Called here rather than inside `recordRoute` so it is unambiguously on
    // the Server Action's own context — `updateTag` is action-only.
    recorded.forEach(({ routeId }) => updateTag(trafficTag(routeId)));

    return {
      success: true,
      data: {
        recorded,
        failed: outcomes.flatMap((outcome) =>
          outcome.ok ? [] : [outcome.failed],
        ),
      },
    };
  });
