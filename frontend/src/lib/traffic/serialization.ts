import type { NetworkRouteFromDb } from "@/lib/traffic/queries";
import {
  type TomTomPoint,
  type TomTomRouteDetails,
  type TomTomSegment,
} from "@/lib/traffic/schema";
import type { RouteState } from "@greenwave/shared";
import {
  adapterStatusSchema,
  cityOfStatusTopic,
  classifyCongestion,
  STATE_TTL_SECONDS,
  stateSchema,
  type CongestionLevel,
} from "@greenwave/shared";
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

/** Every coordinate list goes through here. */
const toPositions = (points: TomTomPoint[]): Position[] =>
  points.map(toPosition);

/**
 * TomTom prefixes the twelve Aarhus corridor routes with an internal marker —
 * "CW_AU_Randersvej sydgående" — while the two Ringvejen routes carry none.
 * Trimmed rather than replaced from a curated table so an upstream rename
 * reaches the UI instead of silently disagreeing with it.
 */
const ROUTE_NAME_PREFIX = "CW_AU_";

export const toRouteLabel = (routeName: string): string =>
  routeName.startsWith(ROUTE_NAME_PREFIX)
    ? routeName.slice(ROUTE_NAME_PREFIX.length)
    : routeName;

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
  /** Drawn grey: the reading is too old, or the segment has no forecast. */
  stale?: boolean;
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

export type LineFeatureCollection<Properties> = Omit<
  FeatureCollection<LineString, Properties>,
  "bbox"
> & { bbox?: TrafficBbox };

