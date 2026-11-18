import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MQTT_URL: z.url(),
  MQTT_BACKEND_PASSWORD: z.string().min(1),
  /** The persistent session's name: a new one after recreation would lose the queue. */
  BACKEND_CLIENT_ID: z.string().min(1).default("backend-1"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type BackendEnv = z.infer<typeof envSchema>;

/** Exits with every problem listed, rather than a ZodError's stack. */
export const readEnv = (): BackendEnv => {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  process.stderr.write(`${z.prettifyError(parsed.error)}\n`);
  process.exit(1);
};
