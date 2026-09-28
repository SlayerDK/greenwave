"use server";

import { requireAuth } from "@/lib/auth/session";
import { trafficMutations } from "@/lib/traffic/mutations";
import { routeIdSchema, TrafficError, trafficTag } from "@/lib/traffic/schema";
import { fetchRouteDetails } from "@/lib/traffic/tomtom-service";
import { type ActionResult } from "@/lib/utils/action-result";
import { safeAction } from "@/lib/utils/safe-action";
import { updateTag } from "next/cache";

/**
 * Records one poll of a route. Reads the upstream uncached (`0`) so a snapshot
 * captures the moment it was taken rather than whatever the read cache holds.
 */
export const recordRouteSnapshotAction = async (
  routeId: number,
): Promise<ActionResult<{ snapshotId: string; segmentCount: number }>> =>
  safeAction(async () => {
    await requireAuth();

    const parsed = routeIdSchema.safeParse(routeId);
    if (!parsed.success)
      return { success: false, error: parsed.error.issues[0].message };

    try {
      const { details } = await fetchRouteDetails(parsed.data, 0);
      const { id } = await trafficMutations.recordSnapshot(details);

      // The uncached read above is newer than anything the read cache holds, so
      // expire that entry. Without this the `router.refresh()` that follows a
      // successful record re-renders straight out of the cache and the map keeps
      // painting the payload this snapshot just superseded.
      //
      // `updateTag`, not `revalidateTag`: the latter is stale-while-revalidate,
      // which would hand that very stale payload to the refresh we are about to
      // trigger. This is read-your-own-writes, which is what `updateTag` is for.
      updateTag(trafficTag(parsed.data));

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
