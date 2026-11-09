import {
  type SerializedTrafficStats,
  type SerializedTrafficStatsRoute,
  type SerializedTrafficStatsSegment,
} from "@/lib/traffic-stats/serialization";
import {
  classifyCongestion,
  type CongestionLevel,
  type LineFeatureCollection,
  type TrafficBbox,
} from "@/lib/traffic/serialization";
import { type LineString } from "geojson";
import { z } from "zod";

/**
 * Only what the layer paints and the click resolves — the popup reads the rest
 * from the serialized segment, so each slot change re-uploads three properties
 * per feature rather than the whole record.
 */
export type StatsSegmentProperties = {
  segmentKey: string;
  routeId: number;
  congestion: CongestionLevel;
};

/**
 * Mapbox hands a clicked feature's properties back untyped. Keyed on
 * properties, not the feature `id`: mapbox drops ids that are not numbers.
 */
export const clickedStatsSegmentSchema = z.object({
  segmentKey: z.string(),
  routeId: z.number(),
});

type SegmentLine = {
  segment: SerializedTrafficStatsSegment;
  geometry: LineString;
};

/**
 * Built once per dataset so every slot's collection shares the same geometry
 * objects — only the congestion property changes as the timeline moves.
 */
export const toSegmentLines = ({
  routes,
}: Pick<SerializedTrafficStats, "routes">): SegmentLine[] =>
  routes.flatMap(({ segments }) =>
    segments.map((segment) => ({
      segment,
      geometry: { type: "LineString", coordinates: segment.shape },
    })),
  );

/**
 * TomTom's travel-time ratio is against the 06:00 slot, so 100 / ratio is the
 * slot's speed as a percentage of the segment's own 06:00 speed. Fed through
 * the live map's thresholds, so both pages share one set of cut-offs — but
 * measured against 06:00, not free flow. Speeds are always positive here, so
 * "closed" cannot occur.
 */
export const percentOfBaseline = (travelTimeRatio: number) =>
  Math.round(100 / travelTimeRatio);

const levelForRatio = (travelTimeRatio: number, speed = 1) =>
  classifyCongestion({
    currentSpeed: speed,
    relativeSpeed: percentOfBaseline(travelTimeRatio),
  });

export const toSlotCollection = (
  lines: readonly SegmentLine[],
  bbox: TrafficBbox | undefined,
  slotIndex: number,
): LineFeatureCollection<StatsSegmentProperties> => ({
  type: "FeatureCollection",
  bbox,
  features: lines.map(({ segment, geometry }) => ({
    type: "Feature",
    geometry,
    properties: {
      segmentKey: segment.id,
      routeId: segment.routeId,
      congestion: levelForRatio(
        segment.travelTimeRatios[slotIndex],
        segment.harmonicAverageSpeeds[slotIndex],
      ),
    },
  })),
});

export const findStatsSegment = (
  routes: readonly SerializedTrafficStatsRoute[],
  routeId: number,
  segmentKey: string,
) => {
  const route = routes.find(({ id }) => id === routeId);
  const segment = route?.segments.find(({ id }) => id === segmentKey);

  return route && segment ? { route, segment } : undefined;
};

const formatMinute = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** 465, 480 → "07:45–08:00". */
export const formatSlot = (startMinute: number, endMinute: number) =>
  `${formatMinute(startMinute)}–${formatMinute(endMinute)}`;

export type Slot = {
  startMinute: number;
  endMinute: number;
  label: string;
  startLabel: string;
};

export const toSlots = ({
  slotStartMinutes,
  slotEndMinutes,
}: Pick<SerializedTrafficStats, "slotStartMinutes" | "slotEndMinutes">) =>
  slotStartMinutes.map((startMinute, index): Slot => ({
    startMinute,
    endMinute: slotEndMinutes[index],
    label: formatSlot(startMinute, slotEndMinutes[index]),
    startLabel: formatMinute(startMinute),
  }));

export const peakSlotIndex = (values: readonly number[]) =>
  values.indexOf(Math.max(...values));

const peakTravelTimeRatio = ({
  medianTravelTimes,
}: SerializedTrafficStatsRoute) =>
  Math.max(...medianTravelTimes) / medianTravelTimes[0];

/** The route whose travel time grows most over its 06:00 level. */
export const defaultRouteId = (
  routes: readonly SerializedTrafficStatsRoute[],
) =>
  routes.reduce<SerializedTrafficStatsRoute | undefined>(
    (worst, route) =>
      !worst || peakTravelTimeRatio(route) > peakTravelTimeRatio(worst)
        ? route
        : worst,
    undefined,
  )?.id;

/** The network-wide colour of each timeline cell. */
export const toStripLevels = (ratios: readonly number[]) =>
  ratios.map((ratio) => levelForRatio(ratio));

const toMinutes = (seconds: number) => Math.round((seconds / 60) * 10) / 10;

/** Travel times in minutes, one row per slot; `range` is p10–p90. */
export const toChartRows = (
  route: SerializedTrafficStatsRoute,
  slots: readonly Slot[],
) =>
  slots.map((slot, index) => ({
    slot: slot.startLabel,
    label: slot.label,
    median: toMinutes(route.medianTravelTimes[index]),
    range: [
      toMinutes(route.p10TravelTimes[index]),
      toMinutes(route.p90TravelTimes[index]),
    ],
  }));
