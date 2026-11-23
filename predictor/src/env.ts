import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    CITY_IDS: z
      .string()
      .default("aarhus")
      .transform((value) =>
        value
          .split(",")
          .map((city) => city.trim())
          .filter(Boolean),
      ),
    // The lowest error in docs/report/backtest-2026-11-23.csv.
    FORECAST_TAU_MINUTES: z.coerce.number().int().positive().default(15),
    HISTORY_DAYS: z.coerce.number().int().positive().default(28),
    LOG_LEVEL: z.string().default("info"),
  })
  .parse(process.env);
