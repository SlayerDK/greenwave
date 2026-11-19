import type { DatabaseClient, Prisma } from "@greenwave/database";

export type ForecastRunFromDb = Prisma.TrafficForecastRunGetPayload<{
  include: {
    segments: true;
  };
}>;

export const forecastQueries = {
  latestForCity: (prisma: DatabaseClient, cityId: string) =>
    prisma.trafficForecastRun.findFirst({
      where: { cityId },
      include: { segments: true },
      orderBy: { generatedAt: "desc" },
    }),
};
