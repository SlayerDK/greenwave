import {
  classifyCongestion,
  CONGESTED_LENGTH_SHARE,
  FLAG_SWITCH_READINGS,
  SLOWER_THAN_USUAL_RATIO,
  type CongestionLevel,
  type ObservationSegment,
} from "@greenwave/shared";

export const classifySegments = (segments: ObservationSegment[]) =>
  segments.map(
    (segment): ObservationSegment & { congestion: CongestionLevel } => ({
      ...segment,
      congestion: classifyCongestion({
        currentSpeed: segment.currentSpeedKmh,
        relativeSpeed: segment.relativeSpeedPct,
      }),
    }),
  );

export const routeIsCongested = (
  segments: { lengthM: number; congestion: CongestionLevel }[],
) => {
  const totalLength = segments.reduce(
    (sum, segment) => sum + segment.lengthM,
    0,
  );
  if (totalLength === 0) return false;

  const congestedLength = segments
    .filter((segment) =>
      ["moderate", "heavy", "closed"].includes(segment.congestion),
    )
    .reduce((sum, segment) => sum + segment.lengthM, 0);
  return congestedLength / totalLength >= CONGESTED_LENGTH_SHARE;
};

export const routeIsSlowerThanUsual = (route: {
  travelTimeSec: number;
  typicalTravelTimeSec: number;
}) =>
  route.typicalTravelTimeSec > 0 &&
  route.travelTimeSec >= SLOWER_THAN_USUAL_RATIO * route.typicalTravelTimeSec;

export type Flag = {
  since: Date | null;
  pendingSince: Date | null;
  streak: number;
};

export const nextFlag = (flag: Flag, on: boolean, observedAt: Date): Flag => {
  const currentlyOn = flag.since !== null;
  if (on === currentlyOn) {
    return { ...flag, pendingSince: null, streak: 0 };
  }

  const pendingSince = flag.pendingSince ?? observedAt;
  const streak = flag.streak + 1;
  if (streak < FLAG_SWITCH_READINGS) {
    return { ...flag, pendingSince, streak };
  }

  return on
    ? { since: pendingSince, pendingSince: null, streak: 0 }
    : { since: null, pendingSince: null, streak: 0 };
};

export const isNewer = (observedAt: Date, stored: Date | undefined) =>
  !stored || observedAt > stored;

export const toBucketStart = (observedAt: Date) => {
  const bucket = new Date(observedAt);
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 15) * 15, 0, 0);
  return bucket;
};
