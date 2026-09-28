import "server-only";

import { requireAuth } from "@/lib/auth/session";
import { DEFAULT_ROUTE_ID } from "@/lib/traffic/schema";
import {
  serializeRouteTraffic,
  type SerializedRouteTraffic,
} from "@/lib/traffic/serialization";
import { fetchRouteDetails } from "@/lib/traffic/tomtom-service";

export const getRouteTraffic = async (
  routeId: number = DEFAULT_ROUTE_ID,
): Promise<SerializedRouteTraffic> => {
  await requireAuth();
  const { details, fetchedAt } = await fetchRouteDetails(routeId);

  return serializeRouteTraffic(details, fetchedAt);
};
