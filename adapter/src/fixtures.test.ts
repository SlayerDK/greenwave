import { observationSchema } from "@greenwave/shared";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AARHUS_ROUTE_IDS } from "./env";
import { jitterSpeeds, loadFixtureReader } from "./fixtures";
import { tomtomRouteDetailsSchema } from "./tomtom-schema";

const readRecording = (routeId: string) =>
  readFileSync(
    new URL(`../fixtures/route-${routeId}.json`, import.meta.url),
    "utf8",
  );

const recorded = tomtomRouteDetailsSchema.parse(
  JSON.parse(readRecording("313727")),
);

describe("jitterSpeeds", () => {
  it.each([
    [() => 0, 0.9],
    [() => 0.999, 0.9 + 0.2 * 0.999],
  ])("scales both speeds by the same factor", (random, factor) => {
    const jittered = jitterSpeeds(recorded, random);

    jittered.detailedSegments.forEach((segment, i) => {
      const original = recorded.detailedSegments[i];
      expect(segment.currentSpeed).toBe(
        Math.round(original.currentSpeed * factor),
      );
      expect(segment.relativeSpeed).toBe(
        Math.round(original.relativeSpeed * factor),
      );
      expect(Number.isInteger(segment.currentSpeed)).toBe(true);
    });
  });

  it("changes nothing but the two speeds", () => {
    const jittered = jitterSpeeds(recorded, () => 0);
    const withoutSpeeds = ({
      detailedSegments,
      ...route
    }: typeof recorded) => ({
      ...route,
      detailedSegments: detailedSegments.map(
        ({ currentSpeed: _c, relativeSpeed: _r, ...rest }) => rest,
      ),
    });

    expect(withoutSpeeds(jittered)).toEqual(withoutSpeeds(recorded));
  });
});

describe("loadFixtureReader", () => {
  it("labels each read as a fixture, stamped with the time of the read", async () => {
    const times = ["2026-11-17T15:21:00.000Z", "2026-11-17T15:22:00.000Z"];
    const read = await loadFixtureReader(["313727"], {
      cityId: "aarhus",
      random: () => 0.5,
      now: () => new Date(times.shift() ?? ""),
    });

    const first = await read("313727");
    const second = await read("313727");

    expect(first.source).toBe("fixture");
    expect(first.observedAt).toBe("2026-11-17T15:21:00.000Z");
    expect(second.observedAt).toBe("2026-11-17T15:22:00.000Z");
    expect(second.eventId).not.toBe(first.eventId);
  });

  it("rejects at start-up when a recording is missing, naming it", async () => {
    await expect(
      loadFixtureReader(["1"], { cityId: "aarhus" }),
    ).rejects.toThrow(/route-1\.json/);
  });

  it("loads all 13 committed recordings into valid observations", async () => {
    const read = await loadFixtureReader(AARHUS_ROUTE_IDS, {
      cityId: "aarhus",
    });

    for (const routeId of AARHUS_ROUTE_IDS) {
      const observation = await read(routeId);
      expect(observationSchema.safeParse(observation).success).toBe(true);
      expect(observation.routeId).toBe(routeId);
    }
  });

  // A file that was parsed and re-serialized would have rounded segmentIds.
  it.each(AARHUS_ROUTE_IDS)(
    "route-%s.json is byte-for-byte as TomTom sent it",
    (routeId) => {
      const raw = readRecording(routeId);
      const pairs = [
        ...raw.matchAll(/"segmentId":\s*(\d+),\s*"segmentIdStr":\s*"(\d+)"/g),
      ];
      const segments = (JSON.parse(raw) as { detailedSegments: unknown[] })
        .detailedSegments;

      expect(pairs).toHaveLength(segments.length);
      pairs.forEach(([, numeric, string]) => expect(numeric).toBe(string));
    },
  );
});
