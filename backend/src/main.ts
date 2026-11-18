import { createPrismaClient } from "@greenwave/database";
import pino from "pino";
import { readEnv } from "./env";
import { Metrics } from "./metrics";
import { startMqtt } from "./mqtt";

const env = readEnv();
const logger = pino({ level: env.LOG_LEVEL });
const prisma = createPrismaClient(env.DATABASE_URL);
const metrics = new Metrics(logger);
const metricsTimer = metrics.start();

/** Exits 1: Compose restarts the container and the broker redelivers. */
const fatal = (error: unknown) => {
  logger.fatal({ err: error }, "fatal error, exiting");
  process.exit(1);
};

const connection = startMqtt({ env, prisma, logger, metrics, onFatal: fatal });

let stopping = false;

/**
 * The first signal waits for the message in flight to commit, then
 * disconnects. A second one exits at once.
 */
const shutdown = async () => {
  if (stopping) process.exit(1);
  stopping = true;

  clearInterval(metricsTimer);
  await connection.stop();
  await prisma.$disconnect();
  process.exit(0);
};

// `void`: Node ignores a handler's promise.
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
