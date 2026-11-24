import type { DatabaseClient } from "@greenwave/database";
import type { DayType } from "./slots";

/** A profile cell needs this many separate days before it is trusted. */
const MIN_DAYS = 3;
/** Traffic Stats covers 06:00–18:00: quarter hours 24 up to, not including, 72. */
const STATS_FIRST_SLOT = 24;
const STATS_END_SLOT = 72;

export type ProfileRow = {
  routeId: string;
  segmentId: string;
  dayType: DayType;
  slot: number;
  rel: number;
  kmh: number;
  maxRel: number;
  maxKmh: number;
  days: number;
};

export type ProfileSource = "cell" | "pooled" | "trafficStats" | "mean";

type Totals = { rel: number; kmh: number; days: number };

export type SegmentProfile = {
  routeId: string;
  segmentId: string;
  cells: Map<string, Totals>;
  pooled: Map<number, Totals>;
  total: Totals;
  maxRel: number;
  maxKmh: number;
};

/** Multiplier on a segment's mean at a quarter hour; null outside the data. */
export type RouteShape = (slot: number) => number | null;

const cellKey = (dayType: DayType, slot: number) => `${dayType}:${slot}`;

const addTo = (totals: Totals, row: ProfileRow) => {
  totals.rel += row.rel * row.days;
  totals.kmh += row.kmh * row.days;
  totals.days += row.days;
};

const meanOf = ({ rel, kmh, days }: Totals) => ({
  rel: rel / days,
  kmh: kmh / days,
});

export const segmentKey = (routeId: string, segmentId: string) =>
  `${routeId}:${segmentId}`;

export const buildProfiles = (rows: readonly ProfileRow[]) => {
  const profiles = new Map<string, SegmentProfile>();

  for (const row of rows) {
    const key = segmentKey(row.routeId, row.segmentId);
    let profile = profiles.get(key);
    if (!profile) {
      profile = {
        routeId: row.routeId,
        segmentId: row.segmentId,
        cells: new Map(),
        pooled: new Map(),
        total: { rel: 0, kmh: 0, days: 0 },
        maxRel: row.maxRel,
        maxKmh: row.maxKmh,
      };
      profiles.set(key, profile);
    }

    const cell = { rel: 0, kmh: 0, days: 0 };
    addTo(cell, row);
    profile.cells.set(cellKey(row.dayType, row.slot), cell);

    let pooled = profile.pooled.get(row.slot);
    if (!pooled) {
      pooled = { rel: 0, kmh: 0, days: 0 };
      profile.pooled.set(row.slot, pooled);
    }
    addTo(pooled, row);
    addTo(profile.total, row);
    profile.maxRel = Math.max(profile.maxRel, row.maxRel);
    profile.maxKmh = Math.max(profile.maxKmh, row.maxKmh);
  }

  return profiles;
};

/**
 * The fallback order from the plan: the cell, the slot with both day types
 * pooled, the segment's mean scaled by its Traffic Stats route's weekday shape
 * (06:00–18:00 only), then the plain mean.
 */
export const resolveProfile = (
  profile: SegmentProfile,
  dayType: DayType,
  slot: number,
  shape: RouteShape | undefined,
): { rel: number; kmh: number; source: ProfileSource } => {
  const cell = profile.cells.get(cellKey(dayType, slot));
  if (cell && cell.days >= MIN_DAYS) {
    return { ...meanOf(cell), source: "cell" };
  }

  const pooled = profile.pooled.get(slot);
  if (pooled && pooled.days >= MIN_DAYS) {
    return { ...meanOf(pooled), source: "pooled" };
  }

  const mean = meanOf(profile.total);
  const inStatsRange = slot >= STATS_FIRST_SLOT && slot < STATS_END_SLOT;
  const scale = inStatsRange ? shape?.(slot) : null;
  if (scale !== null && scale !== undefined) {
    return {
      rel: mean.rel * scale,
      kmh: mean.kmh * scale,
      source: "trafficStats",
    };
  }

  return { ...mean, source: "mean" };
};

