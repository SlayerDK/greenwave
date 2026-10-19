"use client";

import {
  TRAFFIC_LAYER_ID,
  trafficLineLayer,
} from "@/components/traffic/congestion-style";
import {
  type LineFeatureCollection,
  type TrafficBbox,
} from "@/lib/traffic/serialization";
import { type GeoJsonProperties } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTheme } from "next-themes";
import { type ReactNode } from "react";
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

/** Only reached if there is nothing to frame. */
const FALLBACK_VIEW = { longitude: 10.2039, latitude: 56.1629, zoom: 11 };

const toMapStyle = (resolvedTheme: string | undefined) =>
  resolvedTheme === "dark"
    ? "mapbox://styles/mapbox/dark-v11"
    : "mapbox://styles/mapbox/light-v11";

/**
 * The collection arrives already framed, in RFC 7946 order
 * [west, south, east, north] — so the view fits whatever is drawn.
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

/** A clicked feature's raw properties — each map parses its own shape. */
export type MapHit = {
  properties: unknown;
  longitude: number;
  latitude: number;
};

/**
 * Queried as a box rather than the bare click point: the rendered line is only
 * 2-6px wide, and an exact-pixel hit test makes segments nearly impossible to
 * select.
 *
 * Callers match on properties, never on the feature `id` — mapbox-gl runs
 * `parseInt` over ids when it builds the tile feature, so string ids and
 * numbers past Number.MAX_SAFE_INTEGER do not survive. Properties do.
 */
const toHit = (event: MapMouseEvent): MapHit | null => {
  const { x, y } = event.point;
  const [feature] = event.target.queryRenderedFeatures(
    [
      [x - CLICK_TOLERANCE, y - CLICK_TOLERANCE],
      [x + CLICK_TOLERANCE, y + CLICK_TOLERANCE],
    ],
    { layers: [TRAFFIC_LAYER_ID] },
  );
  if (!feature) return null;

  return {
    properties: feature.properties,
    longitude: event.lngLat.lng,
    latitude: event.lngLat.lat,
  };
};

/**
 * The basemap, controls and congestion-coloured line layer both traffic pages
 * share. Features need a `congestion` property; the popup is the caller's.
 */
export const TrafficLineMap = ({
  featureCollection,
  mapboxToken,
  onHit,
  children,
}: {
  featureCollection: LineFeatureCollection<GeoJsonProperties>;
  mapboxToken: string;
  /** `null` when the click landed on no segment. */
  onHit: (hit: MapHit | null) => void;
  children?: ReactNode;
}) => {
  const { resolvedTheme } = useTheme();

  return (
    <Map
      reuseMaps
      mapboxAccessToken={mapboxToken}
      mapStyle={toMapStyle(resolvedTheme)}
      initialViewState={toInitialViewState(featureCollection.bbox)}
      style={FILL_PARENT}
      onClick={(event) => onHit(toHit(event))}
    >
      <NavigationControl position="top-right" />
      <ScaleControl position="bottom-left" />

      <Source id="traffic" type="geojson" data={featureCollection}>
        <Layer {...trafficLineLayer} />
      </Source>

      {children}
    </Map>
  );
};
