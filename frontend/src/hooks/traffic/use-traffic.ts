"use client";

import { type NetworkTraffic } from "@/lib/traffic/serialization";
import { useQuery } from "@tanstack/react-query";

/**
 * The client genuinely needs this data itself, which is the case CLAUDE.md
 * carves out for `useQuery` — so it goes through the route handler, never
 * through an action.
 *
 * Nothing here refetches on its own. `initialData` is the payload the RSC
 * already rendered, so a page load paints populated without a second read, and
 * `staleTime: Infinity` is what keeps it that way: a stale query would be
 * refetched on mount, on reconnect, and on every remount of the panel. The only
 * ways to new data are a page reload, which re-renders the RSC, and
 * `refetch()` behind the refresh button.
 *
 * `refetch()` ignores `staleTime` by design, so the button always re-reads —
 * though within `TRAFFIC_REFRESH_SECONDS` the upstream read is still cached and
 * will hand back the same payload rather than spending thirteen TomTom calls.
 */
export const useNetworkTraffic = (initialData?: NetworkTraffic) =>
  useQuery({
    queryKey: ["traffic", "network"],
    queryFn: async (): Promise<NetworkTraffic> => {
      const response = await fetch("/api/traffic");
      if (!response.ok) throw new Error("Failed to load traffic data.");

      return response.json() as Promise<NetworkTraffic>;
    },
    initialData,
    staleTime: Infinity,
    refetchInterval: false,
  });
