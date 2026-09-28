import "server-only";

import { prisma } from "@/lib/config/prisma";
import { type TomTomRouteDetails } from "@/lib/traffic/schema";
import { toPositions } from "@/lib/traffic/serialization";

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
          name: details.routeName,
          status: details.routeStatus,
          lengthMeters: details.routeLength,
        },
        update: {
          name: details.routeName,
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
};
