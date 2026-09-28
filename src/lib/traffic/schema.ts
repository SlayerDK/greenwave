import { z } from "zod";

/** "Ringvejen sydgående" in Aarhus — the route this dashboard monitors by default. */
export const DEFAULT_ROUTE_ID = 56634;

/**
 * TomTom refreshes roughly once a minute. The server read cache, the client
 * poll interval, and the client stale window all derive from this one number:
 * a shorter poll would hammer a warm cache, a longer stale window would paint
 * data the cache had already replaced.
 */
export const TRAFFIC_REFRESH_SECONDS = 60;

export const trafficTag = (routeId: number) => `traffic-${routeId}`;

export const routeIdSchema = z.coerce.number().int().positive();

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
