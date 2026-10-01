"use client";

import { congestionLabel } from "@/app/(app)/map/_lib/congestion-style";
import {
  findSegment,
  type Selection,
} from "@/app/(app)/map/_lib/segment-lookup";
import {
  type SerializedRouteTraffic,
  type TrafficFeatureCollection,
} from "@/lib/traffic/serialization";
import { Popup } from "react-map-gl/mapbox";

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
    <Popup
      anchor="bottom"
      longitude={selection.longitude}
      latitude={selection.latitude}
      onClose={onClose}
      closeOnClick={false}
      maxWidth="280px"
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium">{congestionLabel(segment.congestion)}</p>
        {routeName && (
          <p className="text-xs text-muted-foreground">{routeName}</p>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Current</dt>
          <dd>{segment.currentSpeed} km/h</dd>
          <dt className="text-muted-foreground">Typical</dt>
          <dd>{segment.typicalSpeed} km/h</dd>
          <dt className="text-muted-foreground">Of free flow</dt>
          <dd>{segment.relativeSpeed}%</dd>
          <dt className="text-muted-foreground">Length</dt>
          <dd>{segment.segmentLength} m</dd>
          <dt className="text-muted-foreground">Confidence</dt>
          <dd>{segment.confidence}%</dd>
        </dl>
      </div>
    </Popup>
  );
};
