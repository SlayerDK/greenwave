import { createPrismaClient, type DatabaseClient } from "@greenwave/database";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { env } from "./env";
import {
  evaluateDay,
  toCsv,
  type BacktestSegment,
  type Bucket,
  type Scoreboard,
} from "./evaluate";
import { loadProfiles, loadRouteShapes, segmentKey } from "./profile";
import { localDateOf, previousLocalDays, slotsUntilMidnight } from "./slots";

const DAY_MS = 24 * 60 * 60 * 1000;

const readBuckets = async (
  prisma: DatabaseClient,
  cityId: string,
  quarterHours: readonly Date[],
) => {
  const rows = await prisma.trafficSegmentHistory.findMany({
    where: {
      cityId,
      bucketStart: {
        gte: quarterHours[0],
        lte: quarterHours[quarterHours.length - 1],
      },
    },
  });
  const bySegment = new Map<string, Map<number, Bucket>>();

  for (const row of rows) {
    const key = segmentKey(row.routeId, row.segmentId);
    const buckets = bySegment.get(key) ?? new Map<number, Bucket>();
    buckets.set(row.bucketStart.getTime(), {
      kmh: row.currentSpeedSum / row.sampleCount,
      rel: row.relativeSpeedSum / row.sampleCount,
      typicalKmh: row.typicalSpeedSum / row.sampleCount,
    });
    bySegment.set(key, buckets);
  }

  return bySegment;
};

/** The profile sees only history from before the day it is scored on. */
const evaluateCityDay = async (
  prisma: DatabaseClient,
  board: Scoreboard,
  cityId: string,
  dayStart: Date,
) => {
  const quarterHours = [dayStart, ...slotsUntilMidnight(dayStart)];
  const since = new Date(dayStart.getTime() - env.HISTORY_DAYS * DAY_MS);
  const [profiles, shapes, buckets, lengths] = await Promise.all([
    loadProfiles(prisma, cityId, since, dayStart),
    loadRouteShapes(prisma, cityId),
    readBuckets(prisma, cityId, quarterHours),
    prisma.trafficSegment.findMany({
      where: { cityId },
      select: { routeId: true, id: true, lengthM: true },
    }),
  ]);
  const lengthByKey = new Map(
    lengths.map((row) => [segmentKey(row.routeId, row.id), row.lengthM]),
  );

  const segments = [...buckets].flatMap(
    ([key, segmentBuckets]): BacktestSegment[] => {
      const profile = profiles.get(key);
      const lengthM = lengthByKey.get(key);
      if (!profile || !lengthM) return [];

      return [
        {
          key,
          lengthM,
          profile,
          shape: shapes.get(profile.routeId),
          buckets: segmentBuckets,
        },
      ];
    },
  );

  evaluateDay(board, quarterHours, segments);
  console.info(
    `${cityId} ${localDateOf(dayStart)}: ${segments.length} segments`,
  );
};

const readArgs = (now: Date) => {
  const { values } = parseArgs({
    options: {
      days: { type: "string", default: "7" },
      out: { type: "string" },
    },
  });
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("--days must be a positive whole number");
  }
  const defaultOutput = path.join(
    "..",
    "docs",
    "report",
    `backtest-${localDateOf(now)}.csv`,
  );

  return { days, output: values.out ?? defaultOutput };
};

const writeReport = async (board: Scoreboard, output: string) => {
  // No file: an empty CSV under docs/report could pass for a real result.
  if (board.size === 0) {
    throw new Error(
      "No samples: the backtest needs recorded history before each scored day.",
    );
  }

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, toCsv(board));
  console.info(`wrote ${output}`);
};

const main = async () => {
  const now = new Date();
  const { days, output } = readArgs(now);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const board: Scoreboard = new Map();

  try {
    for (const cityId of env.CITY_IDS) {
      for (const dayStart of previousLocalDays(now, days)) {
        await evaluateCityDay(prisma, board, cityId, dayStart);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  await writeReport(board, output);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
