import {
  msUntilNextForecast,
  positionToHorizon,
  selectForecastSlot,
  toForecastFeatureCollection,
  type SerializedForecast,
} from "@/lib/forecasts/serialization";
import { type TrafficFeatureCollection } from "@/lib/traffic/serialization";
import { describe, expect, it } from "vitest";

const feature = (segmentIdStr: string) => ({
  type: "Feature" as const,
  id: segmentIdStr,
  geometry: {
    type: "LineString" as const,
    coordinates: [
      [10.1, 56.1],
      [10.2, 56.2],
    ],
  },
  properties: {
    segmentIdStr,
    routeId: 1,
    congestion: "free" as const,
    currentSpeed: 50,
    typicalSpeed: 50,
    averageSpeed: 50,
    relativeSpeed: 100,
    segmentLength: 10,
    confidence: 100,
  },
});

const live: TrafficFeatureCollection = {
  type: "FeatureCollection",
  features: [feature("a"), feature("b")],
};

const forecast: SerializedForecast = {
  generatedAt: "2026-11-23T10:02:00.000Z",
  slotStarts: ["2026-11-23T10:15:00.000Z", "2026-11-23T10:30:00.000Z"],
  tauMinutes: 60,
  segments: [
    {
      routeId: "1",
      segmentId: "a",
      relativeSpeedPcts: [80, 40],
      speedsKmh: [40, 20],
    },
  ],
};

describe("toForecastFeatureCollection", () => {
  it("recolours a segment from the chosen slot", () => {
    const [first] = toForecastFeatureCollection(live, forecast, 1).features;

    expect(first.properties).toMatchObject({
      currentSpeed: 20,
      relativeSpeed: 40,
      congestion: "heavy",
      stale: false,
    });
  });

  it("marks a segment without a forecast stale instead of keeping its live colour", () => {
    const [, second] = toForecastFeatureCollection(live, forecast, 0).features;

    expect(second.properties.stale).toBe(true);
  });

  it("does not read a slot beyond the arrays as a closed road", () => {
    const [first] = toForecastFeatureCollection(live, forecast, 5).features;

    expect(first.properties.stale).toBe(true);
    expect(first.properties.congestion).toBe("free");
  });
});

describe("msUntilNextForecast", () => {
  const at = (time: string) => Date.parse(`2026-11-23T${time}Z`);

  it("waits until a minute after the next predictor run", () => {
    expect(msUntilNextForecast(at("10:02:00"))).toBe(60_000);
    expect(msUntilNextForecast(at("10:10:00"))).toBe(8 * 60_000);
    expect(msUntilNextForecast(at("10:47:30"))).toBe(30_000);
  });

  it("waits a full cycle when called exactly on a read time", () => {
    expect(msUntilNextForecast(at("10:18:00"))).toBe(15 * 60_000);
  });

  it("crosses the hour", () => {
    expect(msUntilNextForecast(at("10:59:00"))).toBe(4 * 60_000);
  });
});

describe("selectForecastSlot", () => {
  const generated = Date.parse(forecast.generatedAt);
  const firstSlot = Date.parse(forecast.slotStarts[0]);
  const hourlater = Date.parse("2026-11-23T11:02:00.000Z");
  // A run old enough to test the age limit, with a slot still ahead of it.
  const longRun = {
    ...forecast,
    slotStarts: [...forecast.slotStarts, "2026-11-23T12:00:00.000Z"],
  };

  it("is null without a forecast", () => {
    expect(selectForecastSlot(null, 15, generated)).toBeNull();
  });

  it("accepts a forecast exactly an hour old and rejects one older", () => {
    expect(selectForecastSlot(longRun, 15, hourlater)).not.toBeNull();
    expect(selectForecastSlot(longRun, 15, hourlater + 1)).toBeNull();
  });

  it("drops slots that have already started", () => {
    expect(selectForecastSlot(forecast, 15, firstSlot)).toMatchObject({
      slotIndex: 1,
      slotCount: 1,
      slotStart: forecast.slotStarts[1],
    });
  });

  it("is null once no slot remains", () => {
    const lastSlot = Date.parse(forecast.slotStarts[1]);

    expect(selectForecastSlot(forecast, 15, lastSlot)).toBeNull();
  });

  it("maps a horizon in minutes to a slot and back", () => {
    const selected = selectForecastSlot(forecast, 30, generated);

    expect(selected?.position).toBe(1);
    expect(positionToHorizon(selected?.position ?? 0)).toBe(30);
  });

  it("clamps a horizon from the URL to the slots that remain", () => {
    expect(selectForecastSlot(forecast, 600, generated)?.position).toBe(1);
    expect(selectForecastSlot(forecast, -30, generated)?.position).toBe(0);
  });
});
