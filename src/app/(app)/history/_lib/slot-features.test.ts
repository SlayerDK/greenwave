import {
  clickedStatsSegmentSchema,
  defaultRouteId,
  formatSlot,
  peakSlotIndex,
  toChartRows,
  toSegmentLines,
  toSlotCollection,
  toSlots,
  toStripLevels,
} from "@/app/(app)/history/_lib/slot-features";
import {
  type SerializedTrafficStatsRoute,
  type SerializedTrafficStatsSegment,
} from "@/lib/traffic-stats/serialization";
import { type TrafficBbox } from "@/lib/traffic/serialization";
import { describe, expect, it } from "vitest";

const SLOT_START = [360, 390, 420];
const SLOT_END = [390, 420, 450];

const segment = (
  id: string,
  routeId: number,
  travelTimeRatios: number[],
): SerializedTrafficStatsSegment => ({
  id,
  routeId,
  ordinal: 0,
  streetName: "Herredsvej",
  speedLimit: 50,
  lengthMeters: 100,
  shape: [
    [10.1, 56.1],
    [10.2, 56.2],
  ],
  harmonicAverageSpeeds: travelTimeRatios.map((ratio) => 50 / ratio),
  travelTimeRatios,
  sampleSizes: [400, 400, 400],
});

const route = (
  id: number,
  medianTravelTimes: number[],
  segments: SerializedTrafficStatsSegment[],
): SerializedTrafficStatsRoute => ({
  id,
  name: `Route ${id}`,
  lengthMeters: 1000,
  medianTravelTimes,
  p10TravelTimes: medianTravelTimes.map((value) => value * 0.8),
  p90TravelTimes: medianTravelTimes.map((value) => value * 1.5),
  datasetId: "dataset",
  segments,
});

const routes = [
  route(1, [60, 90, 120], [segment("a", 1, [1, 1.25, 2.0])]),
  route(2, [60, 300, 120], [segment("b", 2, [1, 2.1, 1.05])]),
];

const bbox: TrafficBbox = [10.1, 56.1, 10.2, 56.2];
const stats = {
  slotStartMinutes: SLOT_START,
  slotEndMinutes: SLOT_END,
  routes,
};

const lines = toSegmentLines(stats);
const congestionAt = (slotIndex: number) =>
  toSlotCollection(lines, bbox, slotIndex).features.map(
    ({ properties }) => properties.congestion,
  );

describe("toSlotCollection", () => {
  it("paints every segment free at the 06:00 baseline", () => {
    expect(congestionAt(0)).toEqual(["free", "free"]);
  });

  it("applies the live thresholds to 100 / travel-time ratio", () => {
    // 1.25 → 80% light, 2.1 → 48% heavy, 2.0 → 50% moderate, 1.05 → 95% free.
    expect(congestionAt(1)).toEqual(["light", "heavy"]);
    expect(congestionAt(2)).toEqual(["moderate", "free"]);
  });

  it("reuses the same geometry objects across slots", () => {
    const first = toSlotCollection(lines, bbox, 0);
    const second = toSlotCollection(lines, bbox, 1);

    expect(second.features[0].geometry).toBe(first.features[0].geometry);
  });

  it("carries click properties that parse back", () => {
    const [feature] = toSlotCollection(lines, bbox, 1).features;

    expect(clickedStatsSegmentSchema.parse(feature.properties)).toEqual({
      segmentKey: "a",
      routeId: 1,
    });
  });
});

describe("slot helpers", () => {
  it("formats slots as local clock ranges", () => {
    expect(formatSlot(465, 480)).toBe("07:45–08:00");
    expect(formatSlot(570, 840)).toBe("09:30–14:00");
    expect(toSlots(stats).map(({ label }) => label)).toEqual([
      "06:00–06:30",
      "06:30–07:00",
      "07:00–07:30",
    ]);
  });

  it("finds the peak slot", () => {
    expect(peakSlotIndex([1, 1.84, 1.2, 1.89, 1.5])).toBe(3);
  });

  it("defaults to the route whose travel time grows most", () => {
    expect(defaultRouteId(routes)).toBe(2);
    expect(defaultRouteId([])).toBeUndefined();
  });

  it("colours the strip from the network ratios", () => {
    expect(toStripLevels([1, 1.89])).toEqual(["free", "moderate"]);
  });

  it("charts minutes with a p10–p90 range", () => {
    const [first] = toChartRows(routes[0], toSlots(stats));

    expect(first).toEqual({
      slot: "06:00",
      label: "06:00–06:30",
      median: 1,
      range: [0.8, 1.5],
    });
  });
});
