import "server-only";

import { prisma } from "@/lib/config/prisma";
import { type TomTomRouteDetails } from "@/lib/traffic/schema";
import { toPositions, toRouteLabel } from "@/lib/traffic/serialization";

/**
 * Segment geometry is static, so it is inserted once and left alone; only the
 * snapshot carries what actually changes between polls.
 */
export const trafficMutations = {
  recordSnapshot: (details: TomTomRouteDetails) =>
    prisma.$transaction(async (tx) => {
      await tx.trafficRoute.upsert({
        where: { id: details.routeId },
        create: {
          id: details.routeId,
          name: toRouteLabel(details.routeName),
          status: details.routeStatus,
          lengthMeters: details.routeLength,
        },
        update: {
          name: toRouteLabel(details.routeName),
          status: details.routeStatus,
          lengthMeters: details.routeLength,
        },
      });

      await tx.trafficSegment.createMany({
        data: details.detailedSegments.map((segment, index) => ({
          routeId: details.routeId,
          segmentIdStr: segment.segmentIdStr,
          ordinal: index,
          lengthMeters: segment.segmentLength,
          shape: toPositions(segment.shape),
        })),
        skipDuplicates: true,
      });

      return tx.trafficSnapshot.create({
        data: {
          routeId: details.routeId,
          travelTime: details.travelTime,
          typicalTravelTime: details.typicalTravelTime,
          delayTime: details.delayTime,
          completeness: details.completeness,
          routeConfidence: details.routeConfidence,
          passable: details.passable,
          segmentSpeeds: details.detailedSegments.map((segment) => ({
            s: segment.segmentIdStr,
            c: segment.currentSpeed,
            r: segment.relativeSpeed,
          })),
        },
        select: { id: true },
      });
    }),

  /**
   * One INSERT for every segment of every route that answered. `skipDuplicates`
   * plus the `(recordedAt, routeId, segmentIdStr)` key make a repeat run in the
   * same hour a no-op rather than a second set of rows.
   */
  recordHistory: (routes: readonly TomTomRouteDetails[], recordedAt: Date) =>
    prisma.trafficHistory.createMany({
      data: routes.flatMap((details) =>
        details.detailedSegments.map((segment) => ({
          recordedAt,
          routeId: details.routeId,
          segmentIdStr: segment.segmentIdStr,
          currentSpeed: segment.currentSpeed,
          averageSpeed: segment.averageSpeed,
          relativeSpeed: segment.relativeSpeed,
          typicalSpeed: segment.typicalSpeed,
        })),
      ),
      skipDuplicates: true,
    }),
};
