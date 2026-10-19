import { type Prisma } from "@/generated/prisma/client";
import {
  positionsSchema,
  type TrafficStatsDateRange,
  type TrafficStatsExport,
  type TrafficStatsTimeSet,
} from "@/lib/traffic-stats/schema";
import { computeBbox } from "@/lib/traffic/serialization";

/**
 * No `server-only`, like `traffic/serialization.ts`: the import CLI runs under
 * plain tsx and the tests import it directly. Prisma is imported as a type only.
 */

/** Indexes into the 19 percentiles p5…p95. */
const P10 = 1;
const P90 = 17;

export type TrafficStatsFile = { routeId: number; data: TrafficStatsExport };

type Slot = TrafficStatsTimeSet;
type SegmentFeature = TrafficStatsExport["features"][1];

/**
 * Sorted by start, then required to tile the day without gaps or overlaps —
 * the timeline draws them as adjacent cells.
 */
const toSlots = (timeSets: readonly TrafficStatsTimeSet[]): Slot[] => {
  const slots = timeSets.toSorted((a, b) => a.startMinute - b.startMinute);

  slots.forEach((slot, index) => {
    const previous = slots[index - 1];
    if (previous && previous.endMinute !== slot.startMinute)
      throw new Error(
        `Time sets are not contiguous: ${previous.endMinute} → ${slot.startMinute}`,
      );
  });

  return slots;
};

/**
 * Reorders per-slot results into slot order, requiring exactly one each. This
 * is the alignment invariant every stored list depends on.
 */
const alignBySlot = <Result extends { timeSet: number }>(
  results: readonly Result[],
  slots: readonly Slot[],
  context: string,
): Result[] => {
  if (results.length !== slots.length)
    throw new Error(
      `${context}: ${results.length} results for ${slots.length} time sets`,
    );

  return slots.map(({ id }) => {
    const matches = results.filter(({ timeSet }) => timeSet === id);
    if (matches.length !== 1)
      throw new Error(
        `${context}: ${matches.length} results for time set ${id}`,
      );

    return matches[0];
  });
};

const toUtcDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

const DAY_MS = 86_400_000;
const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

/**
 * The days the averages are taken over: every date in range, minus the
 * excluded weekdays, minus the explicit exclusions. Counted in UTC so a DST
 * change inside the range cannot shift a day.
 */
const countDays = ({
  from,
  to,
  exclusions,
  excludedDaysOfWeek,
}: TrafficStatsDateRange) => {
  const excluded = new Set(exclusions);
  const first = toUtcDate(from).getTime();
  const total = (toUtcDate(to).getTime() - first) / DAY_MS + 1;

  return Array.from(
    { length: total },
    (_, index) => new Date(first + index * DAY_MS),
  ).filter(
    (date) =>
      !excludedDaysOfWeek.includes(DAY_NAMES[date.getUTCDay()]) &&
      !excluded.has(date.toISOString().slice(0, 10)),
  ).length;
};

const assertUnique = (ids: readonly (string | number)[], what: string) => {
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined)
    throw new Error(`Duplicate ${what} id: ${duplicate}`);
};

/** Every file must describe the same days and the same slots. */
const assertSameShape = (files: readonly TrafficStatsFile[]) => {
  const describe = ({ data }: TrafficStatsFile) => {
    const { dateRanges, timeSets } = data.features[0].properties;

    return JSON.stringify({ dateRanges, slots: toSlots(timeSets) });
  };

  const [first, ...rest] = files.map(describe);
  const mismatch = rest.findIndex((shape) => shape !== first);
  if (mismatch !== -1)
    throw new Error(
      `Route ${files[mismatch + 1].routeId} disagrees with route ${files[0].routeId} on its date range or time sets`,
    );
};

const toSegmentCreate = (
  { geometry, properties }: SegmentFeature,
  ordinal: number,
  slots: readonly Slot[],
): Prisma.TrafficStatsSegmentCreateManyRouteInput => {
  const results = alignBySlot(
    properties.segmentTimeResults,
    slots,
    `Segment ${properties.newSegmentId}`,
  );

  return {
    id: properties.newSegmentId,
    ordinal,
    streetName: properties.streetName,
    speedLimit: properties.speedLimit,
    lengthMeters: properties.distance,
    shape: geometry.coordinates,
    harmonicAverageSpeeds: results.map((result) => result.harmonicAverageSpeed),
    travelTimeRatios: results.map((result) => result.travelTimeRatio),
    sampleSizes: results.map((result) => result.sampleSize),
  };
};

