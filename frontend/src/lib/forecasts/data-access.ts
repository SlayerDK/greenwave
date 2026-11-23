import "server-only";

import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/config/prisma";
import { forecastQueries } from "@/lib/forecasts/queries";
import {
  serializeForecast,
  type SerializedForecast,
} from "@/lib/forecasts/serialization";

export const getLatestForecast =
  async (): Promise<SerializedForecast | null> => {
    await requireAuth();

    const run = await forecastQueries.latestForCity(prisma, "aarhus");
    return run ? serializeForecast(run) : null;
  };
