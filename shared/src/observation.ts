import { z } from "zod";

/** No "/", "+" or "#": an id becomes a topic level. */
const topicLevel = z.string().regex(/^[a-z0-9_-]+$/i);

export const toEventId = (
  cityId: string,
  routeId: string,
  observedAt: string,
) => `${cityId}:${routeId}:${observedAt}`;

/** Every speed, length and time is an integer in TomTom's payload. */
export const observationSegmentSchema = z.object({
  /** TomTom's `segmentIdStr`: the number exceeds `Number.MAX_SAFE_INTEGER`. */
  id: z.string(),
  lengthM: z.int().nonnegative(),
  currentSpeedKmh: z.int().nonnegative(),
  averageSpeedKmh: z.int().nonnegative(),
  typicalSpeedKmh: z.int().nonnegative(),
  relativeSpeedPct: z.int().nonnegative(),
  confidencePct: z.int().min(0).max(100),
  /** GeoJSON `[longitude, latitude]` pairs. */
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const observationRouteSchema = z.object({
  /** Without TomTom's `CW_AU_` prefix. */
  name: z.string(),
  lengthM: z.int().nonnegative(),
  travelTimeSec: z.int().nonnegative(),
  typicalTravelTimeSec: z.int().nonnegative(),
  delaySec: z.int(),
  passable: z.boolean(),
});

export const observationSchema = z
  .object({
    eventId: z.string(),
    schemaVersion: z.literal(1),
    source: z.enum(["live", "fixture", "loadtest"]),
    cityId: topicLevel,
    routeId: topicLevel,
    /** UTC with a "Z"; milliseconds allowed, which the load generator needs. */
    observedAt: z.iso.datetime(),
    route: observationRouteSchema,
    segments: z.array(observationSegmentSchema).min(1),
  })
  .refine((o) => o.eventId === toEventId(o.cityId, o.routeId, o.observedAt), {
    message: "eventId must be {cityId}:{routeId}:{observedAt}",
    path: ["eventId"],
  });

export type Observation = z.infer<typeof observationSchema>;
export type ObservationSegment = z.infer<typeof observationSegmentSchema>;
