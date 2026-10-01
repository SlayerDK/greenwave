"use client";

import { CongestionLegend } from "@/app/(app)/map/_components/congestion-legend";
import { RecordSnapshotButton } from "@/app/(app)/map/_components/record-snapshot-button";
import { RefreshTrafficButton } from "@/app/(app)/map/_components/refresh-traffic-button";
import { RouteSummaryList } from "@/app/(app)/map/_components/route-summary-list";
import { useNetworkTraffic } from "@/hooks/traffic/use-traffic";
import {
  mergeFeatureCollections,
  type NetworkTraffic,
  type RouteFailure,
} from "@/lib/traffic/serialization";
import dynamic from "next/dynamic";

/**
 * `ssr: false` has to be declared from a client component — Next rejects it in
 * a server one. It earns its place twice: `mapbox-gl` reaches for `window` as
 * it loads, and `useTheme()` reports no resolved theme during SSR, which would
 * hydrate the map with the wrong basemap.
 */
const TrafficMap = dynamic(
  () =>
    import("@/app/(app)/map/_components/traffic-map").then((m) => m.TrafficMap),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-muted" />,
  },
);

/** Named by id: a route that failed never delivered its name. */
const describeFailures = (failures: RouteFailure[]) =>
  failures.map(({ routeId }) => routeId).join(", ");

export const TrafficMapPanel = ({
  initialTraffic,
  mapboxToken,
}: {
  initialTraffic: NetworkTraffic;
  mapboxToken: string;
}) => {
  const query = useNetworkTraffic(initialTraffic);
  const traffic = query.data ?? initialTraffic;

  /**
   * One source for every route, merged here rather than served that way so the
   * geometry is not sent twice. No `useMemo` — React Compiler is on, and it is
   * what keeps this referentially stable between polls; were it to re-run on
   * every render, mapbox would re-upload the whole collection each time.
   */
  const featureCollection = mergeFeatureCollections(
    traffic.routes.map((route) => route.featureCollection),
  );

  const routeCount = traffic.routes.length + traffic.failures.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {traffic.routes.length} of {routeCount} routes ·{" "}
          {featureCollection.features.length} segments
        </p>
        <div className="flex items-center gap-2">
          <RefreshTrafficButton
            onRefresh={() => void query.refetch()}
            isFetching={query.isFetching}
          />
          <RecordSnapshotButton />
        </div>
      </div>

      {/* Left beside the map rather than replacing it: stale segments beat a
          blank canvas, and TomTom rate-limits legitimately. */}
      {query.isError && (
        <p className="text-sm text-destructive">
          Could not refresh traffic data. Showing the last successful reading.
          Try Refresh again in a moment.
        </p>
      )}

      {traffic.failures.length > 0 && (
        <p className="text-sm text-destructive">
          {traffic.failures.length} of {routeCount} routes are unavailable (
          {describeFailures(traffic.failures)}). The rest are shown below.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="h-[70vh] min-h-96 overflow-hidden rounded-lg border">
          <TrafficMap
            featureCollection={featureCollection}
            routes={traffic.routes}
            mapboxToken={mapboxToken}
          />
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          <RouteSummaryList routes={traffic.routes} />
        </div>
      </div>

      <CongestionLegend />
    </div>
  );
};