/**
 * Shape(slot) = the route's mean median travel time ÷ its median in the Traffic
 * Stats slot containing this quarter hour, so a slower slot lowers the speed.
 * Those slots are uneven, hence the lookup by minute range.
 */
export const buildRouteShape = ({
  slotStartMinutes,
  slotEndMinutes,
  medianTravelTimes,
}: {
  slotStartMinutes: readonly number[];
  slotEndMinutes: readonly number[];
  medianTravelTimes: readonly number[];
}): RouteShape => {
  const meanTravelTime =
    medianTravelTimes.reduce((sum, value) => sum + value, 0) /
    medianTravelTimes.length;

  return (slot) => {
    const minute = slot * 15;
    const index = slotStartMinutes.findIndex(
      (start, position) =>
        minute >= start && minute < (slotEndMinutes[position] ?? start),
    );
    const travelTime = medianTravelTimes[index];

    return travelTime ? meanTravelTime / travelTime : null;
  };
};

/**
 * One row per segment, day type and slot, averaging daily means so each day
 * counts once whether a bucket holds 15 pipeline samples or 1 Vercel sample.
 */
const readProfileRows = (
  prisma: DatabaseClient,
  cityId: string,
  since: Date,
  until: Date,
) => prisma.$queryRaw<ProfileRow[]>`
  WITH buckets AS (
    SELECT "routeId", "segmentId",
           ("bucketStart" AT TIME ZONE 'Europe/Copenhagen') AS local,
           "relativeSpeedSum"::float8 / "sampleCount" AS rel,
           "currentSpeedSum"::float8 / "sampleCount" AS kmh
    FROM traffic_segment_history
    WHERE "cityId" = ${cityId}
      AND "bucketStart" >= ${since}::timestamptz
      AND "bucketStart" < ${until}::timestamptz
  ), daily AS (
    SELECT "routeId", "segmentId", local::date AS day,
           (EXTRACT(HOUR FROM local) * 4 + EXTRACT(MINUTE FROM local) / 15)::int AS slot,
           CASE WHEN EXTRACT(ISODOW FROM local) IN (6, 7) THEN 'weekend' ELSE 'weekday' END AS "dayType",
           AVG(rel) AS rel, AVG(kmh) AS kmh,
           MAX(rel) AS "maxRel", MAX(kmh) AS "maxKmh"
    FROM buckets
    GROUP BY 1, 2, 3, 4, 5
  )
  SELECT "routeId", "segmentId", "dayType", slot,
         AVG(rel)::float8 AS rel, AVG(kmh)::float8 AS kmh,
         MAX("maxRel")::float8 AS "maxRel", MAX("maxKmh")::float8 AS "maxKmh",
         COUNT(*)::int AS days
  FROM daily
  GROUP BY 1, 2, 3, 4
`;

export const loadProfiles = async (
  prisma: DatabaseClient,
  cityId: string,
  since: Date,
  until: Date,
) => buildProfiles(await readProfileRows(prisma, cityId, since, until));

/** Live route id → the weekday shape of its linked Traffic Stats route. */
export const loadRouteShapes = async (
  prisma: DatabaseClient,
  cityId: string,
) => {
  const links = await prisma.trafficStatsRouteLink.findMany({
    where: { cityId },
  });
  const statsRoutes = await prisma.trafficStatsRoute.findMany({
    where: { id: { in: links.map((link) => link.statsRouteId) } },
    select: {
      id: true,
      medianTravelTimes: true,
      dataset: { select: { slotStartMinutes: true, slotEndMinutes: true } },
    },
  });
  const byId = new Map(statsRoutes.map((route) => [route.id, route]));

  return new Map(
    links.flatMap((link): [string, RouteShape][] => {
      const route = byId.get(link.statsRouteId);
      if (!route) return [];

      return [
        [
          link.routeId,
          buildRouteShape({
            slotStartMinutes: route.dataset.slotStartMinutes,
            slotEndMinutes: route.dataset.slotEndMinutes,
            medianTravelTimes: route.medianTravelTimes,
          }),
        ],
      ];
    }),
  );
};
