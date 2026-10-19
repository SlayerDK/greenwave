"use client";

import {
  findSegment,
  type Selection,
} from "@/app/(app)/map/_lib/segment-lookup";
import { congestionLabel } from "@/components/traffic/congestion-style";
import {
  PopupRow,
  SegmentPopupFrame,
} from "@/components/traffic/segment-popup-frame";
import {
  type SerializedRouteTraffic,
  type TrafficFeatureCollection,
} from "@/lib/traffic/serialization";

/**
 * The feature is looked up from the live collection on every render rather than
 * captured at click time, so an open popup picks up new speeds on the next poll
 * instead of showing a frozen reading.
 */
export const SegmentPopup = ({
  selection,
  features,
  routes,
  onClose,
}: {
  selection: Selection;
  features: TrafficFeatureCollection["features"];
  routes: SerializedRouteTraffic[];
  onClose: () => void;
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
      title={congestionLabel(segment.congestion)}
      subtitle={routeName}
      onClose={onClose}
    >
      <PopupRow label="Current">{segment.currentSpeed} km/h</PopupRow>
      <PopupRow label="Typical">{segment.typicalSpeed} km/h</PopupRow>
      <PopupRow label="Of free flow">{segment.relativeSpeed}%</PopupRow>
      <PopupRow label="Length">{segment.segmentLength} m</PopupRow>
      <PopupRow label="Confidence">{segment.confidence}%</PopupRow>
    </SegmentPopupFrame>
  );
};
