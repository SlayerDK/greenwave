import { describe, expect, it } from "vitest";
import {
  evaluateDay,
  recordSample,
  toCsv,
  type BacktestSegment,
  type Scoreboard,
} from "./evaluate";
import { buildProfiles, segmentKey } from "./profile";
import { QUARTER_HOUR_MS } from "./slots";

// A Monday, 10:00 local.
const START = Date.parse("2026-11-23T09:00:00Z");
const quarterHours = [0, 1, 2].map(
  (index) => new Date(START + index * QUARTER_HOUR_MS),
);

const segment = (): BacktestSegment => {
  const profile = buildProfiles(
    [40, 41, 42].map((slot) => ({
      routeId: "1",
      segmentId: "a",
      dayType: "weekday" as const,
      slot,
      rel: 100,
      kmh: 50,
      maxRel: 100,
      maxKmh: 50,
      days: 3,
    })),
  ).get(segmentKey("1", "a"));
  if (!profile) throw new Error("no profile");

  return {
    key: "1:a",
    lengthM: 100,
    profile,
    shape: undefined,
    buckets: new Map([
      [quarterHours[0].getTime(), { kmh: 30, rel: 60, typicalKmh: 45 }],
      [quarterHours[1].getTime(), { kmh: 40, rel: 80, typicalKmh: 45 }],
      [quarterHours[2].getTime(), { kmh: 50, rel: 100, typicalKmh: 45 }],
    ]),
  };
};

const scoreOf = (board: Scoreboard, id: string) => {
  const score = board.get(id);
  if (!score) throw new Error(`no score for ${id}`);
  return score;
};

describe("evaluateDay", () => {
  const board: Scoreboard = new Map();
  evaluateDay(board, quarterHours, [segment()]);

  it("scores persistence against the later bucket", () => {
    // From 10:00: |30−40| at +15. From 10:15: |40−50| at +15.
    const score = scoreOf(board, "persistence||15m");

    expect(score.absoluteError / score.length).toBe(10);
    expect(score.samples).toBe(2);
  });

  it("scores the profile baseline without using the current reading", () => {
    const score = scoreOf(board, "profile||30m");

    expect(score.absoluteError / score.length).toBe(0); // target is 50, P is 50
    expect(score.samples).toBe(1);
  });

  it("scores every τ of our method", () => {
    for (const tau of [15, 30, 60, 120]) {
      expect(board.has(`ours|${tau}|15m`)).toBe(true);
    }
  });

  it("never forecasts backwards from the last bucket", () => {
    expect(scoreOf(board, "persistence||15m").samples).toBe(2);
    expect(board.has("persistence||rest-of-day")).toBe(false);
  });
});

describe("recordSample", () => {
  it("weights errors and level accuracy by segment length", () => {
    const board: Scoreboard = new Map();
    const common = { method: "m", tau: "" as const, horizon: "15m" };

    recordSample(board, {
      ...common,
      predicted: { kmh: 50, rel: 100 },
      actual: { kmh: 50, rel: 100 },
      segmentKey: "long",
      lengthM: 900,
    });
    recordSample(board, {
      ...common,
      predicted: { kmh: 50, rel: 100 },
      actual: { kmh: 10, rel: 20 },
      segmentKey: "short",
      lengthM: 100,
    });

    const score = scoreOf(board, "m||15m");
    expect(score.absoluteError / score.length).toBe(4);
    expect(score.correctLength / score.length).toBe(0.9);
    expect(score.segments.size).toBe(2);
  });
});

describe("rounding", () => {
  it("scores every method on the whole km/h the forecast would store", () => {
    const board: Scoreboard = new Map();
    recordSample(board, {
      method: "m",
      tau: "",
      horizon: "15m",
      predicted: { kmh: 40.4, rel: 80 },
      actual: { kmh: 40, rel: 80 },
      segmentKey: "a",
      lengthM: 10,
    });

    expect(scoreOf(board, "m||15m").absoluteError).toBe(0);
  });

  it("rounds the profile baseline before scoring it", () => {
    const board: Scoreboard = new Map();
    const fractional = segment();
    const profileCells = buildProfiles(
      [40, 41, 42].map((slot) => ({
        routeId: "1",
        segmentId: "a",
        dayType: "weekday" as const,
        slot,
        rel: 83.4,
        kmh: 41.4,
        maxRel: 100,
        maxKmh: 50,
        days: 3,
      })),
    ).get(segmentKey("1", "a"));
    if (!profileCells) throw new Error("no profile");

    evaluateDay(board, quarterHours, [
      { ...fractional, profile: profileCells },
    ]);

    const profile = scoreOf(board, "profile||30m");
    expect(profile.absoluteError / profile.length).toBe(9); // |41 − 50|
  });
});

describe("toCsv", () => {
  it("writes the planned columns", () => {
    const board: Scoreboard = new Map();
    recordSample(board, {
      method: "ours",
      tau: 60,
      horizon: "1h",
      predicted: { kmh: 40, rel: 80 },
      actual: { kmh: 50, rel: 100 },
      segmentKey: "a",
      lengthM: 10,
    });

    expect(toCsv(board)).toBe(
      "method,tau,horizon,maeKmh,levelAccuracy,segments,samples\nours,60,1h,10.000,0.0000,1,1\n",
    );
  });
});
