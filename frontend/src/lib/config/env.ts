import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    TOMTOM_API_KEY: z.string().min(1),
    MAPBOX_PUBLIC_TOKEN: z.string().min(1),
    CRON_SECRET: z.string().min(16),
    MQTT_WS_URL: z.url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    TOMTOM_API_KEY: process.env.TOMTOM_API_KEY,
    MAPBOX_PUBLIC_TOKEN: process.env.MAPBOX_PUBLIC_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    MQTT_WS_URL: process.env.MQTT_WS_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
  emptyStringAsUndefined: true,
});
