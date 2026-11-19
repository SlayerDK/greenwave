"use client";

import { RouteSummaryList } from "@/app/(app)/map/_components/route-summary-list";
import { CongestionLegend } from "@/components/traffic/congestion-legend";
import { useLiveTraffic } from "@/hooks/traffic/use-live-traffic";
import { type SerializedForecast } from "@/lib/forecasts/serialization";
import {
  mergeFeatureCollections,
  type LiveNetworkTraffic,
  type TrafficFeatureCollection,
} from "@/lib/traffic/serialization";
import { classifyCongestion } from "@greenwave/shared";
import dynamic from "next/dynamic";
import { useState } from "react";

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

export const TrafficMapPanel = ({
  initialTraffic,
  initialForecast,
  mqttUrl,
  mapboxToken,
}: {
  initialTraffic: LiveNetworkTraffic;
  initialForecast: SerializedForecast | null;
  mqttUrl: string;
  mapboxToken: string;
}) => {
  const { traffic, offlineCities } = useLiveTraffic(initialTraffic, mqttUrl);
  const [forecastIndex, setForecastIndex] = useState(0);

  /**
   * One source for every route, merged here rather than served that way so the
   * geometry is not sent twice. No `useMemo` — React Compiler is on, and it is
   * what keeps this referentially stable between polls; were it to re-run on
   * every render, mapbox would re-upload the whole collection each time.
   */
  const featureCollection = mergeFeatureCollections(
    traffic.routes.map((route) => route.featureCollection),
  );

  const forecastSlot = initialForecast?.slotStarts[forecastIndex] ?? null;
  const forecastBySegment = new Map(
    (initialForecast?.segments ?? []).map((segment) => [
      segment.segmentId,
      segment,
    ]),
  );

  const forecastFeatureCollection: TrafficFeatureCollection | null =
    initialForecast && forecastSlot
      ? {
          ...featureCollection,
          features: featureCollection.features.map((feature) => {
            const forecast = forecastBySegment.get(
              feature.properties.segmentIdStr,
            );
            if (!forecast) return feature;

            const currentSpeed = forecast.speedsKmh[forecastIndex] ?? 0;
            const relativeSpeed =
              forecast.relativeSpeedPcts[forecastIndex] ?? 0;

            return {
              ...feature,
              properties: {
                ...feature.properties,
                currentSpeed,
                relativeSpeed,
                congestion: classifyCongestion({
                  currentSpeed,
                  relativeSpeed,
                }),
              },
            };
          }),
        }
      : null;

  const forecastTime = forecastSlot
    ? new Intl.DateTimeFormat("da-DK", {
        timeZone: "Europe/Copenhagen",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(forecastSlot))
    : null;
  const generatedTime = initialForecast
    ? new Intl.DateTimeFormat("da-DK", {
        timeZone: "Europe/Copenhagen",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(initialForecast.generatedAt))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {traffic.routes.length} routes · {featureCollection.features.length}{" "}
          segments
        </p>
      </div>

      {offlineCities.length > 0 && (
        <p className="text-sm text-destructive">
          The Aarhus adapter is offline. The map shows the last readings it
          sent.
        </p>
      )}

      {traffic.routes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No live data yet. Start the adapter and the backend.
        </p>
      )}

      {initialForecast && forecastSlot && (
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Prediction horizon</p>
            <p className="text-xs text-muted-foreground">
              Forecast made at {generatedTime}
            </p>
          </div>
          <input
            aria-label="Prediction horizon"
            className="w-full"
            type="range"
            min={0}
            max={Math.max(0, initialForecast.slotStarts.length - 1)}
            value={forecastIndex}
            onChange={(event) =>
              setForecastIndex(Number(event.currentTarget.value))
            }
          />
          <p className="mt-1 text-sm text-muted-foreground">
            Predicted for {forecastTime}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Live traffic</h2>
            <span className="text-xs text-muted-foreground">Actual</span>
          </div>
          <div className="h-[70vh] min-h-96 overflow-hidden rounded-lg border">
            <TrafficMap
              featureCollection={featureCollection}
              routes={traffic.routes}
              mapboxToken={mapboxToken}
              speedLabel="Current"
            />
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Predicted traffic</h2>
            <span className="text-xs text-muted-foreground">
              {forecastTime ?? "Unavailable"}
            </span>
          </div>
          <div className="h-[70vh] min-h-96 overflow-hidden rounded-lg border">
            {forecastFeatureCollection ? (
              <TrafficMap
                featureCollection={forecastFeatureCollection}
                routes={traffic.routes}
                mapboxToken={mapboxToken}
                speedLabel="Predicted"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-muted/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No prediction is available yet. The predictor will publish
                  this map every 15 minutes.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="max-h-64 overflow-y-auto">
          <RouteSummaryList routes={traffic.routes} />
        </div>
        <div className="flex items-center">
          <CongestionLegend />
        </div>
      </div>
    </div>
  );
};
