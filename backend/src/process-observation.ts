import type { DatabaseClient, TrafficCongestion } from "@greenwave/database";
import type { Observation } from "@greenwave/shared";
import {
  classifySegments,
  isNewer,
  nextFlag,
  routeIsCongested,
  routeIsSlowerThanUsual,
  toBucketStart,
} from "./rules";
import { toRouteState } from "./state-message";

export const processObservation = async (
  prisma: DatabaseClient,
  observation: Observation,
) =>
  prisma.$transaction(async (tx) => {
    const receipt = await tx.trafficObservationReceipt.createMany({
      data: [{ eventId: observation.eventId }],
      skipDuplicates: true,
    });
    if (receipt.count === 0) return null;

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
    await tx.$executeRaw`SELECT 1 FROM traffic_route WHERE "cityId" = ${cityId} AND id = ${routeId} FOR UPDATE`;

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

    const observedAt = new Date(observation.observedAt);
    const stored = await tx.trafficRouteState.findUnique({
      where: { cityId_routeId: { cityId, routeId } },
    });
    if (!isNewer(observedAt, stored?.observedAt)) return null;

    const classified = classifySegments(observation.segments);
    const congestedFlag = nextFlag(
      {
        since: stored?.congestedSince ?? null,
        pendingSince: stored?.congestedPendingSince ?? null,
        streak: stored?.congestedStreak ?? 0,
      },
      routeIsCongested(classified),
      observedAt,
    );
    const slowerFlag = nextFlag(
      {
        since: stored?.slowerThanUsualSince ?? null,
        pendingSince: stored?.slowerThanUsualPendingSince ?? null,
        streak: stored?.slowerThanUsualStreak ?? 0,
      },
      routeIsSlowerThanUsual(observation.route),
      observedAt,
    );

    await tx.trafficRouteState.upsert({
      where: { cityId_routeId: { cityId, routeId } },
      create: {
        cityId,
        routeId,
        eventId: observation.eventId,
        observedAt,
        travelTimeSec: observation.route.travelTimeSec,
        typicalTravelTimeSec: observation.route.typicalTravelTimeSec,
        delaySec: observation.route.delaySec,
        passable: observation.route.passable,
        congestedSince: congestedFlag.since,
        congestedPendingSince: congestedFlag.pendingSince,
        congestedStreak: congestedFlag.streak,
        slowerThanUsualSince: slowerFlag.since,
        slowerThanUsualPendingSince: slowerFlag.pendingSince,
        slowerThanUsualStreak: slowerFlag.streak,
      },
      update: {
        eventId: observation.eventId,
        observedAt,
        travelTimeSec: observation.route.travelTimeSec,
        typicalTravelTimeSec: observation.route.typicalTravelTimeSec,
        delaySec: observation.route.delaySec,
        passable: observation.route.passable,
        congestedSince: congestedFlag.since,
        congestedPendingSince: congestedFlag.pendingSince,
        congestedStreak: congestedFlag.streak,
        slowerThanUsualSince: slowerFlag.since,
        slowerThanUsualPendingSince: slowerFlag.pendingSince,
        slowerThanUsualStreak: slowerFlag.streak,
      },
    });

    const ids = classified.map((segment) => segment.id);
    const cur = classified.map((segment) => segment.currentSpeedKmh);
    const avg = classified.map((segment) => segment.averageSpeedKmh);
    const typ = classified.map((segment) => segment.typicalSpeedKmh);
    const rel = classified.map((segment) => segment.relativeSpeedPct);
    const conf = classified.map((segment) => segment.confidencePct);
    const lvl: TrafficCongestion[] = classified.map(
      (segment) => segment.congestion,
    );
    await tx.$executeRaw`
      INSERT INTO traffic_segment_state ("cityId", "routeId", "segmentId", "observedAt", "currentSpeedKmh",
        "averageSpeedKmh", "typicalSpeedKmh", "relativeSpeedPct", "confidencePct", congestion)
      SELECT ${cityId}, ${routeId}, s.id, ${observedAt}, s.cur, s.avg, s.typ, s.rel, s.conf, s.lvl::traffic_congestion
      FROM unnest(${ids}::text[], ${cur}::int[], ${avg}::int[], ${typ}::int[], ${rel}::int[], ${conf}::int[], ${lvl}::text[])
        AS s(id, cur, avg, typ, rel, conf, lvl)
      ON CONFLICT ("cityId", "routeId", "segmentId") DO UPDATE SET
        "observedAt" = EXCLUDED."observedAt", "currentSpeedKmh" = EXCLUDED."currentSpeedKmh",
        "averageSpeedKmh" = EXCLUDED."averageSpeedKmh", "typicalSpeedKmh" = EXCLUDED."typicalSpeedKmh",
        "relativeSpeedPct" = EXCLUDED."relativeSpeedPct", "confidencePct" = EXCLUDED."confidencePct",
        congestion = EXCLUDED.congestion`;

    if (observation.source !== "fixture") {
      await tx.$executeRaw`
        INSERT INTO traffic_segment_history ("bucketStart", "cityId", "routeId", "segmentId", "sampleCount",
          "currentSpeedSum", "averageSpeedSum", "typicalSpeedSum", "relativeSpeedSum")
        SELECT ${toBucketStart(observedAt)}, ${cityId}, ${routeId}, s.id, 1, s.cur, s.avg, s.typ, s.rel
        FROM unnest(${ids}::text[], ${cur}::int[], ${avg}::int[], ${typ}::int[], ${rel}::int[]) AS s(id, cur, avg, typ, rel)
        ON CONFLICT ("bucketStart", "cityId", "routeId", "segmentId") DO UPDATE SET
          "sampleCount" = traffic_segment_history."sampleCount" + 1,
          "currentSpeedSum" = traffic_segment_history."currentSpeedSum" + EXCLUDED."currentSpeedSum",
          "averageSpeedSum" = traffic_segment_history."averageSpeedSum" + EXCLUDED."averageSpeedSum",
          "typicalSpeedSum" = traffic_segment_history."typicalSpeedSum" + EXCLUDED."typicalSpeedSum",
          "relativeSpeedSum" = traffic_segment_history."relativeSpeedSum" + EXCLUDED."relativeSpeedSum"`;
    }

    return toRouteState(observation, classified, congestedFlag, slowerFlag);
  });
