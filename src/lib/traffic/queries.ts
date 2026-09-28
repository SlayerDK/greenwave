import "server-only";

import { prisma } from "@/lib/config/prisma";

export const trafficQueries = {
  listSnapshots: (routeId: number, since: Date) =>
    prisma.trafficSnapshot.findMany({
      where: { routeId, recordedAt: { gte: since } },
      orderBy: { recordedAt: "asc" },
    }),
};
