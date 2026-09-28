import { type TrafficSnapshot } from "@/generated/prisma/client";
import {
  segmentSpeedsSchema,
  type TomTomPoint,
  type TomTomRouteDetails,
  type TomTomSegment,
} from "@/lib/traffic/schema";
import {
  type BBox,
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
  congestion: CongestionLevel;
  currentSpeed: number;
  typicalSpeed: number;
  averageSpeed: number;
  relativeSpeed: number;
  segmentLength: number;
  confidence: number;
};

export type TrafficFeatureCollection = FeatureCollection<
  LineString,
  TrafficSegmentProperties
>;

type TrafficSegmentFeature = Feature<LineString, TrafficSegmentProperties>;

/** `segmentIdStr`, never `segmentId` — see the note in schema.ts. */
const toSegmentFeature = (segment: TomTomSegment): TrafficSegmentFeature => ({
  type: "Feature",
  id: segment.segmentIdStr,
  geometry: {
    type: "LineString",
    coordinates: toPositions(segment.shape),
  },
  properties: {
    segmentIdStr: segment.segmentIdStr,
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
const computeBbox = (features: TrafficSegmentFeature[]): BBox | undefined => {
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
  const features = details.detailedSegments.map(toSegmentFeature);
  const featureCollection: TrafficFeatureCollection = {
    type: "FeatureCollection",
    bbox: computeBbox(features),
    features,
  };

  return {
    summary: {
      routeId: details.routeId,
      routeName: details.routeName,
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
 * Prisma returns `segmentSpeeds` as an opaque `JsonValue`; validating it is the
 * boundary rule, and it keeps the one sanctioned `as` cast in routes.ts alone.
 */
export const serializeTrafficSnapshot = (snapshot: TrafficSnapshot) => ({
  ...snapshot,
  recordedAt: snapshot.recordedAt.toISOString(),
  segmentSpeeds: segmentSpeedsSchema.parse(snapshot.segmentSpeeds),
});

export type SerializedTrafficSnapshot = ReturnType<
  typeof serializeTrafficSnapshot
>;
