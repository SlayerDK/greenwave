import { z } from "zod";

export const env = z
  .object({
    DATABASE_URL: z.url(),
    CITY_IDS: z.string().default("aarhus"),
    FORECAST_TAU_MINUTES: z.coerce.number().int().positive().default(60),
  })
  .parse(process.env);
