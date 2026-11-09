import "server-only";

import { requireAuth } from "@/lib/auth/session";
import {
  serializeNetworkTraffic,
  type NetworkTraffic,
} from "@/lib/traffic/serialization";
import { readMonitoredRoutes } from "@/lib/traffic/tomtom-service";

/**
 * An unreachable route comes back as a `failures` entry (see `readRoute` in
 * tomtom-service.ts), so `map/error.tsx` is reached only by a genuine fault.
 */
export const getNetworkTraffic = async (): Promise<NetworkTraffic> => {
  await requireAuth();

  return serializeNetworkTraffic(await readMonitoredRoutes());
};
