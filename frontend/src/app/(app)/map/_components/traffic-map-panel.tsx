"use client";

import { ForecastHorizon } from "@/app/(app)/map/_components/forecast-horizon";
import { LiveStatus } from "@/app/(app)/map/_components/live-status";
import { PredictedTrafficSection } from "@/app/(app)/map/_components/predicted-traffic-section";
import { RouteSummaryList } from "@/app/(app)/map/_components/route-summary-list";
import { TrafficMap } from "@/app/(app)/map/_components/traffic-map-loader";
import { createMapSync } from "@/app/(app)/map/_lib/map-sync";
import { CongestionLegend } from "@/components/traffic/congestion-legend";
import { useLatestForecast } from "@/hooks/forecasts/use-latest-forecast";
import { useLiveTraffic } from "@/hooks/traffic/use-live-traffic";
import { useNow } from "@/hooks/traffic/use-now";
import {
  positionToHorizon,
  selectForecastSlot,
  type SerializedForecast,
} from "@/lib/forecasts/serialization";
import {
  staleRouteKey,
  toLiveFeatureCollection,
  type LiveNetworkTraffic,
} from "@/lib/traffic/serialization";
import { parseAsInteger, useQueryState } from "nuqs";
import { useState } from "react";

const DEFAULT_HORIZON_MINUTES = 15;

export const TrafficMapPanel = ({
  initialTraffic,
  initialForecast,
  renderedAt,
  mqttUrl,
  mapboxToken,
}: {
  initialTraffic: LiveNetworkTraffic;
  initialForecast: SerializedForecast | null;
  renderedAt: number;
  mqttUrl: string;
  mapboxToken: string;
}) => {
  const { traffic, offlineCities } = useLiveTraffic(initialTraffic, mqttUrl);
  const latestForecast = useLatestForecast(initialForecast);
  const now = useNow(renderedAt);
  const [mapSync] = useState(createMapSync);
  const [horizonMinutes, setHorizonMinutes] = useQueryState(
    "horizon",
    parseAsInteger.withDefault(DEFAULT_HORIZON_MINUTES),
  );

  /**
   * One source for every route, merged here rather than served that way so the
   * geometry is not sent twice. No `useMemo` — React Compiler is on, and the
   * string key is what keeps this stable across clock ticks; were it to re-run
   * on every render, mapbox would re-upload the whole collection each time.
   */
  const staleKey = staleRouteKey(traffic.routes, now);
  const featureCollection = toLiveFeatureCollection(traffic.routes, staleKey);
  const selected = selectForecastSlot(latestForecast, horizonMinutes, now);

  return (
    <div className="flex flex-col gap-4">
      <LiveStatus
        routeCount={traffic.routes.length}
        segmentCount={featureCollection.features.length}
        isAdapterOffline={offlineCities.length > 0}
      />

      <ForecastHorizon
        selected={selected}
        onPositionChange={(next) =>
          void setHorizonMinutes(positionToHorizon(next))
        }
      />

      <CongestionLegend showStale />

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
              mapSync={mapSync}
              speedLabel="Current"
            />
          </div>
        </section>

        <PredictedTrafficSection
          selected={selected}
          liveCollection={featureCollection}
          routes={traffic.routes}
          mapboxToken={mapboxToken}
          mapSync={mapSync}
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        <RouteSummaryList routes={traffic.routes} />
      </div>
    </div>
  );
};
