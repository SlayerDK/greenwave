import { describe, expect, it } from "vitest";
import {
  buildProfiles,
  buildRouteShape,
  resolveProfile,
  segmentKey,
  type ProfileRow,
  type SegmentProfile,
} from "./profile";

const row = (overrides: Partial<ProfileRow>): ProfileRow => ({
  routeId: "1",
  segmentId: "a",
  dayType: "weekday",
  slot: 40,
  rel: 80,
  kmh: 40,
  maxRel: 100,
  maxKmh: 50,
  days: 3,
  ...overrides,
});

const profileOf = (rows: ProfileRow[]): SegmentProfile => {
  const profile = buildProfiles(rows).get(segmentKey("1", "a"));
  if (!profile) throw new Error("no profile");
  return profile;
};

// Twice as slow as the route's mean travel time from 10:00 to 11:00.
const shape = buildRouteShape({
  slotStartMinutes: [360, 600, 660],
  slotEndMinutes: [600, 660, 1080],
  medianTravelTimes: [100, 200, 300],
});

describe("resolveProfile", () => {
  it("uses the cell with at least three days", () => {
    expect(
      resolveProfile(profileOf([row({})]), "weekday", 40, shape),
    ).toMatchObject({ rel: 80, kmh: 40, source: "cell" });
  });

  it("pools both day types when the cell is thin", () => {
    const profile = profileOf([
      row({ days: 2, rel: 60, kmh: 30 }),
      row({ dayType: "weekend", days: 2, rel: 100, kmh: 50 }),
    ]);

    expect(resolveProfile(profile, "weekday", 40, shape)).toMatchObject({
      rel: 80,
      kmh: 40,
      source: "pooled",
    });
  });

  it("uses the Traffic Stats shape at 10:00 when the slot is thin", () => {
    const profile = profileOf([row({ days: 2, slot: 10, rel: 80, kmh: 40 })]);
    const result = resolveProfile(profile, "weekday", 40, shape);

    expect(result.source).toBe("trafficStats");
    expect(result.kmh).toBeCloseTo(40); // mean travel time 200 ÷ 200
  });

  it("falls back to the mean at 19:00, outside Traffic Stats", () => {
    const profile = profileOf([row({ days: 2, slot: 10 })]);

    expect(resolveProfile(profile, "weekday", 76, shape).source).toBe("mean");
  });

  it("falls back to the mean without a linked route", () => {
    const profile = profileOf([row({ days: 2, slot: 10 })]);

    expect(resolveProfile(profile, "weekday", 40, undefined).source).toBe(
      "mean",
    );
  });

  it("has no profile for a segment without history", () => {
    expect(buildProfiles([]).get(segmentKey("1", "a"))).toBeUndefined();
  });

  it("weights the mean by days, so each day counts once", () => {
    const profile = profileOf([
      row({ days: 1, slot: 10, kmh: 10, rel: 10 }),
      row({ days: 2, slot: 11, kmh: 40, rel: 40 }),
    ]);

    expect(resolveProfile(profile, "weekday", 76, undefined).kmh).toBe(30);
  });

  it("keeps the highest value seen on any day", () => {
    const profile = profileOf([
      row({ slot: 10, maxKmh: 45, maxRel: 90 }),
      row({ slot: 11, maxKmh: 70, maxRel: 95 }),
    ]);

    expect(profile.maxKmh).toBe(70);
    expect(profile.maxRel).toBe(95);
  });
});

describe("buildRouteShape", () => {
  it("looks up uneven slots by minute range", () => {
    expect(shape(24)).toBeCloseTo(2); // 06:00, travel time 100
    expect(shape(40)).toBeCloseTo(1); // 10:00, travel time 200
    expect(shape(44)).toBeCloseTo(2 / 3); // 11:00, travel time 300
  });

  it("has no value outside the export", () => {
    expect(shape(76)).toBeNull();
  });
});
