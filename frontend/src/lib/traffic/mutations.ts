import "server-only";

import { prisma } from "@/lib/config/prisma";
import { type TomTomRouteDetails } from "@/lib/traffic/schema";

export const trafficMutations = {
  /**
   * One INSERT for every segment and one for every route that answered, in one
   * transaction. `skipDuplicates` plus the `recordedAt`-first keys make a repeat
   * run in the same slot a no-op rather than a second set of rows. Resolves to
   * the segment insert's count: both share the same slot, so they skip together.
   */
  recordHistory: (routes: readonly TomTomRouteDetails[], recordedAt: Date) =>
    prisma
      .$transaction([
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
              confidence: segment.confidence,
            })),
          ),
          skipDuplicates: true,
        }),
        prisma.trafficRouteHistory.createMany({
          data: routes.map((details) => ({
            recordedAt,
            routeId: details.routeId,
            travelTime: details.travelTime,
            typicalTravelTime: details.typicalTravelTime,
            delayTime: details.delayTime,
            completeness: details.completeness,
            routeConfidence: details.routeConfidence,
            passable: details.passable,
          })),
          skipDuplicates: true,
        }),
      ])
      .then(([segmentRows]) => segmentRows),
};
