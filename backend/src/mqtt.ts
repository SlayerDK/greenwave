import type { DatabaseClient } from "@greenwave/database";
import {
  observationSchema,
  SHARED_OBSERVATIONS,
  STATE_TTL_SECONDS,
  stateTopic,
} from "@greenwave/shared";
import mqtt, { type IPublishPacket, type MqttClient } from "mqtt";
import os from "node:os";
import type { Logger } from "pino";
import type { BackendEnv } from "./env";
import type { Metrics } from "./metrics";
import { processObservation } from "./process-observation";

export const startMqtt = async (
  prisma: DatabaseClient,
  env: BackendEnv,
  logger: Logger,
  metrics: Metrics,
) => {
  const client = await mqtt.connectAsync(env.MQTT_URL, {
    protocolVersion: 5,
    clientId: env.BACKEND_CLIENT_ID ?? `backend-${os.hostname()}`,
    clean: false,
    properties: { sessionExpiryInterval: 3600, receiveMaximum: 32 },
    username: "backend",
    password: env.MQTT_BACKEND_PASSWORD,
  });

  client.handleMessage = (packet: IPublishPacket, done) => {
    const handleMessage = async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(packet.payload.toString());
      } catch {
        metrics.invalidMessage();
        logger.warn({ topic: packet.topic }, "invalid JSON observation");
        done();
        return;
      }
      const result = observationSchema.safeParse(parsed);
      if (!result.success) {
        metrics.invalidMessage();
        logger.warn(
          { topic: packet.topic, issue: result.error.issues[0] },
          "invalid observation",
        );
        done();
        return;
      }
      logger.debug({ eventId: result.data.eventId }, "processing observation");
      const state = await processObservation(prisma, result.data);
      if (!state) {
        metrics.duplicateMessage();
        done();
        return;
      }
      metrics.processedMessage(
        Date.now() - new Date(result.data.observedAt).getTime(),
      );
      await client.publishAsync(
        stateTopic(result.data.cityId, result.data.routeId),
        JSON.stringify(state),
        {
          qos: 1,
          retain: true,
          properties: { messageExpiryInterval: STATE_TTL_SECONDS },
        },
      );
      metrics.publishedMessage();
      done();
    };
    handleMessage().catch((error: unknown) => {
      logger.error(
        { err: error, topic: packet.topic },
        "backend processing failed",
      );
      process.exit(1);
    });
  };

  await client.subscribeAsync(SHARED_OBSERVATIONS, { qos: 1 });
  return client;
};

export const stopMqtt = async (client: MqttClient) => {
  await client.endAsync();
};
