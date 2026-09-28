"use client";

import { recordRouteSnapshotAction } from "@/lib/traffic/actions";
import {
  DEFAULT_ROUTE_ID,
  TRAFFIC_REFRESH_SECONDS,
} from "@/lib/traffic/schema";
import { type SerializedRouteTraffic } from "@/lib/traffic/serialization";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

/** Matched to the server read cache, so a poll never lands on a warm entry. */
const REFRESH_INTERVAL_MS = TRAFFIC_REFRESH_SECONDS * 1000;

/**
 * Polling is the case CLAUDE.md carves out for `useQuery` — it goes through the
 * route handler, never through an action.
 *
 * `initialData` is the payload the RSC already rendered, so the map paints
 * populated instead of flashing. It is dated with TomTom's own `fetchedAt`
 * rather than mount time: the upstream read is cached, so treating a server
 * payload as brand new would let the first refresh land up to two windows late.
 *
 * `staleTime` is set here rather than inherited from the query client's default,
 * because the value that matters is the server cache window above — the two have
 * to agree, and a change to the global default must not silently break that.
 */
export const useRouteTraffic = (
  routeId: number = DEFAULT_ROUTE_ID,
  initialData?: SerializedRouteTraffic,
) =>
  useQuery({
    queryKey: ["traffic", routeId],
    queryFn: async (): Promise<SerializedRouteTraffic> => {
      const response = await fetch(`/api/traffic?routeId=${routeId}`);
      if (!response.ok) throw new Error("Failed to load traffic data.");

      return response.json() as Promise<SerializedRouteTraffic>;
    },
    initialData,
    initialDataUpdatedAt: initialData
      ? new Date(initialData.summary.fetchedAt).getTime()
      : undefined,
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
  });

export const useRecordRouteSnapshot = (routeId: number = DEFAULT_ROUTE_ID) => {
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      const result = await recordRouteSnapshotAction(routeId);
      if (!result.success) throw new Error(result.error);

      return result.data;
    },
    onSuccess: () => router.refresh(),
  });
};
