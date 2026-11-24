import { describe, expect, it } from "vitest";
import { buildProfiles, segmentKey, type ProfileRow } from "./profile";
import { forecastSegment } from "./run-forecast";

// A Monday: 10:02 local, forecasting 10:15 and 16:00.
const NOW = new Date("2026-11-23T09:02:00Z");
const SLOTS = [
  new Date("2026-11-23T09:15:00Z"),
  new Date("2026-11-23T15:00:00Z"),
];

const row = (slot: number, kmh: number, rel: number): ProfileRow => ({
  routeId: "1",
  segmentId: "a",
  dayType: "weekday",
  slot,
  kmh,
  rel,
  maxKmh: 60,
  maxRel: 100,
  days: 3,
});

const profile = buildProfiles([
  row(40, 50, 90), // 10:00
  row(41, 50, 90), // 10:15
  row(64, 30, 60), // 16:00, the rush hour the profile knows about
]).get(segmentKey("1", "a"));
if (!profile) throw new Error("no profile");

const run = (current: { kmh: number; rel: number } | null) => {
  const sources = { cell: 0, pooled: 0, trafficStats: 0, mean: 0 };
  const result = forecastSegment({
    profile,
    shape: undefined,
    current,
    now: NOW,
    slotStarts: SLOTS,
    tauMinutes: 60,
    sources,
  });

  return { ...result, sources };
};

describe("forecastSegment", () => {
  it("changes across the horizon as the profile does", () => {
    const { relativeSpeedPcts, speedsKmh } = run(null);

    expect(relativeSpeedPcts).toEqual([90, 60]);
    expect(speedsKmh).toEqual([50, 30]);
  });

  it("carries today's deviation near now and fades it later", () => {
    const { speedsKmh } = run({ kmh: 30, rel: 54 });

    // 50 + (30 − 50) · e^(−13/60) ≈ 34; by 16:00 it is back at the profile.
    expect(speedsKmh).toEqual([34, 30]);
  });

  it("counts which fallback level served each slot", () => {
    expect(run(null).sources).toEqual({
      cell: 2,
      pooled: 0,
      trafficStats: 0,
      mean: 0,
    });
  });
});
