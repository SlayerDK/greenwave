import type {
  DatabaseClient,
  Prisma,
  TrafficCongestion,
} from "@greenwave/database";
import type { Observation, RouteState } from "@greenwave/shared";
import {
  classifySegments,
  isNewer,
  nextFlag,
  routeIsCongested,
  routeIsSlowerThanUsual,
  toBucketStart,
  type Flag,
} from "./rules";
import { toRouteState } from "./state-message";

type Transaction = Prisma.TransactionClient;
type ClassifiedSegments = ReturnType<typeof classifySegments>;

export type ProcessResult =
  /** The receipt already exists: a redelivery of a reading already written. */
  | { status: "duplicate" }
  /** Older than the stored state: counted in the history, state left alone. */
  | { status: "stale" }
  | { status: "current"; state: RouteState };

const ensureRouteAndSegments = async (
  tx: Transaction,
  observation: Observation,
) => {
  const { cityId, routeId } = observation;
  await tx.trafficRoute.upsert({
    where: { cityId_id: { cityId, id: routeId } },
    create: {
      cityId,
      id: routeId,
      name: observation.route.name,
      lengthM: observation.route.lengthM,
    },
    update: {
      name: observation.route.name,
      lengthM: observation.route.lengthM,
    },
  });
  await tx.trafficSegment.createMany({
    data: observation.segments.map((segment, ordinal) => ({
      cityId,
      routeId,
      id: segment.id,
      ordinal,
      lengthM: segment.lengthM,
      coordinates: segment.coordinates,
    })),
    skipDuplicates: true,
  });
};

const getCongestedFlag = (
  stored: Awaited<ReturnType<Transaction["trafficRouteState"]["findUnique"]>>,
  classified: ClassifiedSegments,
  observedAt: Date,
) => {
  const state = stored ?? {
    congestedSince: null,
    congestedPendingSince: null,
    congestedStreak: 0,
  };
  return nextFlag(
    {
      since: state.congestedSince,
      pendingSince: state.congestedPendingSince,
      streak: state.congestedStreak,
    },
    routeIsCongested(classified),
    observedAt,
  );
};

const getSlowerFlag = (
  stored: Awaited<ReturnType<Transaction["trafficRouteState"]["findUnique"]>>,
  observation: Observation,
  observedAt: Date,
) => {
  const state = stored ?? {
    slowerThanUsualSince: null,
    slowerThanUsualPendingSince: null,
    slowerThanUsualStreak: 0,
  };
  return nextFlag(
    {
      since: state.slowerThanUsualSince,
      pendingSince: state.slowerThanUsualPendingSince,
      streak: state.slowerThanUsualStreak,
    },
    routeIsSlowerThanUsual(observation.route),
    observedAt,
  );
};

const upsertRouteState = async (
  tx: Transaction,
  observation: Observation,
  observedAt: Date,
  flags: { congested: Flag; slower: Flag },
) => {
  const { cityId, routeId } = observation;
  const routeState = {
    eventId: observation.eventId,
    observedAt,
    travelTimeSec: observation.route.travelTimeSec,
    typicalTravelTimeSec: observation.route.typicalTravelTimeSec,
    delaySec: observation.route.delaySec,
    passable: observation.route.passable,
    congestedSince: flags.congested.since,
    congestedPendingSince: flags.congested.pendingSince,
    congestedStreak: flags.congested.streak,
    slowerThanUsualSince: flags.slower.since,
    slowerThanUsualPendingSince: flags.slower.pendingSince,
    slowerThanUsualStreak: flags.slower.streak,
  };
  await tx.trafficRouteState.upsert({
    where: { cityId_routeId: { cityId, routeId } },
    create: { cityId, routeId, ...routeState },
    update: routeState,
  });
};

/**
 * One array per column, for the `unnest` inserts below. `lvl` is typed through
 * the Prisma enum: it goes into SQL as text, which would bypass the drift guard.
 */
const toSegmentColumns = (classified: ClassifiedSegments) => ({
  ids: classified.map((segment) => segment.id),
  cur: classified.map((segment) => segment.currentSpeedKmh),
  avg: classified.map((segment) => segment.averageSpeedKmh),
  typ: classified.map((segment) => segment.typicalSpeedKmh),
  rel: classified.map((segment) => segment.relativeSpeedPct),
  conf: classified.map((segment) => segment.confidencePct),
  lvl: classified.map((segment): TrafficCongestion => segment.congestion),
});

type SegmentColumns = ReturnType<typeof toSegmentColumns>;

