"use client";

import { CongestionLegend } from "@/app/(app)/map/_components/congestion-legend";
import { RecordSnapshotButton } from "@/app/(app)/map/_components/record-snapshot-button";
import { useRouteTraffic } from "@/hooks/traffic/use-traffic";
import { type SerializedRouteTraffic } from "@/lib/traffic/serialization";
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

/**
 * The data describes Danish roads, so the clock that matters is theirs — and
 * pinning it keeps the server and client markup identical.
 */
const timeFormat = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDelay = (seconds: number) => {
  if (seconds <= 0) return "No delay";

  const minutes = Math.round(seconds / 60);

  return minutes >= 1 ? `+${minutes} min delay` : `+${seconds} s delay`;
};

const RouteSummary = ({
  summary,
}: {
  summary: SerializedRouteTraffic["summary"];
}) => (
  <div className="flex flex-col gap-0.5">
    <p className="font-medium">{summary.routeName}</p>
    <p className="text-sm text-muted-foreground">
      {formatDelay(summary.delayTime)} · updated{" "}
      {timeFormat.format(new Date(summary.fetchedAt))}
      {summary.passable ? "" : " · route impassable"}
    </p>
  </div>
);

export const TrafficMapPanel = ({
  initialTraffic,
  mapboxToken,
}: {
  initialTraffic: SerializedRouteTraffic;
  mapboxToken: string;
}) => {
  const routeId = initialTraffic.summary.routeId;
  const query = useRouteTraffic(routeId, initialTraffic);
  const traffic = query.data ?? initialTraffic;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <RouteSummary summary={traffic.summary} />
        <RecordSnapshotButton routeId={routeId} />
      </div>

      {/* Left beside the map rather than replacing it: stale segments beat a
          blank canvas, and TomTom rate-limits legitimately. */}
      {query.isError && (
        <p className="text-sm text-destructive">
          Could not refresh traffic data. Showing the last successful reading.
        </p>
      )}

      <div className="h-[70vh] min-h-96 overflow-hidden rounded-lg border">
        <TrafficMap traffic={traffic} mapboxToken={mapboxToken} />
      </div>

      <CongestionLegend />
    </div>
  );
};
