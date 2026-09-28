import { type CongestionLevel } from "@/lib/traffic/serialization";
import { type LayerProps } from "react-map-gl/mapbox";

export const TRAFFIC_LAYER_ID = "traffic-segments";

/**
 * Hex, not the `oklch()` used everywhere else in the app: Mapbox parses colours
 * itself for the WebGL canvas and has no `oklch` support, so an oklch value
 * renders fine in the DOM legend and silently fails on the map — precisely the
 * drift this single source of truth exists to prevent.
 *
 * Lightness climbs from `closed` through `light` so the severity ramp survives
 * as an *order* in greyscale and under red-green colour blindness, rather than
 * relying on hue alone. `free` is set apart by hue instead, as it is the
 * "nothing to look at" case.
 */
export const CONGESTION_STYLE = [
  { level: "closed", color: "#7f1d1d", label: "Closed" },
  { level: "heavy", color: "#dc2626", label: "Heavy" },
  { level: "moderate", color: "#f97316", label: "Moderate" },
  { level: "light", color: "#facc15", label: "Light" },
  { level: "free", color: "#22c55e", label: "Free flow" },
] as const satisfies readonly {
  level: CongestionLevel;
  label: string;
  color: string;
}[];

/** Only reachable if `classifyCongestion` gains a level this file has not. */
const UNKNOWN_COLOR = "#94a3b8";

export const congestionLabel = (level: CongestionLevel): string =>
  CONGESTION_STYLE.find((entry) => entry.level === level)?.label ?? "Unknown";

/**
 * A categorical `match` on the congestion level the server already computed,
 * not an `interpolate` over speed: `closed` is a state rather than a point on a
 * speed scale, and duplicating the thresholds from `classifyCongestion` here
 * would give them two homes.
 */
export const trafficLineLayer: LayerProps = {
  id: TRAFFIC_LAYER_ID,
  type: "line",
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-color": [
      "match",
      ["get", "congestion"],
      ...CONGESTION_STYLE.flatMap(({ level, color }) => [level, color]),
      UNKNOWN_COLOR,
    ],
    "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 6],
    "line-opacity": 0.9,
  },
};
