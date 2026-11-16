import { describe, expect, it } from "vitest";
import {
  classifySegments,
  isNewer,
  nextFlag,
  routeIsCongested,
  routeIsSlowerThanUsual,
  toBucketStart,
  type Flag,
} from "./rules";

const date = (minute: number) =>
  new Date(`2026-11-16T12:${String(minute).padStart(2, "0")}:00.000Z`);

describe("backend rules", () => {
  it("classifies segments and weights congestion by length", () => {
    const classified = classifySegments([
      {
        id: "a",
        lengthM: 100,
        currentSpeedKmh: 10,
        averageSpeedKmh: 10,
        typicalSpeedKmh: 20,
        relativeSpeedPct: 40,
        confidencePct: 100,
        coordinates: [
          [1, 2],
          [2, 3],
        ],
      },
    ]);
    expect(classified[0].congestion).toBe("heavy");
    expect(
      routeIsCongested([
        { lengthM: 80, congestion: "free" },
        { lengthM: 21, congestion: "heavy" },
      ]),
    ).toBe(true);
  });
  it("applies route flags and avoids zero-time division", () => {
    expect(
      routeIsSlowerThanUsual({ travelTimeSec: 130, typicalTravelTimeSec: 100 }),
    ).toBe(true);
    expect(
      routeIsSlowerThanUsual({ travelTimeSec: 1, typicalTravelTimeSec: 0 }),
    ).toBe(false);
  });
  it("switches after three agreeing readings and uses the first time", () => {
    let flag: Flag = { since: null, pendingSince: null, streak: 0 };
    flag = nextFlag(flag, true, date(1));
    flag = nextFlag(flag, true, date(2));
    flag = nextFlag(flag, true, date(3));
    expect(flag.since).toEqual(date(1));
  });
  it("resets disagreement when the reading agrees again", () => {
    let flag: Flag = { since: date(0), pendingSince: date(1), streak: 1 };
    flag = nextFlag(flag, true, date(2));
    expect(flag).toEqual({ since: date(0), pendingSince: null, streak: 0 });
  });
  it("does not switch on alternating readings", () => {
    let flag: Flag = { since: null, pendingSince: null, streak: 0 };
    for (const [minute, on] of [
      [1, true],
      [2, false],
      [3, true],
      [4, false],
      [5, true],
    ] as [number, boolean][]) {
      flag = nextFlag(flag, on, date(minute));
    }
    expect(flag.since).toBeNull();
  });
  it("handles ordering and UTC quarter-hour buckets", () => {
    expect(isNewer(date(2), date(2))).toBe(false);
    expect(toBucketStart(new Date("2026-11-16T12:14:59.999Z"))).toEqual(
      new Date("2026-11-16T12:00:00.000Z"),
    );
    expect(toBucketStart(new Date("2026-11-16T12:15:00.000Z"))).toEqual(
      new Date("2026-11-16T12:15:00.000Z"),
    );
  });
});
