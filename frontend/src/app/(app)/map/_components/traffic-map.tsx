"use client";

import { MapSyncBinding } from "@/app/(app)/map/_components/map-sync-binding";
import { SegmentPopup } from "@/app/(app)/map/_components/segment-popup";
import { type MapSync } from "@/app/(app)/map/_lib/map-sync";
import {
  clickedSegmentSchema,
  type Selection,
} from "@/app/(app)/map/_lib/segment-lookup";
import {
  TrafficLineMap,
  type MapHit,
} from "@/components/traffic/traffic-line-map";
import {
  type SerializedLiveRoute,
  type TrafficFeatureCollection,
} from "@/lib/traffic/serialization";
import { useState } from "react";

/**
 * Matched on `segmentIdStr`, never on the feature `id` — mapbox-gl runs
 * `parseInt` over ids when it builds the tile feature, which silently rounds
 * every TomTom id past Number.MAX_SAFE_INTEGER. Properties survive intact.
 */
const toSelection = (hit: MapHit | null): Selection | null => {
  const parsed = clickedSegmentSchema.safeParse(hit?.properties);
  if (!hit || !parsed.success) return null;

  return {
    segmentIdStr: parsed.data.segmentIdStr,
    longitude: hit.longitude,
    latitude: hit.latitude,
  };
};

export const TrafficMap = ({
  featureCollection,
  routes,
  mapboxToken,
  mapSync,
  speedLabel = "Current",
}: {
  featureCollection: TrafficFeatureCollection;
  /** Only so the popup can name the road a clicked segment belongs to. */
  routes: SerializedLiveRoute[];
  mapboxToken: string;
  mapSync: MapSync;
  speedLabel?: "Current" | "Predicted";
}) => {
  const [selection, setSelection] = useState<Selection | null>(null);

  return (
    <TrafficLineMap
      featureCollection={featureCollection}
      mapboxToken={mapboxToken}
      onHit={(hit) => setSelection(toSelection(hit))}
    >
      <MapSyncBinding mapSync={mapSync} />
      {selection && (
        <SegmentPopup
          selection={selection}
          features={featureCollection.features}
          routes={routes}
          speedLabel={speedLabel}
          onClose={() => setSelection(null)}
        />
      )}
    </TrafficLineMap>
  );
};
