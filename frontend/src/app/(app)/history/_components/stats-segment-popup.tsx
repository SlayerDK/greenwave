"use client";

import {
  findStatsSegment,
  percentOfBaseline,
} from "@/app/(app)/history/_lib/slot-features";
import { congestionLabel } from "@/components/traffic/congestion-style";
import {
  PopupRow,
  SegmentPopupFrame,
} from "@/components/traffic/segment-popup-frame";
import { type SerializedTrafficStatsRoute } from "@/lib/traffic-stats/serialization";
import { type CongestionLevel } from "@/lib/traffic/serialization";

export type StatsSelection = {
  segmentKey: string;
  routeId: number;
  longitude: number;
  latitude: number;
};

/**
 * Looked up on every render rather than captured at click time, so an open
 * popup follows the timeline. Says "of 06:00 speed", never "free flow": the
 * baseline is the first slot, and plenty of segments are faster later on.
 */
export const StatsSegmentPopup = ({
  selection,
  routes,
  slotIndex,
  congestion,
  onClose,
}: {
  selection: StatsSelection;
  routes: readonly SerializedTrafficStatsRoute[];
  slotIndex: number;
  congestion: CongestionLevel;
  onClose: () => void;
}) => {
  const found = findStatsSegment(
    routes,
    selection.routeId,
    selection.segmentKey,
  );
  if (!found) return null;

  const { route, segment } = found;

  return (
    <SegmentPopupFrame
      longitude={selection.longitude}
      latitude={selection.latitude}
      title={congestionLabel(congestion)}
      subtitle={`${route.name} · ${segment.streetName}`}
      onClose={onClose}
    >
      <PopupRow label="Average speed">
        {Math.round(segment.harmonicAverageSpeeds[slotIndex])} km/h
      </PopupRow>
      <PopupRow label="At 06:00">
        {Math.round(segment.harmonicAverageSpeeds[0])} km/h
      </PopupRow>
      <PopupRow label="Of 06:00 speed">
        {percentOfBaseline(segment.travelTimeRatios[slotIndex])}%
      </PopupRow>
      <PopupRow label="Speed limit">{segment.speedLimit} km/h</PopupRow>
      <PopupRow label="Length">{Math.round(segment.lengthMeters)} m</PopupRow>
      <PopupRow label="Samples">
        {segment.sampleSizes[slotIndex].toLocaleString("en")}
      </PopupRow>
    </SegmentPopupFrame>
  );
};
