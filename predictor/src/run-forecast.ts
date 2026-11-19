import { createPrismaClient } from "@greenwave/database";
import { env } from "./env";
import { forecastValue } from "./forecast";
import { slotsUntilMidnight } from "./slots";

export const runForecast = async (now = new Date()) => {
  const prisma = createPrismaClient(env.DATABASE_URL);

  try {
    for (const cityId of env.CITY_IDS.split(",")
      .map((city) => city.trim())
      .filter(Boolean)) {
      const slotStarts = slotsUntilMidnight(now);
      if (slotStarts.length === 0) continue;

      const states = await prisma.trafficSegmentState.findMany({
        where: { cityId },
      });

      await prisma.$transaction(async (tx) => {
        const run = await tx.trafficForecastRun.create({
          data: {
            cityId,
            generatedAt: now,
            slotStarts,
            tauMinutes: env.FORECAST_TAU_MINUTES,
          },
        });

        await tx.trafficSegmentForecast.createMany({
          data: states.map((state) => {
            const horizonMinutes =
              slotStarts.length > 0
                ? slotStarts.map((slot) =>
                    Math.max(0, (slot.getTime() - now.getTime()) / 60000),
                  )
                : [];

            return {
              runId: run.id,
              cityId,
              routeId: state.routeId,
              segmentId: state.segmentId,
              relativeSpeedPcts: horizonMinutes.map((horizon) =>
                forecastValue(
                  state.relativeSpeedPct,
                  state.relativeSpeedPct,
                  horizon,
                  env.FORECAST_TAU_MINUTES,
                  100,
                ),
              ),
              speedsKmh: horizonMinutes.map((horizon) =>
                forecastValue(
                  state.typicalSpeedKmh,
                  state.currentSpeedKmh,
                  horizon,
                  env.FORECAST_TAU_MINUTES,
                  Math.max(
                    state.currentSpeedKmh,
                    state.averageSpeedKmh,
                    state.typicalSpeedKmh,
                  ),
                ),
              ),
            };
          }),
        });

        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        await tx.trafficForecastRun.deleteMany({
          where: { cityId, generatedAt: { lt: cutoff } },
        });
      });
    }
  } finally {
    await prisma.$disconnect();
  }
};
