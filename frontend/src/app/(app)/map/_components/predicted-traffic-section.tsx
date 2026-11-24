"use client";

import { formatClock } from "@/app/(app)/map/_components/forecast-horizon";
import { TrafficMap } from "@/app/(app)/map/_components/traffic-map-loader";
import { type MapSync } from "@/app/(app)/map/_lib/map-sync";
import {
  toForecastFeatureCollection,
  type selectForecastSlot,
  type SerializedForecast,
} from "@/lib/forecasts/serialization";
import {
  type SerializedLiveRoute,
  type TrafficFeatureCollection,
} from "@/lib/traffic/serialization";

type MapProps = {
  liveCollection: TrafficFeatureCollection;
  routes: SerializedLiveRoute[];
  mapboxToken: string;
  mapSync: MapSync;
};

/**
 * Its own component so the forecast and slot arrive as separate props: React
 * Compiler then reuses the collection across clock ticks, and mapbox only
 * re-uploads when the slot or the data change.
 */
const PredictedMap = ({
  liveCollection,
  forecast,
  slotIndex,
  routes,
  mapboxToken,
  mapSync,
}: MapProps & { forecast: SerializedForecast; slotIndex: number }) => (
  <TrafficMap
    featureCollection={toForecastFeatureCollection(
      liveCollection,
      forecast,
      slotIndex,
    )}
    routes={routes}
    mapboxToken={mapboxToken}
    mapSync={mapSync}
    speedLabel="Predicted"
  />
);

export const PredictedTrafficSection = ({
  selected,
  ...mapProps
}: MapProps & { selected: ReturnType<typeof selectForecastSlot> }) => (
  <section className="min-w-0">
    <div className="mb-2 flex items-center justify-between">
      <h2 className="font-semibold">Predicted traffic</h2>
      <span className="text-xs text-muted-foreground">
        {selected ? formatClock(selected.slotStart) : "Unavailable"}
      </span>
    </div>
    <div className="h-[70vh] min-h-96 overflow-hidden rounded-lg border">
      {selected ? (
        <PredictedMap
          {...mapProps}
          forecast={selected.forecast}
          slotIndex={selected.slotIndex}
        />
      ) : (
        <div className="flex size-full items-center justify-center bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No current prediction is available. The predictor needs recorded
            history and runs every 15 minutes; this map updates when a new run
            arrives.
          </p>
        </div>
      )}
    </div>
  </section>
);
