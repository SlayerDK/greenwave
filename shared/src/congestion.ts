/** From free flow to closed. The Prisma enum `TrafficCongestion` mirrors it. */
export const CONGESTION_LEVELS = [
  "free",
  "light",
  "moderate",
  "heavy",
  "closed",
] as const;

/**
 * `relativeSpeed` is current speed as a percentage of free flow. A segment
 * closed to traffic reports `currentSpeed: 0`, which TomTom documents explicitly.
 *
 * Structural rather than TomTom's segment type so the historical page can
 * colour by the same thresholds against its own baseline — one home for the
 * cut-offs.
 */
export const classifyCongestion = ({
  currentSpeed,
  relativeSpeed,
}: {
  currentSpeed: number;
  relativeSpeed: number;
}) => {
  if (currentSpeed === 0) return "closed";
  if (relativeSpeed < 50) return "heavy";
  if (relativeSpeed < 75) return "moderate";
  if (relativeSpeed < 90) return "light";

  return "free";
};

export type CongestionLevel = ReturnType<typeof classifyCongestion>;

/** Share of a route's length at moderate or worse that makes the route congested. */
export const CONGESTED_LENGTH_SHARE = 0.2;
/** travelTime ≥ this × typicalTravelTime makes a route slower than usual. */
export const SLOWER_THAN_USUAL_RATIO = 1.3;
/** Readings in a row before either route flag switches, on or off. */
export const FLAG_SWITCH_READINGS = 3;
/** Retained state expires after this; the map greys a route this old. */
export const STATE_TTL_SECONDS = 300;