const writeSegmentState = async (
  tx: Transaction,
  observation: Observation,
  observedAt: Date,
  { ids, cur, avg, typ, rel, conf, lvl }: SegmentColumns,
) => {
  await tx.$executeRaw`
    INSERT INTO traffic_segment_state ("cityId", "routeId", "segmentId", "observedAt", "currentSpeedKmh",
      "averageSpeedKmh", "typicalSpeedKmh", "relativeSpeedPct", "confidencePct", congestion)
    SELECT ${observation.cityId}, ${observation.routeId}, s.id, ${observedAt}, s.cur, s.avg, s.typ, s.rel, s.conf, s.lvl::traffic_congestion
    FROM unnest(${ids}::text[], ${cur}::int[], ${avg}::int[], ${typ}::int[], ${rel}::int[], ${conf}::int[], ${lvl}::text[])
      AS s(id, cur, avg, typ, rel, conf, lvl)
    ON CONFLICT ("cityId", "routeId", "segmentId") DO UPDATE SET
      "observedAt" = EXCLUDED."observedAt", "currentSpeedKmh" = EXCLUDED."currentSpeedKmh",
      "averageSpeedKmh" = EXCLUDED."averageSpeedKmh", "typicalSpeedKmh" = EXCLUDED."typicalSpeedKmh",
      "relativeSpeedPct" = EXCLUDED."relativeSpeedPct", "confidencePct" = EXCLUDED."confidencePct",
      congestion = EXCLUDED.congestion`;
};

const writeSegmentHistory = async (
  tx: Transaction,
  observation: Observation,
  observedAt: Date,
  { ids, cur, avg, typ, rel }: SegmentColumns,
) => {
  if (observation.source === "fixture") return;

  await tx.$executeRaw`
    INSERT INTO traffic_segment_history ("bucketStart", "cityId", "routeId", "segmentId", "sampleCount",
      "currentSpeedSum", "averageSpeedSum", "typicalSpeedSum", "relativeSpeedSum")
    SELECT ${toBucketStart(observedAt)}, ${observation.cityId}, ${observation.routeId}, s.id, 1, s.cur, s.avg, s.typ, s.rel
    FROM unnest(${ids}::text[], ${cur}::int[], ${avg}::int[], ${typ}::int[], ${rel}::int[]) AS s(id, cur, avg, typ, rel)
    ON CONFLICT ("bucketStart", "cityId", "routeId", "segmentId") DO UPDATE SET
      "sampleCount" = traffic_segment_history."sampleCount" + 1,
      "currentSpeedSum" = traffic_segment_history."currentSpeedSum" + EXCLUDED."currentSpeedSum",
      "averageSpeedSum" = traffic_segment_history."averageSpeedSum" + EXCLUDED."averageSpeedSum",
      "typicalSpeedSum" = traffic_segment_history."typicalSpeedSum" + EXCLUDED."typicalSpeedSum",
      "relativeSpeedSum" = traffic_segment_history."relativeSpeedSum" + EXCLUDED."relativeSpeedSum"`;
};

/**
 * One transaction per observation. Every new reading counts in the history,
 * even one that arrives late; only a newer one moves the state.
 */
export const processObservation = async (
  prisma: DatabaseClient,
  observation: Observation,
) =>
  prisma.$transaction(async (tx): Promise<ProcessResult> => {
    const receipt = await tx.trafficObservationReceipt.createMany({
      data: [{ eventId: observation.eventId }],
      skipDuplicates: true,
    });
    if (receipt.count === 0) return { status: "duplicate" };

    await ensureRouteAndSegments(tx, observation);
    const observedAt = new Date(observation.observedAt);
    const classified = classifySegments(observation.segments);
    const columns = toSegmentColumns(classified);
    await writeSegmentHistory(tx, observation, observedAt, columns);

    const stored = await tx.trafficRouteState.findUnique({
      where: {
        cityId_routeId: {
          cityId: observation.cityId,
          routeId: observation.routeId,
        },
      },
    });
    if (!isNewer(observedAt, stored?.observedAt)) return { status: "stale" };

    const flags = {
      congested: getCongestedFlag(stored, classified, observedAt),
      slower: getSlowerFlag(stored, observation, observedAt),
    };
    await upsertRouteState(tx, observation, observedAt, flags);
    await writeSegmentState(tx, observation, observedAt, columns);

    return {
      status: "current",
      state: toRouteState(
        observation,
        classified,
        flags.congested,
        flags.slower,
      ),
    };
  });
