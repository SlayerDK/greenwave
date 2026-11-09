"use client";

import { RouteTravelTimeChart } from "@/app/(app)/history/_components/route-travel-time-chart";
import { type StatsSelection } from "@/app/(app)/history/_components/stats-segment-popup";
import { TimeSlotTimeline } from "@/app/(app)/history/_components/time-slot-timeline";
import {
  defaultRouteId,
  peakSlotIndex,
  toSegmentLines,
  toSlotCollection,
  toSlots,
  toStripLevels,
} from "@/app/(app)/history/_lib/slot-features";
import { CongestionLegend } from "@/components/traffic/congestion-legend";
import { CONGESTION_STYLE } from "@/components/traffic/congestion-style";
import { type SerializedTrafficStats } from "@/lib/traffic-stats/serialization";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/** `ssr: false` for the same reasons as the live map: mapbox needs `window`. */
const TrafficStatsMap = dynamic(
  () =>
    import("@/app/(app)/history/_components/traffic-stats-map").then(
      (m) => m.TrafficStatsMap,
    ),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-muted" />,
  },
);

const PLAY_STEP_MS = 1000;

/** Every speed is positive, so "Closed" can never be painted here. */
const LEGEND_LEVELS = CONGESTION_STYLE.filter(
  ({ level }) => level !== "closed",
);
const LEGEND_CAPTION =
  "% of the segment's 06:00–06:30 speed: ≥90 free · 75–90 light · 50–75 moderate · <50 heavy";

export const TrafficStatsPanel = ({
  stats,
  mapboxToken,
}: {
  stats: SerializedTrafficStats;
  mapboxToken: string;
}) => {
  const slots = toSlots(stats);
  const ratios = stats.networkTravelTimeRatios;

  // Opens on the network's worst slot: 06:00 is all green by definition.
  const [slotIndex, setSlotIndex] = useState(() => peakSlotIndex(ratios));
  const [isPlaying, setIsPlaying] = useState(false);
  const [routeId, setRouteId] = useState(() => defaultRouteId(stats.routes));
  const [selection, setSelection] = useState<StatsSelection | null>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(
      () => setSlotIndex((index) => (index + 1) % slots.length),
      PLAY_STEP_MS,
    );
    return () => clearInterval(timer);
  }, [isPlaying, slots.length]);

  // React Compiler keeps both stable until their inputs change: the geometry
  // is built once, and only the congestion properties follow the slot.
  const lines = toSegmentLines(stats);
  const featureCollection = toSlotCollection(lines, stats.bbox, slotIndex);

  const selectSlot = (index: number) => {
    setIsPlaying(false);
    setSlotIndex(index);
  };

  return (
    <div className="flex flex-col gap-4">
      <TimeSlotTimeline
        slots={slots}
        levels={toStripLevels(ratios)}
        slotIndex={slotIndex}
        onSlotChange={selectSlot}
        isPlaying={isPlaying}
        onPlayingChange={setIsPlaying}
        readout={`${slots[slotIndex].label} · network travel time ${ratios[slotIndex].toFixed(2)}× 06:00`}
      />

      <div className="h-[60vh] min-h-96 overflow-hidden rounded-lg border">
        <TrafficStatsMap
          featureCollection={featureCollection}
          routes={stats.routes}
          slotIndex={slotIndex}
          selection={selection}
          onSelectionChange={(next) => {
            setSelection(next);
            if (next) setRouteId(next.routeId);
          }}
          mapboxToken={mapboxToken}
        />
      </div>

      <CongestionLegend levels={LEGEND_LEVELS} caption={LEGEND_CAPTION} />

      {routeId !== undefined && (
        <RouteTravelTimeChart
          routes={stats.routes}
          routeId={routeId}
          onRouteChange={setRouteId}
          slots={slots}
          slotIndex={slotIndex}
          onSlotChange={selectSlot}
        />
      )}
    </div>
  );
};
