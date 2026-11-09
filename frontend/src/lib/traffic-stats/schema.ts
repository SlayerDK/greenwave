import { z } from "zod";

/**
 * TomTom Traffic Stats route-analysis export, one file per route.
 *
 * No `server-only`: the import CLI runs under plain tsx and parses with this.
 * Only the fields the importer stores are declared; Zod strips the rest.
 */

/** GeoJSON order, `[longitude, latitude]` — the export is already RFC 7946. */
const positionSchema = z.tuple([z.number(), z.number()]);

/** Shared by the import and the read: `shape` comes back from Postgres as `Json`. */
export const positionsSchema = z.array(positionSchema).min(2);

const DAYS_OF_WEEK = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

const TIME_RANGE = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

/** "07:45-08:00" → minutes after local midnight. */
const toSlotBounds = (range: string) => {
  const [, startHours, startMinutes, endHours, endMinutes] = TIME_RANGE.exec(
    range,
  ) ?? ["", "0", "0", "0", "0"];

  return {
    startMinute: Number(startHours) * 60 + Number(startMinutes),
    endMinute: Number(endHours) * 60 + Number(endMinutes),
  };
};

/**
 * A time slot. Read from `timeRanges`, never from `name`: the name is
 * free text ("6:00-6:30") that happens to match today.
 */
const timeSetSchema = z
  .object({
    "@id": z.number().int(),
    dayToTimeRanges: z
      .array(
        z.object({
          dayOfWeek: z.enum(DAYS_OF_WEEK),
          timeRanges: z.tuple([z.string().regex(TIME_RANGE)]),
        }),
      )
      .length(DAYS_OF_WEEK.length),
  })
  .refine(
    ({ dayToTimeRanges }) =>
      new Set(dayToTimeRanges.map(({ timeRanges }) => timeRanges[0])).size ===
      1,
    "A time set must cover the same hours on every day",
  )
  .transform(({ "@id": id, dayToTimeRanges }) => ({
    id,
    ...toSlotBounds(dayToTimeRanges[0].timeRanges[0]),
  }))
  .refine(
    ({ startMinute, endMinute }) => startMinute < endMinute,
    "A time set must end after it starts",
  );

const dateRangeSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  exclusions: z.array(z.iso.date()),
  excludedDaysOfWeek: z.array(z.enum(DAYS_OF_WEEK)).default([]),
});

/** p5…p95 in steps of five. */
export const PERCENTILE_COUNT = 19;

const summarySchema = z.object({
  timeSet: z.number().int(),
  distance: z.number().positive(),
  medianTravelTime: z.number().positive(),
  travelTimePercentiles: z
    .array(z.number().positive())
    .length(PERCENTILE_COUNT),
});

const metadataFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.null(),
  properties: z.object({
    jobName: z.string(),
    creationTime: z.iso.datetime(),
    routeName: z.string().min(1),
    // Slot bounds are local wall-clock times; the page labels them as such.
    zoneId: z.literal("Europe/Copenhagen"),
    dateRanges: z.tuple([dateRangeSchema]),
    timeSets: z.array(timeSetSchema).min(1),
    summaries: z.array(summarySchema).min(1),
  }),
});

const segmentResultSchema = z.object({
  timeSet: z.number().int(),
  harmonicAverageSpeed: z.number().positive(),
  sampleSize: z.number().int().positive(),
  /** Against the first slot, not against free flow — see CLAUDE.md. */
  travelTimeRatio: z.number().positive(),
});

/**
 * `segmentId` is deliberately absent: like the live API's, it is a number that
 * does not survive `JSON.parse`. `newSegmentId` is a string and unique.
 */
const segmentFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: positionsSchema,
  }),
  properties: z.object({
    newSegmentId: z.string().min(1),
    streetName: z.string(),
    speedLimit: z.number().int().positive(),
    distance: z.number().positive(),
    segmentTimeResults: z.array(segmentResultSchema).min(1),
  }),
});

/** The metadata feature comes first and at least one segment follows it. */
export const trafficStatsExportSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.tuple(
    [metadataFeatureSchema, segmentFeatureSchema],
    segmentFeatureSchema,
  ),
});

export type TrafficStatsExport = z.infer<typeof trafficStatsExportSchema>;
export type TrafficStatsTimeSet = z.infer<typeof timeSetSchema>;
export type TrafficStatsDateRange = z.infer<typeof dateRangeSchema>;
