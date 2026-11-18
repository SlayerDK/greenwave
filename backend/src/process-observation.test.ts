import { createPrismaClient, type DatabaseClient } from "@greenwave/database";
import {
  observationSchema,
  toEventId,
  type Observation,
} from "@greenwave/shared";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fixture from "../../shared/src/fixtures/observation-56634.json";
import { processObservation } from "./process-observation";

/** Never DATABASE_URL: these tests empty every pipeline table. */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_DATABASE_NAME = "greenwave_test";

const base = observationSchema.parse(fixture);
const where = { cityId: base.cityId, routeId: base.routeId };

/** The shared fixture, read again at `observedAt`. */
const reading = (
  observedAt: string,
  changes: Partial<Observation> = {},
): Observation => ({
  ...base,
  ...changes,
  observedAt,
  eventId: toEventId(base.cityId, base.routeId, observedAt),
});

/** Every segment heavy: the whole route counts as congested. */
const congested = (observedAt: string) =>
  reading(observedAt, {
    segments: base.segments.map((segment) => ({
      ...segment,
      relativeSpeedPct: 10,
    })),
  });

describe.skipIf(!TEST_DATABASE_URL)("processObservation", () => {
  let prisma: DatabaseClient;

  beforeAll(() => {
    const url = TEST_DATABASE_URL ?? "";
    if (new URL(url).pathname !== `/${TEST_DATABASE_NAME}`)
      throw new Error(
        `TEST_DATABASE_URL must name the ${TEST_DATABASE_NAME} database`,
      );

    // Both variables: prisma.config.ts prefers the unpooled one, and its
    // dotenv call fills in whatever is unset from the root .env.
    execFileSync(
      "pnpm",
      ["--filter", "@greenwave/database", "migrate:deploy"],
      {
        env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
        stdio: "pipe",
      },
    );
    prisma = createPrismaClient(url);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE traffic_observation_receipt, traffic_route, traffic_segment,
      traffic_route_state, traffic_segment_state, traffic_segment_history`;
  });

  const historyCounts = async () =>
    (
      await prisma.trafficSegmentHistory.findMany({
        where,
        select: { sampleCount: true },
      })
    ).map((row) => row.sampleCount);

  it("writes a redelivered reading once", async () => {
    const observation = reading("2026-11-18T12:00:00.000Z");

    const first = await processObservation(prisma, observation);
    const second = await processObservation(prisma, observation);

    expect(first.status).toBe("current");
    expect(second).toEqual({ status: "duplicate" });
    expect(await prisma.trafficObservationReceipt.count()).toBe(1);
    expect(new Set(await historyCounts())).toEqual(new Set([1]));
  });

  it("counts a late reading in the history but leaves the state alone", async () => {
    await processObservation(prisma, reading("2026-11-18T12:01:00.000Z"));

    const late = await processObservation(
      prisma,
      reading("2026-11-18T12:00:00.000Z"),
    );

    expect(late).toEqual({ status: "stale" });
    const state = await prisma.trafficRouteState.findUniqueOrThrow({
      where: { cityId_routeId: where },
    });
    expect(state.observedAt.toISOString()).toBe("2026-11-18T12:01:00.000Z");
    // Both are in the 12:00 bucket.
    const counts = await historyCounts();
    expect(counts).toHaveLength(base.segments.length);
    expect(new Set(counts)).toEqual(new Set([2]));
  });

  it("writes a fixture reading's state but no history", async () => {
    const result = await processObservation(
      prisma,
      reading("2026-11-18T12:00:00.000Z", { source: "fixture" }),
    );

    expect(result.status).toBe("current");
    expect(await prisma.trafficSegmentState.count({ where })).toBe(
      base.segments.length,
    );
    expect(await historyCounts()).toEqual([]);
  });

  it("dates the congested flag from the first of three congested readings", async () => {
    const times = [
      "2026-11-18T12:00:00.000Z",
      "2026-11-18T12:01:00.000Z",
      "2026-11-18T12:02:00.000Z",
    ];
    const results = [];
    for (const time of times)
      results.push(await processObservation(prisma, congested(time)));

    const routes = results.map((result) =>
      result.status === "current" ? result.state.route.congestedSince : "none",
    );
    expect(routes).toEqual([null, null, times[0]]);
  });
});
