import { createPrismaClient } from "@greenwave/database";
import pino from "pino";
import { readEnv } from "./env";
import { Metrics } from "./metrics";
import { startMqtt, stopMqtt } from "./mqtt";

const logger = pino();
const env = readEnv();
const prisma = createPrismaClient(env.DATABASE_URL);
const metrics = new Metrics(logger);
const metricsTimer = metrics.start();
const client = await startMqtt(prisma, env, logger, metrics);

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  clearInterval(metricsTimer);
  await stopMqtt(client);
  await prisma.$disconnect();
};

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
