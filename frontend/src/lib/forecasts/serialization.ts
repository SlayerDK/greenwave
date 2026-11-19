import { type ForecastRunFromDb } from "@/lib/forecasts/queries";

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
