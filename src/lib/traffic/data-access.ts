import "server-only";

import { requireAuth } from "@/lib/auth/session";
import { trafficQueries } from "@/lib/traffic/queries";
import { DEFAULT_ROUTE_ID } from "@/lib/traffic/schema";
import {
  serializeRouteTraffic,
  serializeTrafficSnapshot,
  type SerializedRouteTraffic,
  type SerializedTrafficSnapshot,
} from "@/lib/traffic/serialization";
import { fetchRouteDetails } from "@/lib/traffic/tomtom-service";

const HISTORY_WINDOW_HOURS = 24;
const HOUR_IN_MS = 60 * 60 * 1000;

export const getRouteTraffic = async (
  routeId: number = DEFAULT_ROUTE_ID,
): Promise<SerializedRouteTraffic> => {
  await requireAuth();
  const { details, fetchedAt } = await fetchRouteDetails(routeId);

  return serializeRouteTraffic(details, fetchedAt);
};

export const getRouteHistory = async (
  routeId: number = DEFAULT_ROUTE_ID,
  hours: number = HISTORY_WINDOW_HOURS,
): Promise<SerializedTrafficSnapshot[]> => {
  await requireAuth();
  const snapshots = await trafficQueries.listSnapshots(
    routeId,
    new Date(Date.now() - hours * HOUR_IN_MS),
  );

  return snapshots.map(serializeTrafficSnapshot);
};
