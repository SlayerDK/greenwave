import { type Cron } from "croner";
import { pino } from "pino";
import { z } from "zod";
import { adapterEnvSchema } from "./env";
import { loadFixtureReader } from "./fixtures";
import { connectAdapter, type AdapterConnection } from "./mqtt";
import { createPoll, schedulePolls, type ReadObservation } from "./poll";
import { createTomTomReader } from "./tomtom";

/** Filled in as start-up gets that far; the signal handlers read it. */
const running: { connection?: AdapterConnection; job?: Cron } = {};
let stopping = false;

/**
 * The first signal publishes `offline` and disconnects; a poll still running
 * is abandoned. If the broker is down that waits for it, so a second signal
 * exits at once.
 */
const shutdown = async () => {
  if (stopping) process.exit(1);
  stopping = true;
  if (!running.connection) process.exit(0);

  running.job?.stop();
  await running.connection.close();
  process.exit(0);
};

// `void`: Node ignores a handler's promise.
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

const parsed = adapterEnvSchema.safeParse(process.env);
if (!parsed.success) {
  process.stderr.write(`${z.prettifyError(parsed.error)}\n`);
  process.exit(1);
}
const env = parsed.data;

const logger = pino({ level: env.LOG_LEVEL });

/** Exits 1, so the Last Will fires and Compose restarts the container. */
const exitOn =
  (msg: string, withStack = false) =>
  (error: unknown): never => {
    logger.fatal(
      withStack
        ? { err: error }
        : { error: error instanceof Error ? error.message : String(error) },
      msg,
    );
    process.exit(1);
  };

// The one place that knows which source is running; nothing after it branches.
const readObservation: ReadObservation =
  env.ADAPTER_SOURCE === "tomtom"
    ? createTomTomReader({ apiKey: env.TOMTOM_API_KEY, cityId: env.CITY_ID })
    : await loadFixtureReader(env.ROUTE_IDS, { cityId: env.CITY_ID }).catch(
        exitOn("fixtures not loaded"),
      );

const connection = await connectAdapter({
  url: env.MQTT_URL,
  cityId: env.CITY_ID,
  password: env.MQTT_ADAPTER_PASSWORD,
  logger,
}).catch(exitOn("broker connection failed"));
running.connection = connection;

const poll = createPoll({
  cityId: env.CITY_ID,
  routeIds: env.ROUTE_IDS,
  readObservation,
  publish: connection.publish,
  isConnected: connection.isConnected,
  logger,
});

running.job = schedulePolls(poll, {
  onSkip: () => logger.warn("poll skipped: previous poll still running"),
  onBug: exitOn("poll crashed", true),
});

logger.info(
  {
    cityId: env.CITY_ID,
    source: env.ADAPTER_SOURCE,
    routes: env.ROUTE_IDS.length,
  },
  "started",
);
