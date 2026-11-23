import type { ForecastRunFromDb } from "@/lib/forecasts/queries";
import type { TrafficFeatureCollection } from "@/lib/traffic/serialization";
import { classifyCongestion } from "@greenwave/shared";

/** The predictor runs every 15 minutes, so older means it has stopped. */
const FORECAST_MAX_AGE_MS = 60 * 60 * 1000;
const SLOT_MINUTES = 15;
const SLOT_MS = SLOT_MINUTES * 60 * 1000;
/** The predictor starts at :02, :17, :32 and :47; read a minute later. */
const FORECAST_READ_OFFSET_MS = 3 * 60 * 1000;

export const serializeForecast = (row: ForecastRunFromDb) => ({
  generatedAt: row.generatedAt.toISOString(),
  slotStarts: row.slotStarts.map((slot) => slot.toISOString()),
  tauMinutes: row.tauMinutes,
  segments: row.segments.map((segment) => ({
    routeId: segment.routeId,
    segmentId: segment.segmentId,
    relativeSpeedPcts: segment.relativeSpeedPcts,
    speedsKmh: segment.speedsKmh,
  })),
});

export type SerializedForecast = ReturnType<typeof serializeForecast>;

/** Time until the next :03, :18, :33 or :48. */
export const msUntilNextForecast = (now: number) =>
  SLOT_MS - ((now - FORECAST_READ_OFFSET_MS) % SLOT_MS);

const isForecastFresh = (generatedAt: string, now: number) =>
  now - new Date(generatedAt).getTime() <= FORECAST_MAX_AGE_MS;

/** Indexes into `slotStarts` of the slots that have not started yet. */
const remainingSlotIndexes = (slotStarts: readonly string[], now: number) =>
  slotStarts.flatMap((slot, index) =>
    new Date(slot).getTime() > now ? [index] : [],
  );

/**
 * The URL keeps a horizon in minutes rather than a slot index, so "+1 hour"
 * still means that after a reload picks up a newer run.
 */
const horizonToPosition = (horizonMinutes: number, slotCount: number) =>
  Math.min(
    Math.max(Math.round(horizonMinutes / SLOT_MINUTES) - 1, 0),
    Math.max(slotCount - 1, 0),
  );

export const positionToHorizon = (position: number) =>
  (position + 1) * SLOT_MINUTES;

/**
 * What the horizon control and predicted map show right now, or null when
 * there is no fresh forecast with a slot still ahead.
 */
export const selectForecastSlot = (
  forecast: SerializedForecast | null,
  horizonMinutes: number,
  now: number,
) => {
  if (!forecast || !isForecastFresh(forecast.generatedAt, now)) return null;

  const slotIndexes = remainingSlotIndexes(forecast.slotStarts, now);
  const position = horizonToPosition(horizonMinutes, slotIndexes.length);
  const slotIndex = slotIndexes[position];
  if (slotIndex === undefined) return null;

  return {
    forecast,
    slotIndex,
    position,
    slotCount: slotIndexes.length,
    slotStart: forecast.slotStarts[slotIndex],
  };
};

/**
 * Recolours the live geometry for one forecast slot. A segment without a
 * forecast is marked stale: keeping its live colour would present the current
 * reading as a prediction.
 */
export const toForecastFeatureCollection = (
  live: TrafficFeatureCollection,
  forecast: SerializedForecast,
  slotIndex: number,
): TrafficFeatureCollection => {
  const bySegment = new Map(
    forecast.segments.map((segment) => [segment.segmentId, segment]),
  );

  return {
    ...live,
    features: live.features.map((feature) => {
      const segment = bySegment.get(feature.properties.segmentIdStr);
      const currentSpeed = segment?.speedsKmh[slotIndex];
      const relativeSpeed = segment?.relativeSpeedPcts[slotIndex];

      if (currentSpeed === undefined || relativeSpeed === undefined) {
        return {
          ...feature,
          properties: { ...feature.properties, stale: true },
        };
      }

      return {
        ...feature,
        properties: {
          ...feature.properties,
          currentSpeed,
          relativeSpeed,
          congestion: classifyCongestion({ currentSpeed, relativeSpeed }),
          stale: false,
        },
      };
    }),
  };
};
