import { type Observation } from "@greenwave/shared";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { toObservation } from "./normalize";
import {
  tomtomRouteDetailsSchema,
  type TomTomRouteDetails,
} from "./tomtom-schema";

const FIXTURES_DIR = new URL("../fixtures/", import.meta.url);

/**
 * Each segment's current speed scaled by one factor in [0.9, 1.1], with its
 * relative speed scaled alike so the two stay consistent. Everything else,
 * including the route's travel times, stays as recorded.
 */
export const jitterSpeeds = (
  details: TomTomRouteDetails,
  random: () => number,
): TomTomRouteDetails => ({
  ...details,
  detailedSegments: details.detailedSegments.map((segment) => {
    const factor = 0.9 + 0.2 * random();

    return {
      ...segment,
      currentSpeed: Math.round(segment.currentSpeed * factor),
      relativeSpeed: Math.round(segment.relativeSpeed * factor),
    };
  }),
});

/** A missing or malformed file rejects here, at start-up, naming the file. */
const loadFixture = async (routeId: string) => {
  const file = fileURLToPath(new URL(`route-${routeId}.json`, FIXTURES_DIR));
  try {
    const raw: unknown = JSON.parse(await readFile(file, "utf8"));

    return tomtomRouteDetailsSchema.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot load fixture ${file}: ${reason}`, { cause: error });
  }
};

/**
 * The development reader: recorded TomTom answers with jittered speeds,
 * labelled `fixture`. A recording has no TomTom time, so each read is stamped
 * with `now()`; a fixed time would give every replay the same `eventId`.
 */
export const loadFixtureReader = async (
  routeIds: readonly string[],
  {
    cityId,
    random = Math.random,
    now = () => new Date(),
  }: { cityId: string; random?: () => number; now?: () => Date },
) => {
  const fixtures = new Map(
    await Promise.all(
      routeIds.map(async (id) => [id, await loadFixture(id)] as const),
    ),
  );

  return async (routeId: string): Promise<Observation> => {
    const fixture = fixtures.get(routeId);
    if (!fixture) throw new Error(`No fixture loaded for route ${routeId}`);

    return toObservation(jitterSpeeds(fixture, random), {
      cityId,
      observedAt: now().toISOString(),
      source: "fixture",
    });
  };
};
