import { observationSchema } from "@greenwave/shared";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toObservation } from "./normalize";
import { TrafficError, tomtomRouteDetailsSchema } from "./tomtom-schema";

const OBSERVED_AT = "2026-11-17T15:21:00.000Z";
const reading = {
  cityId: "aarhus",
  observedAt: OBSERVED_AT,
  source: "live",
} as const;

/** The recording as TomTom sent it, and parsed as the adapter parses it. */
const load = (routeId: string) => {
  const raw = readFileSync(
    new URL(`../fixtures/route-${routeId}.json`, import.meta.url),
    "utf8",
  );

  return { raw, details: tomtomRouteDetailsSchema.parse(JSON.parse(raw)) };
};

describe.each(["56634", "313727"])("toObservation on route %s", (routeId) => {
  const { raw, details } = load(routeId);
  const observation = toObservation(details, reading);

  it("passes observationSchema", () => {
    expect(observationSchema.safeParse(observation).success).toBe(true);
  });

  it("survives the trip through the broker unchanged", () => {
    const received = observationSchema.parse(
      JSON.parse(JSON.stringify(observation)),
    );

    expect(received).toEqual(observation);
  });

  it("keeps every segment id exactly as TomTom wrote it", () => {
    const written = [...raw.matchAll(/"segmentIdStr":\s*"(\d+)"/g)].map(
      ([, id]) => id,
    );

    expect(observation.segments.map(({ id }) => id)).toEqual(written);
  });

  it("puts longitude first", () => {
    const [{ latitude, longitude }] = details.detailedSegments[0].shape;

    expect(observation.segments[0].coordinates[0]).toEqual([
      longitude,
      latitude,
    ]);
  });

  it("derives the event id from the reading", () => {
    expect(observation.eventId).toBe(`aarhus:${routeId}:${OBSERVED_AT}`);
  });
});

describe("toObservation", () => {
  it("does not read the lossy numeric segmentId", () => {
    const { raw } = load("56634");
    const parsed = JSON.parse(raw) as {
      detailedSegments: { segmentId: number; segmentIdStr: string }[];
    };
    const corrupted = parsed.detailedSegments.filter(
      ({ segmentId, segmentIdStr }) => String(segmentId) !== segmentIdStr,
    );

    // Why it matters: JSON.parse rounds 165 of the 166 ids on this route.
    expect(corrupted).toHaveLength(165);
  });

  it("trims TomTom's CW_AU_ prefix and leaves other names alone", () => {
    expect(toObservation(load("313727").details, reading).route.name).toBe(
      "Edwin Rahrs Vej østgående",
    );
    expect(toObservation(load("56634").details, reading).route.name).toBe(
      "Ringvejen sydgående",
    );
  });

  it("rejects a value the contract does not allow, naming its path", () => {
    const { details } = load("56634");
    details.detailedSegments[2].currentSpeed = 12.5;
    const normalize = () => toObservation(details, reading);

    expect(normalize).toThrow(TrafficError);
    expect(normalize).toThrow(
      expect.objectContaining({ code: "invalid_response" }),
    );
    expect(normalize).toThrow(/^segments\.2\.currentSpeedKmh: /);
  });
});
