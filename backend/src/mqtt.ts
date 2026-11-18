import type { DatabaseClient } from "@greenwave/database";
import {
  observationTopic,
  STATE_TTL_SECONDS,
  stateTopic,
} from "@greenwave/shared";
import mqtt from "mqtt";
import type { Logger } from "pino";
import type { BackendEnv } from "./env";
import { createMessageHandler } from "./message-handler";
import type { Metrics } from "./metrics";
import { processObservation } from "./process-observation";

/**
 * Connects only after the handler is installed: a resumed session replays its
 * queue right after the CONNACK, and MQTT.js's default handler would
 * acknowledge those readings without processing them. The connect options
 * hold the password, so they are never logged.
 */
export const startMqtt = ({
  env,
  prisma,
  logger,
  metrics,
  onFatal,
}: {
  env: BackendEnv;
  prisma: DatabaseClient;
  logger: Logger;
  metrics: Metrics;
  onFatal: (error: unknown) => void;
}) => {
  const client = mqtt.connect(env.MQTT_URL, {
    manualConnect: true,
    protocolVersion: 5,
    clientId: env.BACKEND_CLIENT_ID,
    clean: false,
    properties: { sessionExpiryInterval: 3600, receiveMaximum: 32 },
    username: "backend",
    password: env.MQTT_BACKEND_PASSWORD,
  });

  const handler = createMessageHandler({
    processObservation: (observation) =>
      processObservation(prisma, observation),
    publishState: async (state) => {
      await client.publishAsync(
        stateTopic(state.cityId, state.routeId),
        JSON.stringify(state),
        {
          qos: 1,
          retain: true,
          properties: { messageExpiryInterval: STATE_TTL_SECONDS },
        },
      );
    },
    metrics,
    logger,
    onFatal,
  });
  client.handleMessage = handler.handleMessage;

  // A normal subscription, renewed on every connect in case the session expired.
  client.on("connect", ({ sessionPresent }) => {
    logger.info(
      { clientId: env.BACKEND_CLIENT_ID, sessionPresent },
      "connected",
    );
    client
      .subscribeAsync(observationTopic("+", "+"), { qos: 1 })
      .catch(onFatal);
  });
  // Without a listener, Node would crash on the first socket error.
  client.on("error", (error) => logger.error({ err: error }, "MQTT error"));
  client.on("offline", () => logger.warn("broker offline"));
  client.connect();

  return {
    /**
     * Forced: a message left unacknowledged blocks MQTT.js's inbound queue, so
     * a graceful end could wait forever for the last state's PUBACK.
     */
    stop: async () => {
      await handler.stop();
      await client.endAsync(true);
    },
  };
};
