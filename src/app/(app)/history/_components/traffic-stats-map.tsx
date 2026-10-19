"use client";

import {
  StatsSegmentPopup,
  type StatsSelection,
} from "@/app/(app)/history/_components/stats-segment-popup";
import {
  clickedStatsSegmentSchema,
  type StatsSegmentProperties,
} from "@/app/(app)/history/_lib/slot-features";
import {
  TrafficLineMap,
  type MapHit,
} from "@/components/traffic/traffic-line-map";
import { type SerializedTrafficStatsRoute } from "@/lib/traffic-stats/serialization";
import { type LineFeatureCollection } from "@/lib/traffic/serialization";

const toSelection = (hit: MapHit | null): StatsSelection | null => {
  const parsed = clickedStatsSegmentSchema.safeParse(hit?.properties);
  if (!hit || !parsed.success) return null;

  return { ...parsed.data, longitude: hit.longitude, latitude: hit.latitude };
};

export const TrafficStatsMap = ({
  featureCollection,
  routes,
  slotIndex,
  selection,
  onSelectionChange,
  mapboxToken,
}: {
  featureCollection: LineFeatureCollection<StatsSegmentProperties>;
  routes: readonly SerializedTrafficStatsRoute[];
  slotIndex: number;
  selection: StatsSelection | null;
  onSelectionChange: (selection: StatsSelection | null) => void;
  mapboxToken: string;
}) => {
  const congestion = featureCollection.features.find(
    ({ properties }) => properties.segmentKey === selection?.segmentKey,
  )?.properties.congestion;

  return (
    <TrafficLineMap
      featureCollection={featureCollection}
      mapboxToken={mapboxToken}
      onHit={(hit) => onSelectionChange(toSelection(hit))}
    >
      {selection && congestion && (
        <StatsSegmentPopup
          selection={selection}
          routes={routes}
          slotIndex={slotIndex}
          congestion={congestion}
          onClose={() => onSelectionChange(null)}
        />
      )}
    </TrafficLineMap>
  );
};
