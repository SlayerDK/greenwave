"use client";

import {
  applyRouteState,
  type LiveNetworkTraffic,
} from "@/lib/traffic/serialization";
import {
  ALL_STATES,
  ALL_STATUSES,
  adapterStatusSchema,
  cityOfStatusTopic,
  stateSchema,
} from "@greenwave/shared";
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
        if (payload.length === 0) return;
        let value: unknown;
        try {
          value = JSON.parse(payload.toString());
        } catch {
          return;
        }

        if (topic.endsWith("/state")) {
          const parsed = stateSchema.safeParse(value);
          if (parsed.success) {
            queryClient.setQueryData<LiveNetworkTraffic>(
              LIVE_TRAFFIC_QUERY_KEY,
              (old) => (old ? applyRouteState(old, parsed.data) : old),
            );
          }
          return;
        }

        const parsed = adapterStatusSchema.safeParse(value);
        if (!parsed.success) return;
        const cityId = cityOfStatusTopic(topic);
        setOfflineCities((cities) =>
          parsed.data.status === "offline"
            ? cities.includes(cityId)
              ? cities
              : [...cities, cityId]
            : cities.filter((city) => city !== cityId),
        );
      });
    });

    return () => {
      cancelled = true;
      client?.end();
    };
  }, [mqttUrl, queryClient]);

  return { ...query, traffic: query.data ?? initialData, offlineCities };
};
