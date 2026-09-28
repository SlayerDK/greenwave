"use client";

import { recordRouteSnapshotAction } from "@/lib/traffic/actions";
import { DEFAULT_ROUTE_ID } from "@/lib/traffic/schema";
import { type SerializedRouteTraffic } from "@/lib/traffic/serialization";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

const REFETCH_INTERVAL_MS = 60_000;

/**
 * Polling is the case CLAUDE.md carves out for `useQuery` — it goes through the
 * route handler, never through an action.
 *
 * `initialData` is the payload the RSC already rendered, so the map paints
 * populated instead of flashing. It is dated with TomTom's own `fetchedAt`
 * rather than mount time: the upstream read is cached for 60s, so treating a
 * server payload as brand new would let the first refresh land up to two
 * windows late.
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
    refetchInterval: REFETCH_INTERVAL_MS,
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
