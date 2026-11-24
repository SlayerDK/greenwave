import "server-only";

import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/config/prisma";
import { trafficQueries } from "@/lib/traffic/queries";
import {
  serializeNetworkFromDb,
  type LiveNetworkTraffic,
} from "@/lib/traffic/serialization";

export const getNetworkTraffic = async (): Promise<LiveNetworkTraffic> => {
  await requireAuth();

  return serializeNetworkFromDb(await trafficQueries.network(prisma, "aarhus"));
};
