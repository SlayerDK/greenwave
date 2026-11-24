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
    FORECAST_TAU_MINUTES: z.coerce.number().int().positive().default(60),
    HISTORY_DAYS: z.coerce.number().int().positive().default(28),
    LOG_LEVEL: z.string().default("info"),
  })
  .parse(process.env);
