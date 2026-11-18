import {
  observationSchema,
  toEventId,
  type Observation,
} from "@greenwave/shared";
import {
  describeFirstIssue,
  TrafficError,
  type TomTomPoint,
  type TomTomRouteDetails,
} from "./tomtom-schema";

type Position = [longitude: number, latitude: number];

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

const toRouteLabel = (routeName: string): string =>
  routeName.startsWith(ROUTE_NAME_PREFIX)
    ? routeName.slice(ROUTE_NAME_PREFIX.length)
    : routeName;

type ReadingContext = Pick<Observation, "cityId" | "observedAt" | "source">;

/**
 * The one place TomTom's format becomes the shared contract. The schema check
 * at the end turns a value the contract rejects (a fractional speed, say) into
 * the same `invalid_response` a TomTom shape change gives, so it never reaches
 * the broker.
 */
export const toObservation = (
  details: TomTomRouteDetails,
  { cityId, observedAt, source }: ReadingContext,
): Observation => {
  const routeId = String(details.routeId);
  const parsed = observationSchema.safeParse({
    eventId: toEventId(cityId, routeId, observedAt),
    schemaVersion: 1,
    source,
    cityId,
    routeId,
    observedAt,
    route: {
      name: toRouteLabel(details.routeName),
      lengthM: details.routeLength,
      travelTimeSec: details.travelTime,
      typicalTravelTimeSec: details.typicalTravelTime,
      delaySec: details.delayTime,
      passable: details.passable,
    },
    // `segmentIdStr`, never `segmentId` — see the note in tomtom-schema.ts.
    segments: details.detailedSegments.map((segment) => ({
      id: segment.segmentIdStr,
      lengthM: segment.segmentLength,
      currentSpeedKmh: segment.currentSpeed,
      averageSpeedKmh: segment.averageSpeed,
      typicalSpeedKmh: segment.typicalSpeed,
      relativeSpeedPct: segment.relativeSpeed,
      confidencePct: segment.confidence,
      coordinates: toPositions(segment.shape),
    })),
  } satisfies Observation);

  if (!parsed.success)
    throw new TrafficError(
      "invalid_response",
      502,
      describeFirstIssue(parsed.error),
    );

  return parsed.data;
};
