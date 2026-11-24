"use client";

import {
  applyRouteState,
  parseLiveMessage,
  updateOfflineCities,
  type LiveNetworkTraffic,
} from "@/lib/traffic/serialization";
import { ALL_STATES, ALL_STATUSES } from "@greenwave/shared";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export const LIVE_TRAFFIC_QUERY_KEY = ["traffic", "network"];

export const useLiveTraffic = (
  initialData: LiveNetworkTraffic,
  mqttUrl: string,
) => {
  const queryClient = useQueryClient();
  const [offlineCities, setOfflineCities] = useState<string[]>([]);
  const query = useQuery({
    queryKey: LIVE_TRAFFIC_QUERY_KEY,
    queryFn: skipToken,
    initialData,
  });

  useEffect(() => {
    let cancelled = false;
    let client: { end: () => void } | undefined;

    void import("mqtt").then(({ default: mqtt }) => {
      if (cancelled) return;
      const connected = mqtt.connect(mqttUrl, {
        protocolVersion: 5,
        reconnectPeriod: 5_000,
      });
      client = connected;
      connected.subscribe([ALL_STATES, ALL_STATUSES], { qos: 0 });
      connected.on("message", (topic, payload) => {
        const message = parseLiveMessage(topic, payload.toString());
        if (message?.kind === "state") {
          queryClient.setQueryData<LiveNetworkTraffic>(
            LIVE_TRAFFIC_QUERY_KEY,
            (old) => old && applyRouteState(old, message.route),
          );
        } else if (message) {
          setOfflineCities((cities) =>
            updateOfflineCities(cities, message.cityId, message.offline),
          );
        }
      });
    });

    return () => {
      cancelled = true;
      client?.end();
    };
  }, [mqttUrl, queryClient]);

  return { traffic: query.data ?? initialData, offlineCities };
};
