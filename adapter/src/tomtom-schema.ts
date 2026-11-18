import { z } from "zod";

const tomtomPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

/**
 * `segmentId` is deliberately absent. Every id TomTom returns exceeds
 * Number.MAX_SAFE_INTEGER, so `JSON.parse` silently rounds it — 165 of the 166
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
export type TomTomRouteDetails = z.infer<typeof tomtomRouteDetailsSchema>;

export type TrafficErrorCode =
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "upstream"
  | "network"
  | "invalid_response";

/** An expected TomTom failure; the poll logs it and publishes nothing for that route. */
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

/** `"<path>: <message>"` for the first issue, e.g. `detailedSegments.3.currentSpeed: …`. */
export const describeFirstIssue = (error: z.ZodError) => {
  const [issue] = error.issues;

  return `${issue.path.join(".")}: ${issue.message}`;
};
