import {
  type TomTomPoint,
  type TomTomRouteDetails,
  type TomTomSegment,
} from "@/lib/traffic/schema";
import {
  type Feature,
  type FeatureCollection,
  type LineString,
  type Position,
} from "geojson";

/**
 * TomTom returns `{ latitude, longitude }`; RFC 7946 §3.1.1 mandates
 * `[longitude, latitude]`. Every coordinate goes through here so the flip
 * cannot be applied to some geometries and not others.
 */
const toPosition = ({ latitude, longitude }: TomTomPoint): Position => [
  longitude,
  latitude,
];

/** Used by both the GeoJSON output and the stored segment geometry. */
export const toPositions = (points: TomTomPoint[]): Position[] =>
  points.map(toPosition);

/**
 * TomTom prefixes the twelve Aarhus corridor routes with an internal marker —
 * "CW_AU_Randersvej sydgående" — while the two Ringvejen routes carry none.
 * Trimmed rather than replaced from a curated table so an upstream rename
 * reaches the UI instead of silently disagreeing with it.
 *
 * `mutations.ts` applies this too, so the stored route name matches what the
 * dashboard shows.
 */
const ROUTE_NAME_PREFIX = "CW_AU_";

export const toRouteLabel = (routeName: string): string =>
  routeName.startsWith(ROUTE_NAME_PREFIX)
    ? routeName.slice(ROUTE_NAME_PREFIX.length)
    : routeName;

/**
 * `relativeSpeed` is current speed as a percentage of free flow. A segment
 * closed to traffic reports `currentSpeed: 0`, which TomTom documents explicitly.
 */
const classifyCongestion = ({ currentSpeed, relativeSpeed }: TomTomSegment) => {
  if (currentSpeed === 0) return "closed";
  if (relativeSpeed < 50) return "heavy";
  if (relativeSpeed < 75) return "moderate";
  if (relativeSpeed < 90) return "light";

  return "free";
};

export type CongestionLevel = ReturnType<typeof classifyCongestion>;

export type TrafficSegmentProperties = {
  segmentIdStr: string;
  /**
   * Which route the segment belongs to. Every route's segments share one
   * collection, so this is how the popup names the road that was clicked — a
   * number rather than the label, which would repeat a string 1079 times.
   */
  routeId: number;
  congestion: CongestionLevel;
  currentSpeed: number;
  typicalSpeed: number;
  averageSpeed: number;
  relativeSpeed: number;
  segmentLength: number;
  confidence: number;
};

/**
 * geojson's `BBox` also admits a six-element form carrying altitudes, on which
 * index 2 is a height rather than the eastern edge. Road geometry is flat, so
 * narrowing here is what stops a consumer from reading the wrong element — the
 * 3D case then fails to compile instead of silently framing the map nowhere.
 */
export type TrafficBbox = [
  west: number,
  south: number,
  east: number,
  north: number,
];

export type TrafficFeatureCollection = Omit<
  FeatureCollection<LineString, TrafficSegmentProperties>,
  "bbox"
> & { bbox?: TrafficBbox };

type TrafficSegmentFeature = Feature<LineString, TrafficSegmentProperties>;

/** `segmentIdStr`, never `segmentId` — see the note in schema.ts. */
const toSegmentFeature = (
  segment: TomTomSegment,
  routeId: number,
): TrafficSegmentFeature => ({
  type: "Feature",
  id: segment.segmentIdStr,
  geometry: {
    type: "LineString",
    coordinates: toPositions(segment.shape),
  },
  properties: {
    segmentIdStr: segment.segmentIdStr,
    routeId,
    congestion: classifyCongestion(segment),
    currentSpeed: segment.currentSpeed,
    typicalSpeed: segment.typicalSpeed,
    averageSpeed: segment.averageSpeed,
    relativeSpeed: segment.relativeSpeed,
    segmentLength: segment.segmentLength,
    confidence: segment.confidence,
  },
});

/** RFC 7946 §5 order: [west, south, east, north]. */
const computeBbox = (
  features: TrafficSegmentFeature[],
): TrafficBbox | undefined => {
  const positions = features.flatMap((feature) => feature.geometry.coordinates);
  if (positions.length === 0) return undefined;

  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);

  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
};

/**
 * Route metadata stays beside the collection rather than becoming a foreign
 * member on it, so what reaches a map source is plainly RFC 7946 conformant.
 *
 * Intentionally unannotated: `SerializedRouteTraffic` is derived from it.
 */
export const serializeRouteTraffic = (
  details: TomTomRouteDetails,
  fetchedAt: string,
) => {
  const features = details.detailedSegments.map((segment) =>
    toSegmentFeature(segment, details.routeId),
  );
  const featureCollection: TrafficFeatureCollection = {
    type: "FeatureCollection",
    bbox: computeBbox(features),
    features,
  };

  return {
    summary: {
      routeId: details.routeId,
      routeName: toRouteLabel(details.routeName),
      routeStatus: details.routeStatus,
      passable: details.passable,
      routeLength: details.routeLength,
      travelTime: details.travelTime,
      typicalTravelTime: details.typicalTravelTime,
      delayTime: details.delayTime,
      completeness: details.completeness,
      routeConfidence: details.routeConfidence,
      fetchedAt,
    },
    featureCollection,
  };
};

export type SerializedRouteTraffic = ReturnType<typeof serializeRouteTraffic>;

/**
 * Unions the routes' own boxes rather than re-walking every coordinate: each
 * collection arrives already framed by `computeBbox`, so merging thirteen
 * 4-tuples beats a second pass over ~2900 positions.
 */
const unionBbox = (boxes: TrafficBbox[]): TrafficBbox | undefined => {
  const [first, ...rest] = boxes;
  if (!first) return undefined;

  return rest.reduce<TrafficBbox>(
    ([west, south, east, north], [w, s, e, n]) => [
      Math.min(west, w),
      Math.min(south, s),
      Math.max(east, e),
      Math.max(north, n),
    ],
    first,
  );
};

/**
 * Flattens every monitored route into the one collection a map source takes.
 *
 * Merged on the client rather than served pre-merged: the per-route collections
 * are what the summary list and the cache are keyed on, so shipping a combined
 * copy beside them would send the same ~1100 segments twice.
 */
export const mergeFeatureCollections = (
  collections: readonly TrafficFeatureCollection[],
): TrafficFeatureCollection => ({
  type: "FeatureCollection",
  bbox: unionBbox(collections.flatMap(({ bbox }) => (bbox ? [bbox] : []))),
  features: collections.flatMap(({ features }) => features),
});

/**
 * One route's read, already narrowed to what the client needs to know about it.
 * An expected upstream failure is a value here rather than a thrown error, so
 * one unreachable route cannot blank the other twelve.
 */
export type RouteOutcome =
  | { ok: true; details: TomTomRouteDetails; fetchedAt: string }
  | { ok: false; routeId: number; error: string };

export type RouteFailure = { routeId: number; error: string };

/**
 * Intentionally unannotated: `NetworkTraffic` is derived from it.
 */
export const serializeNetworkTraffic = (outcomes: readonly RouteOutcome[]) => ({
  routes: outcomes.flatMap((outcome) =>
    outcome.ok
      ? [serializeRouteTraffic(outcome.details, outcome.fetchedAt)]
      : [],
  ),
  failures: outcomes.flatMap((outcome): RouteFailure[] =>
    outcome.ok ? [] : [{ routeId: outcome.routeId, error: outcome.error }],
  ),
});

export type NetworkTraffic = ReturnType<typeof serializeNetworkTraffic>;
