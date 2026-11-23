"use client";

import {
  msUntilNextForecast,
  type SerializedForecast,
} from "@/lib/forecasts/serialization";
import { useQuery } from "@tanstack/react-query";

/**
 * The one poll on the map, because forecasts never travel over MQTT. Timed to
 * just after each predictor run rather than a plain 15 minutes, which could
 * leave a tab nearly a full run behind. A failed read keeps the last forecast.
 */
export const useLatestForecast = (initialData: SerializedForecast | null) => {
  const query = useQuery({
    queryKey: ["forecasts", "latest"],
    queryFn: async (): Promise<SerializedForecast | null> => {
      const response = await fetch("/api/forecast", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load the forecast.");

      return response.json() as Promise<SerializedForecast | null>;
    },
    initialData,
    refetchInterval: () => msUntilNextForecast(Date.now()),
    refetchIntervalInBackground: true,
  });

  return query.data ?? initialData;
};
