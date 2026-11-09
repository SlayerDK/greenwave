import { z } from "zod";
import { CONGESTION_LEVELS } from "./congestion";
import {
  observationRouteSchema,
  observationSchema,
  observationSegmentSchema,
} from "./observation";

/**
 * The observation plus what the backend derives. `safeExtend`, because the
 * base schema carries the eventId refinement, which `extend` refuses.
 */
export const stateSchema = observationSchema.safeExtend({
  route: observationRouteSchema.extend({
    congestedSince: z.iso.datetime().nullable(),
    slowerThanUsualSince: z.iso.datetime().nullable(),
  }),
  segments: z
    .array(
      observationSegmentSchema.extend({
        congestion: z.enum(CONGESTION_LEVELS),
      }),
    )
    .min(1),
});

export type RouteState = z.infer<typeof stateSchema>;
