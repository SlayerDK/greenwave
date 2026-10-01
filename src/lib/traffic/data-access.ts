import "server-only";

import { requireAuth } from "@/lib/auth/session";
import { MONITORED_ROUTE_IDS, TrafficError } from "@/lib/traffic/schema";
import {
  serializeNetworkTraffic,
  type NetworkTraffic,
  type RouteOutcome,
} from "@/lib/traffic/serialization";
import { fetchRouteDetails } from "@/lib/traffic/tomtom-service";

/**
 * A `TrafficError` is an expected outcome — TomTom down, rate-limiting, or not
 * recognising the route — so it becomes this route's `failures` entry and the
 * rest of the network still renders. Anything else is a real fault and is left
 * to throw, which is what `map/error.tsx` is for.
 */
const readRoute = async (routeId: number): Promise<RouteOutcome> => {
  try {
    const { details, fetchedAt } = await fetchRouteDetails(routeId);

    return { ok: true, details, fetchedAt };
  } catch (error) {
    if (error instanceof TrafficError)
      return { ok: false, routeId, error: error.message };

    throw error;
  }
};

/**
 * Read in parallel, not in sequence: `fetchRouteDetails` allows itself eight
 * seconds per call, so thirteen awaits in a row would be a two-minute page.
 *
 * `Promise.all` rather than `allSettled` — `readRoute` only rejects on a
 * genuine fault, so a rejected entry would be a bug being swallowed.
 */
export const getNetworkTraffic = async (): Promise<NetworkTraffic> => {
  await requireAuth();

  return serializeNetworkTraffic(
    await Promise.all(MONITORED_ROUTE_IDS.map(readRoute)),
  );
};
