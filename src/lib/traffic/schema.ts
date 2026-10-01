import { z } from "zod";

/**
 * Every TomTom route this dashboard monitors, in display order: the two
 * Ringvejen directions followed by the Aarhus corridor pairs.
 *
 * It replaces the single default route id, and because no user input reaches a
 * route id any more it is also the allowlist — nothing can ask us to spend our
 * `TOMTOM_API_KEY` on a route that is not in here.
 */
export const MONITORED_ROUTE_IDS = [
  56634, 56628, 313719, 313720, 313721, 313722, 313723, 313724, 313725, 313726,
  313727, 313728, 313729,
] as const;

/**
 * TomTom refreshes roughly once a minute, which is how long a read stays in the
 * Next Data Cache. Nothing on the client polls, so this is now the server side
 * alone: it is the window within which pressing Refresh re-reads the cache
 * rather than spending thirteen upstream calls.
 */
export const TRAFFIC_REFRESH_SECONDS = 60;

export const trafficTag = (routeId: number) => `traffic-${routeId}`;

const tomtomPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

/**
 * `segmentId` is deliberately absent. Every id TomTom returns exceeds
 * Number.MAX_SAFE_INTEGER, so `JSON.parse` silently rounds it — 164 of the 165
 * ids on route 56634 come back corrupted. `segmentIdStr` is the same value as a
 * string, and keeping the lossy field out of the schema keeps it out of the domain.
 */
const tomtomSegmentSchema = z.object({
  segmentIdStr: z.string(),
  currentSpeed: z.number(),
  typicalSpeed: z.number(),
  averageSpeed: z.number(),
  relativeSpeed: z.number(),
  segmentLength: z.number(),
  confidence: z.number(),
  openLrId: z.string().optional(),
  openLrLength: z.number().optional(),
  shape: z.array(tomtomPointSchema).min(2),
});

export const tomtomRouteDetailsSchema = z.object({
  routeId: z.number(),
  routeName: z.string(),
  routeStatus: z.enum([
    "NEW",
    "ACTIVE",
    "PENDING_UPDATE",
    "MM_FAILED",
    "ARCHIVED",
  ]),
  routePathPoints: z.array(tomtomPointSchema),
  passable: z.boolean(),
  routeLength: z.number(),
  travelTime: z.number(),
  typicalTravelTime: z.number(),
  delayTime: z.number(),
  completeness: z.number(),
  routeConfidence: z.number(),
  typicalTravelTimeCoverage: z.number(),
  createdAt: z.string(),
  detailedSegments: z.array(tomtomSegmentSchema),
});

/** TomTom uses two unrelated error envelopes: `detailedError` on 401, `errorMessage` on 404. */
export const tomtomErrorBodySchema = z.union([
  z.object({
    detailedError: z.object({ code: z.string(), message: z.string() }),
  }),
  z.object({ errorMessage: z.string() }),
]);

export type TomTomPoint = z.infer<typeof tomtomPointSchema>;
export type TomTomSegment = z.infer<typeof tomtomSegmentSchema>;
export type TomTomRouteDetails = z.infer<typeof tomtomRouteDetailsSchema>;

export type TrafficErrorCode =
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "upstream"
  | "network"
  | "invalid_response";

/** Carries the HTTP status the route handler should surface, so it never re-sniffs messages. */
export class TrafficError extends Error {
  readonly code: TrafficErrorCode;
  readonly status: number;

  constructor(code: TrafficErrorCode, status: number, message: string) {
    super(message);
    this.name = "TrafficError";
    this.code = code;
    this.status = status;
  }
}
