"use server";

import { requireAuth } from "@/lib/auth/session";
import { trafficMutations } from "@/lib/traffic/mutations";
import {
  DEFAULT_ROUTE_ID,
  routeIdSchema,
  TrafficError,
} from "@/lib/traffic/schema";
import { fetchRouteDetails } from "@/lib/traffic/tomtom-service";
import { type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";

/**
 * Records one poll of a route. Reads the upstream uncached (`0`) so a snapshot
 * captures the moment it was taken rather than whatever the 60s read cache holds.
 */
export const recordRouteSnapshotAction = async (
  routeId: number = DEFAULT_ROUTE_ID,
): Promise<ActionResult<{ snapshotId: string; segmentCount: number }>> =>
  safeAction(async () => {
    await requireAuth();

    const parsed = routeIdSchema.safeParse(routeId);
    if (!parsed.success)
      return { success: false, error: parsed.error.issues[0].message };

    try {
      const { details } = await fetchRouteDetails(parsed.data, 0);
      const { id } = await trafficMutations.recordSnapshot(details);

      return {
        success: true,
        data: { snapshotId: id, segmentCount: details.detailedSegments.length },
      };
    } catch (error) {
      if (error instanceof TrafficError)
        return { success: false, error: error.message };

      throw error;
    }
  });
