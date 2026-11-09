"use client";

import { type Slot } from "@/app/(app)/history/_lib/slot-features";
import { CONGESTION_STYLE } from "@/components/traffic/congestion-style";
import { Button } from "@/components/ui/button";
import { type CongestionLevel } from "@/lib/traffic/serialization";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Slider } from "radix-ui";

/** A slot longer than this is drawn as one compressed cell, and marked so. */
const COMPRESSED_MINUTES = 60;

const colorOf = (level: CongestionLevel) =>
  CONGESTION_STYLE.find((entry) => entry.level === level)?.color;

/**
 * Every slot gets an equal-width cell, whatever its duration, so the
 * 15-minute peak slots are as easy to hit as the 4½-hour midday block.
 *
 * The thumb is exactly one cell wide: Radix keeps the thumb inside the track by
 * offsetting it by up to half its width, which with a one-cell thumb lands it
 * precisely on each cell's centre.
 */
export const TimeSlotTimeline = ({
  slots,
  levels,
  slotIndex,
  onSlotChange,
  isPlaying,
  onPlayingChange,
  readout,
}: {
  slots: readonly Slot[];
  /** The network-wide level per slot, colouring the strip. */
  levels: readonly CongestionLevel[];
  slotIndex: number;
  /** Called on user input only — it pauses playback. */
  onSlotChange: (slotIndex: number) => void;
  isPlaying: boolean;
  onPlayingChange: (isPlaying: boolean) => void;
  readout: string;
}) => {
  const columns = { gridTemplateColumns: `repeat(${slots.length}, 1fr)` };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          aria-label={isPlaying ? "Pause" : "Play through the day"}
          onClick={() => onPlayingChange(!isPlaying)}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <p className="text-sm tabular-nums" aria-live="polite">
          {readout}
        </p>
      </div>

      <div className="@container relative">
        <div
          aria-hidden
          className="grid h-8 gap-0.5 overflow-hidden rounded-md"
          style={columns}
        >
          {slots.map((slot, index) => (
            <div
              key={slot.startMinute}
              className="relative"
              title={slot.label}
              style={{ backgroundColor: colorOf(levels[index]) }}
            >
              {slot.endMinute - slot.startMinute > COMPRESSED_MINUTES && (
                <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_4px,rgb(255_255_255/0.55)_4px_6px)]" />
              )}
            </div>
          ))}
        </div>

        <Slider.Root
          className="absolute inset-0 flex touch-none items-center select-none"
          min={0}
          max={slots.length - 1}
          step={1}
          value={[slotIndex]}
          onValueChange={([value]) => onSlotChange(value)}
        >
          <Slider.Track className="relative h-full grow" />
          <Slider.Thumb
            aria-label="Time of day"
            aria-valuetext={slots[slotIndex]?.label}
            className="block h-10 rounded-md border-2 border-foreground bg-foreground/10 shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            style={{ width: `calc(100cqw / ${slots.length})` }}
          />
        </Slider.Root>
      </div>

      <div
        aria-hidden
        className="grid text-[10px] text-muted-foreground tabular-nums"
        style={columns}
      >
        {slots.map((slot) => (
          <span
            key={slot.startMinute}
            className="-translate-x-1/2 first:translate-x-0"
          >
            {slot.startMinute % 60 === 0 ? slot.startLabel : ""}
          </span>
        ))}
      </div>
    </div>
  );
};
