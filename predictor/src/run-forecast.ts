import type { DatabaseClient } from "@greenwave/database";
import type { Logger } from "pino";
import { forecastValue, isReadingFresh } from "./forecast";
import {
  loadProfiles,
  loadRouteShapes,
  resolveProfile,
  segmentKey,
  type ProfileSource,
  type RouteShape,
  type SegmentProfile,
} from "./profile";
import { dayTypeOf, localSlotOf, slotsUntilMidnight } from "./slots";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Neon and a busy laptop can both exceed Prisma's 5 s default. */
const TRANSACTION_TIMEOUT_MS = 30_000;

type Current = { rel: number; kmh: number } | null;
type SourceCounts = Record<ProfileSource, number>;

export type ForecastConfig = {
  prisma: DatabaseClient;
  logger: Logger;
  cityIds: readonly string[];
  tauMinutes: number;
  historyDays: number;
};

/** Pure: one segment's forecast for every slot, aligned with `slotStarts`. */
export const forecastSegment = ({
  profile,
  shape,
  current,
  now,
  slotStarts,
  tauMinutes,
  sources,
}: {
  profile: SegmentProfile;
  shape: RouteShape | undefined;
  current: Current;
  now: Date;
  slotStarts: readonly Date[];
  tauMinutes: number;
  sources: SourceCounts;
}) => {
  const profileNow = resolveProfile(
    profile,
    dayTypeOf(now),
    localSlotOf(now),
    shape,
  );
  const relativeSpeedPcts: number[] = [];
  const speedsKmh: number[] = [];

  for (const slotStart of slotStarts) {
    const target = resolveProfile(
      profile,
      dayTypeOf(slotStart),
      localSlotOf(slotStart),
      shape,
    );
    const horizonMinutes = (slotStart.getTime() - now.getTime()) / 60_000;
    sources[target.source] += 1;

    relativeSpeedPcts.push(
      forecastValue({
        profileAtTarget: target.rel,
        profileNow: profileNow.rel,
        current: current?.rel ?? null,
        horizonMinutes,
        tauMinutes,
        maximum: profile.maxRel,
      }),
    );
    speedsKmh.push(
      forecastValue({
        profileAtTarget: target.kmh,
        profileNow: profileNow.kmh,
        current: current?.kmh ?? null,
        horizonMinutes,
        tauMinutes,
        maximum: profile.maxKmh,
      }),
    );
  }

  return { relativeSpeedPcts, speedsKmh };
};

const forecastCity = async (
  { prisma, logger, tauMinutes, historyDays }: ForecastConfig,
  cityId: string,
  now: Date,
) => {
  const startedAt = Date.now();
  const slotStarts = slotsUntilMidnight(now);
  if (slotStarts.length === 0) return;

  const since = new Date(now.getTime() - historyDays * DAY_MS);
  const [profiles, shapes, states] = await Promise.all([
    loadProfiles(prisma, cityId, since, now),
    loadRouteShapes(prisma, cityId),
    prisma.trafficSegmentState.findMany({ where: { cityId } }),
  ]);

  // An empty run would replace the last usable forecast with nothing.
  if (profiles.size === 0) {
    logger.warn({ cityId }, "no recorded history, skipping forecast");
    return;
  }

  const currentBySegment = new Map(
    states.flatMap((state): [string, Current][] =>
      isReadingFresh(state.observedAt, now)
        ? [
            [
              segmentKey(state.routeId, state.segmentId),
              { rel: state.relativeSpeedPct, kmh: state.currentSpeedKmh },
            ],
          ]
        : [],
    ),
  );
  const sources: SourceCounts = {
    cell: 0,
    pooled: 0,
    trafficStats: 0,
    mean: 0,
  };
  const segments = [...profiles.entries()].map(([key, profile]) => ({
    cityId,
    routeId: profile.routeId,
    segmentId: profile.segmentId,
    ...forecastSegment({
      profile,
      shape: shapes.get(profile.routeId),
      current: currentBySegment.get(key) ?? null,
      now,
      slotStarts,
      tauMinutes,
      sources,
    }),
  }));

  await prisma.$transaction(
    async (tx) => {
      const run = await tx.trafficForecastRun.create({
        data: { cityId, generatedAt: now, slotStarts, tauMinutes },
      });
      await tx.trafficSegmentForecast.createMany({
        data: segments.map((segment) => ({ ...segment, runId: run.id })),
      });
      await tx.trafficForecastRun.deleteMany({
        where: {
          cityId,
          generatedAt: { lt: new Date(now.getTime() - DAY_MS) },
        },
      });
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );

  logger.info(
    {
      cityId,
      segments: segments.length,
      slots: slotStarts.length,
      liveDeviations: currentBySegment.size,
      sources,
      ms: Date.now() - startedAt,
    },
    "forecast run",
  );
};

export const runForecast = async (config: ForecastConfig, now = new Date()) => {
  for (const cityId of config.cityIds) {
    await forecastCity(config, cityId, now);
  }
};