const toRouteCreate = (
  { routeId, data }: TrafficStatsFile,
  slots: readonly Slot[],
): Prisma.TrafficStatsRouteCreateWithoutDatasetInput => {
  const [metadata, ...segments] = data.features;
  const summaries = alignBySlot(
    metadata.properties.summaries,
    slots,
    `Route ${routeId}`,
  );

  if (new Set(summaries.map(({ distance }) => distance)).size !== 1)
    throw new Error(`Route ${routeId}: distance differs between time sets`);

  return {
    id: routeId,
    // From the file's own properties, never the filename: macOS stores
    // filenames decomposed (NFD), which would not match an NFC search.
    name: metadata.properties.routeName.normalize("NFC"),
    lengthMeters: Math.round(summaries[0].distance),
    medianTravelTimes: summaries.map((summary) => summary.medianTravelTime),
    p10TravelTimes: summaries.map(
      (summary) => summary.travelTimePercentiles[P10],
    ),
    p90TravelTimes: summaries.map(
      (summary) => summary.travelTimePercentiles[P90],
    ),
    segments: {
      createMany: {
        data: segments.map((segment, ordinal) =>
          toSegmentCreate(segment, ordinal, slots),
        ),
      },
    },
  };
};

/**
 * Validated export files → one nested create. The return annotation is the
 * drift guard: a model change that this does not follow stops compiling.
 */
export const toTrafficStatsImport = (
  files: readonly TrafficStatsFile[],
): Prisma.TrafficStatsDatasetCreateInput => {
  const [first] = files;
  if (!first) throw new Error("No export files to import");

  assertSameShape(files);
  assertUnique(
    files.map(({ routeId }) => routeId),
    "route",
  );
  assertUnique(
    files.flatMap(({ data }) => {
      const [, ...segments] = data.features;

      return segments.map(({ properties }) => properties.newSegmentId);
    }),
    "segment",
  );

  const { jobName, creationTime, dateRanges, timeSets } =
    first.data.features[0].properties;
  const [dateRange] = dateRanges;
  const slots = toSlots(timeSets);

  return {
    jobName,
    dateFrom: toUtcDate(dateRange.from),
    dateTo: toUtcDate(dateRange.to),
    dayCount: countDays(dateRange),
    slotStartMinutes: slots.map(({ startMinute }) => startMinute),
    slotEndMinutes: slots.map(({ endMinute }) => endMinute),
    exportedAt: new Date(creationTime),
    routes: { create: files.map((file) => toRouteCreate(file, slots)) },
  };
};

type TrafficStatsFromDb = Prisma.TrafficStatsDatasetGetPayload<{
  include: { routes: { include: { segments: true } } };
}>;
type RouteFromDb = TrafficStatsFromDb["routes"][number];
type SegmentFromDb = RouteFromDb["segments"][number];

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Network travel time per slot relative to the first, weighting each segment's
 * ratio by its first-slot travel time so long, slow segments count for more
 * than short, fast ones — the same thing as summing travel times.
 */
const toNetworkTravelTimeRatios = (
  segments: readonly SegmentFromDb[],
  slotCount: number,
): number[] => {
  const weights = segments.map(
    (segment) => segment.lengthMeters / segment.harmonicAverageSpeeds[0],
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return Array.from({ length: slotCount }, (_, slot) =>
    totalWeight === 0
      ? 1
      : segments.reduce(
          (sum, segment, index) =>
            sum + weights[index] * segment.travelTimeRatios[slot],
          0,
        ) / totalWeight,
  );
};

const serializeSegment = (segment: SegmentFromDb) => ({
  ...segment,
  shape: positionsSchema.parse(segment.shape),
});

const serializeRoute = (route: RouteFromDb) => ({
  ...route,
  segments: route.segments.map(serializeSegment),
});

export const serializeTrafficStats = (dataset: TrafficStatsFromDb) => {
  const routes = dataset.routes.map(serializeRoute);

  return {
    ...dataset,
    dateFrom: toIsoDate(dataset.dateFrom),
    dateTo: toIsoDate(dataset.dateTo),
    exportedAt: dataset.exportedAt.toISOString(),
    importedAt: dataset.importedAt.toISOString(),
    routes,
    bbox: computeBbox(
      routes.flatMap(({ segments }) => segments.map(({ shape }) => shape)),
    ),
    networkTravelTimeRatios: toNetworkTravelTimeRatios(
      dataset.routes.flatMap(({ segments }) => segments),
      dataset.slotStartMinutes.length,
    ),
  };
};

export type SerializedTrafficStats = ReturnType<typeof serializeTrafficStats>;
export type SerializedTrafficStatsRoute =
  SerializedTrafficStats["routes"][number];
export type SerializedTrafficStatsSegment =
  SerializedTrafficStatsRoute["segments"][number];
