"use client";

import { SegmentPopup } from "@/app/(app)/map/_components/segment-popup";
import {
  clickedSegmentSchema,
  type Selection,
} from "@/app/(app)/map/_lib/segment-lookup";
import {
  TrafficLineMap,
  type MapHit,
} from "@/components/traffic/traffic-line-map";
import {
  type SerializedRouteTraffic,
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
}: {
  featureCollection: TrafficFeatureCollection;
  /** Only so the popup can name the road a clicked segment belongs to. */
  routes: SerializedRouteTraffic[];
  mapboxToken: string;
}) => {
  const [selection, setSelection] = useState<Selection | null>(null);

  return (
    <TrafficLineMap
      featureCollection={featureCollection}
      mapboxToken={mapboxToken}
      onHit={(hit) => setSelection(toSelection(hit))}
    >
      {selection && (
        <SegmentPopup
          selection={selection}
          features={featureCollection.features}
          routes={routes}
          onClose={() => setSelection(null)}
        />
      )}
    </TrafficLineMap>
  );
};
