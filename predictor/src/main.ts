import { createPrismaClient } from "@greenwave/database";
import { Cron } from "croner";
import pino from "pino";
import { env } from "./env";
import { runForecast } from "./run-forecast";

const logger = pino({ level: env.LOG_LEVEL });
const prisma = createPrismaClient(env.DATABASE_URL);

// The callback returns the run's promise: that is what `protect` waits for, so
// a slow run makes the next one skip instead of overlapping it.
const job = new Cron(
  "2,17,32,47 * * * *",
  {
    protect: () => logger.warn("previous forecast still running, skipping"),
    timezone: "UTC",
    catch: (error) => logger.error({ err: error }, "forecast run failed"),
  },
  () =>
    runForecast({
      prisma,
      logger,
      cityIds: env.CITY_IDS,
      tauMinutes: env.FORECAST_TAU_MINUTES,
      historyDays: env.HISTORY_DAYS,
    }),
);

// Once at start, so a fresh stack has a forecast without waiting for the cron.
void job.trigger();

// A run cut off here rolls back: it writes in one transaction.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    job.stop();
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
