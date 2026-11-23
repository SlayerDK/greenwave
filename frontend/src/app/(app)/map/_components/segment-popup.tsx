"use client";

import {
  findSegment,
  type Selection,
} from "@/app/(app)/map/_lib/segment-lookup";
import {
  congestionLabel,
  STALE_STYLE,
} from "@/components/traffic/congestion-style";
import {
  PopupRow,
  SegmentPopupFrame,
} from "@/components/traffic/segment-popup-frame";
import {
  type SerializedLiveRoute,
  type TrafficFeatureCollection,
  type TrafficSegmentProperties,
} from "@/lib/traffic/serialization";

type SpeedLabel = "Current" | "Predicted";

const popupTitle = (
  segment: TrafficSegmentProperties,
  speedLabel: SpeedLabel,
) => {
  if (!segment.stale) return congestionLabel(segment.congestion);

  return speedLabel === "Predicted" ? "No forecast" : STALE_STYLE.label;
};

const SpeedRows = ({
  segment,
  speedLabel,
}: {
  segment: TrafficSegmentProperties;
  speedLabel: SpeedLabel;
}) => (
  <>
    <PopupRow label={segment.stale ? "Last reading" : speedLabel}>
      {segment.currentSpeed} km/h
    </PopupRow>
    <PopupRow label="Typical">{segment.typicalSpeed} km/h</PopupRow>
    <PopupRow label="Of free flow">{segment.relativeSpeed}%</PopupRow>
  </>
);

const SegmentRows = ({
  segment,
  speedLabel,
}: {
  segment: TrafficSegmentProperties;
  speedLabel: SpeedLabel;
}) => {
  const isPrediction = speedLabel === "Predicted";

  return (
    <>
      {/* Without a forecast these values are still the live reading, so they
          must not appear on the predicted map. */}
      {!(isPrediction && segment.stale) && (
        <SpeedRows segment={segment} speedLabel={speedLabel} />
      )}
      <PopupRow label="Length">{segment.segmentLength} m</PopupRow>
      {!isPrediction && (
        <PopupRow label="Confidence">{segment.confidence}%</PopupRow>
      )}
    </>
  );
};

/**
 * The feature is looked up from the live collection on every render rather than
 * captured at click time, so an open popup picks up new speeds on the next
 * message instead of showing a frozen reading.
 */
export const SegmentPopup = ({
  selection,
  features,
  routes,
  onClose,
  speedLabel = "Current",
}: {
  selection: Selection;
  features: TrafficFeatureCollection["features"];
  routes: SerializedLiveRoute[];
  onClose: () => void;
  speedLabel?: SpeedLabel;
}) => {
  const feature = findSegment(features, selection.segmentIdStr);
  if (!feature) return null;

  const segment = feature.properties;

  // Every route's segments share one collection, so the road has to be named
  // from the segment's own `routeId` rather than assumed.
  const routeName = routes.find(
    ({ summary }) => summary.routeId === segment.routeId,
  )?.summary.routeName;

  return (
    <SegmentPopupFrame
      longitude={selection.longitude}
      latitude={selection.latitude}
      title={popupTitle(segment, speedLabel)}
      subtitle={routeName}
      onClose={onClose}
    >
      <SegmentRows segment={segment} speedLabel={speedLabel} />
    </SegmentPopupFrame>
  );
};
