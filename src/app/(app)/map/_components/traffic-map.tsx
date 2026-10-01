"use client";

import { SegmentPopup } from "@/app/(app)/map/_components/segment-popup";
import {
  TRAFFIC_LAYER_ID,
  trafficLineLayer,
} from "@/app/(app)/map/_lib/congestion-style";
import {
  clickedSegmentSchema,
  type Selection,
} from "@/app/(app)/map/_lib/segment-lookup";
import {
  type SerializedRouteTraffic,
  type TrafficBbox,
  type TrafficFeatureCollection,
} from "@/lib/traffic/serialization";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "next-themes";
import { useState } from "react";
import {
  Layer,
  Map,
  NavigationControl,
  ScaleControl,
  Source,
  type LngLatBoundsLike,
  type MapMouseEvent,
} from "react-map-gl/mapbox";

const FILL_PARENT = { width: "100%", height: "100%" };

/** Only reached if every monitored route failed, leaving nothing to frame. */
const FALLBACK_VIEW = { longitude: 10.2039, latitude: 56.1629, zoom: 11 };

const toMapStyle = (resolvedTheme: string | undefined) =>
  resolvedTheme === "dark"
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/light-v11";

/**
 * The merged collection arrives already framed, in RFC 7946 order
 * [west, south, east, north] — so the view fits whichever routes came back.
 */
const toBounds = (bbox: TrafficBbox): LngLatBoundsLike => {
  const [west, south, east, north] = bbox;

  return [
    [west, south],
    [east, north],
  ];
};

const toInitialViewState = (bbox: TrafficBbox | undefined) =>
  bbox
    ? { bounds: toBounds(bbox), fitBoundsOptions: { padding: 48 } }
    : FALLBACK_VIEW;

/** Half-width, in pixels, of the box a click is tested against. */
const CLICK_TOLERANCE = 6;

/**
 * Queried as a box rather than the bare click point: the rendered line is only
 * 2-6px wide, and an exact-pixel hit test makes segments nearly impossible to
 * select.
 *
 * Matched on `segmentIdStr`, never on the feature `id` — mapbox-gl runs
 * `parseInt` over ids when it builds the tile feature, which silently rounds
 * every TomTom id past Number.MAX_SAFE_INTEGER. Properties survive intact.
 */
const toSelection = (event: MapMouseEvent): Selection | null => {
  const { x, y } = event.point;
  const [feature] = event.target.queryRenderedFeatures(
    [
      [x - CLICK_TOLERANCE, y - CLICK_TOLERANCE],
      [x + CLICK_TOLERANCE, y + CLICK_TOLERANCE],
    ],
    { layers: [TRAFFIC_LAYER_ID] },
  );

  const parsed = clickedSegmentSchema.safeParse(feature?.properties);
  if (!parsed.success) return null;

  return {
    segmentIdStr: parsed.data.segmentIdStr,
    longitude: event.lngLat.lng,
    latitude: event.lngLat.lat,
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
  const { resolvedTheme } = useTheme();
  const [selection, setSelection] = useState<Selection | null>(null);

  return (
    <Map
      reuseMaps
      mapboxAccessToken={mapboxToken}
      mapStyle={toMapStyle(resolvedTheme)}
      initialViewState={toInitialViewState(featureCollection.bbox)}
      style={FILL_PARENT}
      onClick={(event) => setSelection(toSelection(event))}
    >
      <NavigationControl position="top-right" />
      <ScaleControl position="bottom-left" />

      <Source id="traffic" type="geojson" data={featureCollection}>
        <Layer {...trafficLineLayer} />
      </Source>

      {selection && (
        <SegmentPopup
          selection={selection}
          features={featureCollection.features}
          routes={routes}
          onClose={() => setSelection(null)}
        />
      )}
    </Map>
  );
};
