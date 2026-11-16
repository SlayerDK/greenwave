import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MQTT_URL: z.string().url(),
  MQTT_BACKEND_PASSWORD: z.string().min(1),
  BACKEND_CLIENT_ID: z.string().min(1).optional(),
});

export const readEnv = () =>
  envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    MQTT_URL: process.env.MQTT_URL,
    MQTT_BACKEND_PASSWORD: process.env.MQTT_BACKEND_PASSWORD,
    BACKEND_CLIENT_ID: process.env.BACKEND_CLIENT_ID,
  });

export type BackendEnv = ReturnType<typeof readEnv>;