export type TrafficFeatureCollection =
  LineFeatureCollection<TrafficSegmentProperties>;

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
export const computeBbox = (
  lines: readonly Position[][],
): TrafficBbox | undefined => {
  const positions = lines.flat();
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
    bbox: computeBbox(features.map((feature) => feature.geometry.coordinates)),
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

export type SerializedLiveRoute = {
  summary: {
    cityId: string;
    routeId: number;
    routeName: string;
    passable: boolean;
    routeLength: number;
    travelTime: number;
    typicalTravelTime: number;
    delayTime: number;
    observedAt: string;
    congestedSince: string | null;
    slowerThanUsualSince: string | null;
  };
  featureCollection: TrafficFeatureCollection;
};

export type LiveNetworkTraffic = { routes: SerializedLiveRoute[] };

const serializeLiveRoute = (
  row: NetworkRouteFromDb,
): SerializedLiveRoute | null => {
  if (!row.state) return null;
  const segments = row.segments.filter(
    (
      segment,
    ): segment is typeof segment & {
      state: NonNullable<typeof segment.state>;
    } => segment.state !== null,
  );

  return {
    summary: {
      cityId: row.cityId,
      routeId: Number(row.id),
      routeName: row.name,
      passable: row.state.passable,
      routeLength: row.lengthM,
      travelTime: row.state.travelTimeSec,
      typicalTravelTime: row.state.typicalTravelTimeSec,
      delayTime: row.state.delaySec,
      observedAt: row.state.observedAt.toISOString(),
      congestedSince: row.state.congestedSince?.toISOString() ?? null,
      slowerThanUsualSince:
        row.state.slowerThanUsualSince?.toISOString() ?? null,
    },
    featureCollection: {
      type: "FeatureCollection",
      bbox: computeBbox(
        segments.map((segment) => segment.coordinates as Position[]),
      ),
      features: segments.map((segment) => ({
        type: "Feature",
        id: segment.id,
        geometry: {
          type: "LineString",
          coordinates: segment.coordinates as Position[],
        },
        properties: {
          segmentIdStr: segment.id,
          routeId: Number(row.id),
          congestion: segment.state.congestion,
          currentSpeed: segment.state.currentSpeedKmh,
          typicalSpeed: segment.state.typicalSpeedKmh,
          averageSpeed: segment.state.averageSpeedKmh,
          relativeSpeed: segment.state.relativeSpeedPct,
          segmentLength: segment.lengthM,
          confidence: segment.state.confidencePct,
        },
      })),
    },
  };
};

export const serializeNetworkFromDb = (
  rows: readonly NetworkRouteFromDb[],
): LiveNetworkTraffic => ({
  routes: rows.flatMap((row) => {
    const route = serializeLiveRoute(row);
    return route ? [route] : [];
  }),
});

/**
 * A state message carries its own geometry, so it builds a whole route: one
 * that was missing from the first paint can join the map without a reload.
 */
export const serializeRouteState = (state: RouteState): SerializedLiveRoute => {
  const routeId = Number(state.routeId);

  return {
    summary: {
      cityId: state.cityId,
      routeId,
      routeName: state.route.name,
      passable: state.route.passable,
      routeLength: state.route.lengthM,
      travelTime: state.route.travelTimeSec,
      typicalTravelTime: state.route.typicalTravelTimeSec,
      delayTime: state.route.delaySec,
      observedAt: new Date(state.observedAt).toISOString(),
      congestedSince: state.route.congestedSince
        ? new Date(state.route.congestedSince).toISOString()
        : null,
      slowerThanUsualSince: state.route.slowerThanUsualSince
        ? new Date(state.route.slowerThanUsualSince).toISOString()
        : null,
    },
    featureCollection: {
      type: "FeatureCollection",
      bbox: computeBbox(state.segments.map((segment) => segment.coordinates)),
      features: state.segments.map((segment) => ({
        type: "Feature",
        id: segment.id,
        geometry: { type: "LineString", coordinates: segment.coordinates },
        properties: {
          segmentIdStr: segment.id,
          routeId,
          congestion: segment.congestion,
          currentSpeed: segment.currentSpeedKmh,
          typicalSpeed: segment.typicalSpeedKmh,
          averageSpeed: segment.averageSpeedKmh,
          relativeSpeed: segment.relativeSpeedPct,
          segmentLength: segment.lengthM,
          confidence: segment.confidencePct,
        },
      })),
    },
  };
};

/**
 * Replaces a route only with a newer reading and appends one it has not seen.
 * Returns the same object for a no-op, so React and mapbox do no work.
 */
export const applyRouteState = (
  network: LiveNetworkTraffic,
  next: SerializedLiveRoute,
): LiveNetworkTraffic => {
  const isSameRoute = ({ summary }: SerializedLiveRoute) =>
    summary.cityId === next.summary.cityId &&
    summary.routeId === next.summary.routeId;

  const existing = network.routes.find(isSameRoute);
  if (!existing) return { routes: [...network.routes, next] };

  const isNewer =
    new Date(next.summary.observedAt) > new Date(existing.summary.observedAt);
  if (!isNewer) return network;

  return {
    routes: network.routes.map((route) => (isSameRoute(route) ? next : route)),
  };
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Broker input is untrusted, so anything malformed is null. That includes the
 * empty payload of a cleared retained topic.
 */
export const parseLiveMessage = (topic: string, text: string) => {
  const value = parseJson(text);

  if (topic.endsWith("/state")) {
    const state = stateSchema.safeParse(value);
    return state.success
      ? { kind: "state" as const, route: serializeRouteState(state.data) }
      : null;
  }

  const status = adapterStatusSchema.safeParse(value);
  return status.success
    ? {
        kind: "status" as const,
        cityId: cityOfStatusTopic(topic),
        offline: status.data.status === "offline",
      }
    : null;
};

/** Returns the same array when nothing changed, so React skips the render. */
export const updateOfflineCities = (
  cities: string[],
  cityId: string,
  offline: boolean,
) => {
  if (cities.includes(cityId) === offline) return cities;

  return offline
    ? [...cities, cityId]
    : cities.filter((city) => city !== cityId);
};

/** Exactly `STATE_TTL_SECONDS` old still counts as fresh. */
export const isRouteStale = (observedAt: string, now: number) =>
  now - new Date(observedAt).getTime() > STATE_TTL_SECONDS * 1000;

/**
 * A string so the clock's tick changes it only when a route actually crosses
 * the threshold. Otherwise every tick would re-upload ~1,100 segments to mapbox.
 */
export const staleRouteKey = (
  routes: readonly SerializedLiveRoute[],
  now: number,
) =>
  routes
    .filter(({ summary }) => isRouteStale(summary.observedAt, now))
    .map(({ summary }) => summary.routeId)
    .join(",");

export const toLiveFeatureCollection = (
  routes: readonly SerializedLiveRoute[],
  staleKey: string,
) => {
  const staleRouteIds = new Set(
    staleKey.split(",").filter(Boolean).map(Number),
  );

  return mergeFeatureCollections(
    routes.map(({ summary, featureCollection }) => ({
      ...featureCollection,
      features: featureCollection.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          stale: staleRouteIds.has(summary.routeId),
        },
      })),
    })),
  );
};
