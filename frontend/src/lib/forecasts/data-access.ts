import "server-only";

import { requireAuth } from "@/lib/auth/session";
import { env } from "@/lib/config/env";
import { forecastQueries } from "@/lib/forecasts/queries";
import { serializeForecast } from "@/lib/forecasts/serialization";
import { createPrismaClient } from "@greenwave/database";

export const getLatestForecast = async (): Promise<ReturnType<
  typeof serializeForecast
> | null> => {
  await requireAuth();

  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const run = await forecastQueries.latestForCity(prisma, "aarhus");
    return run ? serializeForecast(run) : null;
  } finally {
    await prisma.$disconnect();
  }
};
