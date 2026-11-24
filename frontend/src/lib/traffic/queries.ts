import type { DatabaseClient, Prisma } from "@greenwave/database";

export type NetworkRouteFromDb = Prisma.TrafficRouteGetPayload<{
  include: {
    state: true;
    segments: { include: { state: true } };
  };
}>;

export const trafficQueries = {
  network: (prisma: DatabaseClient, cityId: string) =>
    prisma.trafficRoute.findMany({
      where: { cityId },
      include: {
        state: true,
        segments: { orderBy: { ordinal: "asc" }, include: { state: true } },
      },
      orderBy: { id: "asc" },
    }),
};
