import { offlineStatus, onlineStatus, statusTopic } from "@greenwave/shared";
import { connectAsync } from "mqtt";
import { type Logger } from "pino";

export type AdapterConnection = {
  /** QoS 1, not retained; resolves on the PUBACK and rejects on a refusal. */
  publish: (topic: string, payload: string) => Promise<void>;
  isConnected: () => boolean;
  /** Publishes `offline` itself: a clean disconnect does not fire the Last Will. */
  close: () => Promise<void>;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Rejects at once if the broker is unreachable or refuses the login. After
 * that, MQTT.js reconnects by itself every 5 seconds. The connect options hold
 * the password, so they are never logged.
 */
export const connectAdapter = async ({
  url,
  cityId,
  password,
  logger,
}: {
  url: string;
  cityId: string;
  password: string;
  logger: Logger;
}): Promise<AdapterConnection> => {
  const clientId = `adapter-${cityId}`;
  const status = statusTopic(cityId);
  const retained = { qos: 1, retain: true } as const;

  const client = await connectAsync(url, {
    protocolVersion: 5,
    clientId,
    username: clientId,
    password,
    // The broker gives up on a silent adapter after 1.5 × 15 s.
    keepalive: 15,
    reconnectPeriod: 5_000,
    will: { topic: status, payload: offlineStatus(), ...retained },
  });

  // Without a listener, Node would crash on the first socket error.
  client.on("error", (error) => logger.warn(errorMessage(error)));

  const publishOnline = async () => {
    try {
      await client.publishAsync(status, onlineStatus(), retained);
    } catch (error) {
      logger.warn(`status not published: ${errorMessage(error)}`);
    }
  };

  logger.info("connected");
  await publishOnline();

  // Every later connect is a reconnect, and the drop may have fired the Last Will.
  client.on("connect", () => {
    logger.info("connected");
    void publishOnline();
  });
  client.on("reconnect", () => logger.debug("reconnecting"));
  client.on("offline", () => logger.warn("broker offline"));
  client.on("close", () => logger.warn("connection closed"));

  return {
    publish: async (topic, payload) => {
      await client.publishAsync(topic, payload, { qos: 1 });
    },
    isConnected: () => client.connected,
    // No timer: if the broker is down this waits, and a second signal ends it.
    close: async () => {
      await client.publishAsync(status, offlineStatus(), retained);
      await client.endAsync();
    },
  };
};
