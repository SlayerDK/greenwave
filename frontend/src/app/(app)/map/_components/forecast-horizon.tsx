"use client";

import { type selectForecastSlot } from "@/lib/forecasts/serialization";

const clockFormat = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatClock = (instant: string) =>
  clockFormat.format(new Date(instant));

export const ForecastHorizon = ({
  selected,
  onPositionChange,
}: {
  selected: ReturnType<typeof selectForecastSlot>;
  onPositionChange: (position: number) => void;
}) => {
  if (!selected) return null;

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Prediction horizon</p>
        <p className="text-xs text-muted-foreground">
          Forecast made at {formatClock(selected.forecast.generatedAt)}
        </p>
      </div>
      <input
        aria-label="Prediction horizon"
        className="w-full"
        type="range"
        min={0}
        max={selected.slotCount - 1}
        value={selected.position}
        onChange={(event) =>
          onPositionChange(Number(event.currentTarget.value))
        }
      />
      <p className="mt-1 text-sm text-muted-foreground">
        Predicted for {formatClock(selected.slotStart)}
      </p>
    </div>
  );
};
