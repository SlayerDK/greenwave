"use client";

import {
  peakSlotIndex,
  toChartRows,
  type Slot,
} from "@/app/(app)/history/_lib/slot-features";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type SerializedTrafficStatsRoute } from "@/lib/traffic-stats/serialization";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

/**
 * One series, so one hue — blue, kept clear of the congestion ramp's
 * red/orange/yellow/green so the chart never reads as a congestion level.
 * The band is the same hue at low opacity: it belongs to the line.
 */
const chartConfig = {
  median: {
    label: "Median",
    theme: { light: "oklch(0.55 0.15 255)", dark: "oklch(0.72 0.12 255)" },
  },
  range: {
    label: "10th–90th percentile",
    theme: { light: "oklch(0.55 0.15 255)", dark: "oklch(0.72 0.12 255)" },
  },
} satisfies ChartConfig;

const formatMinutes = (value: unknown) =>
  Array.isArray(value)
    ? `${String(value[0])}–${String(value[1])} min`
    : `${String(value)} min`;

const formatMultiple = (value: number) => `${value.toFixed(1)}×`;

export const RouteTravelTimeChart = ({
  routes,
  routeId,
  onRouteChange,
  slots,
  slotIndex,
  onSlotChange,
}: {
  routes: readonly SerializedTrafficStatsRoute[];
  routeId: number;
  onRouteChange: (routeId: number) => void;
  slots: readonly Slot[];
  slotIndex: number;
  onSlotChange: (slotIndex: number) => void;
}) => {
  const route = routes.find(({ id }) => id === routeId) ?? routes[0];
  const rows = toChartRows(route, slots);
  const baseline = rows[0];
  const peak = rows[peakSlotIndex(rows.map(({ median }) => median))];
  const selected = rows[slotIndex];

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Travel time through the day</h2>
        <Select
          value={String(route.id)}
          onValueChange={(value) => onRouteChange(Number(value))}
        >
          <SelectTrigger aria-label="Route" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {routes.map(({ id, name }) => (
              <SelectItem key={id} value={String(id)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={({ activeTooltipIndex }) => {
            const index = Number(activeTooltipIndex);
            if (Number.isInteger(index) && index >= 0) onSlotChange(index);
          }}
          className="cursor-pointer"
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="slot"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            unit=" min"
            domain={[0, "auto"]}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) =>
                  rows.find(({ slot }) => slot === String(value))?.label
                }
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">
                      {chartConfig[name === "range" ? "range" : "median"].label}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatMinutes(value)}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Area
            dataKey="range"
            type="monotone"
            fill="var(--color-range)"
            fillOpacity={0.18}
            stroke="none"
            isAnimationActive={false}
          />
          <ReferenceLine
            y={baseline.median}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
          />
          <Line
            dataKey="median"
            type="monotone"
            stroke="var(--color-median)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine x={selected.slot} stroke="var(--foreground)" />
        </ComposedChart>
      </ChartContainer>

      {/* The text alternative: the chart's three facts in words. */}
      <p className="text-sm text-muted-foreground">
        {route.name}: {baseline.median} min at {baseline.label} (dashed line).
        Peak {peak.median} min at {peak.label} (
        {formatMultiple(peak.median / baseline.median)}). At {selected.label}:{" "}
        {selected.median} min median, 80% of trips{" "}
        {formatMinutes(selected.range)}.
      </p>
    </section>
  );
};
