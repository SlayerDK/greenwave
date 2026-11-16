import type { Observation, RouteState } from "@greenwave/shared";
import type { Flag, classifySegments } from "./rules";

export const toRouteState = (
  observation: Observation,
  classified: ReturnType<typeof classifySegments>,
  congestedFlag: Flag,
  slowerFlag: Flag,
): RouteState => ({
  ...observation,
  route: {
    ...observation.route,
    congestedSince: congestedFlag.since?.toISOString() ?? null,
    slowerThanUsualSince: slowerFlag.since?.toISOString() ?? null,
  },
  segments: classified,
});
