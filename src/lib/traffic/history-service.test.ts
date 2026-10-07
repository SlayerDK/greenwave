import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import { recordTrafficHistory } from "@/lib/traffic/history-service";
import {
  MONITORED_ROUTE_IDS,
  tomtomRouteDetailsSchema,
} from "@/lib/traffic/schema";
import { type RouteOutcome } from "@/lib/traffic/serialization";
import { readMonitoredRoutes } from "@/lib/traffic/tomtom-service";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `vi.hoisted` keeps the handle on the mutation mock without importing
 * `mutations` here — that import is restricted outside the data layer.
 */
const { recordHistory } = vi.hoisted(() => ({ recordHistory: vi.fn() }));

vi.mock("@/lib/traffic/tomtom-service", () => ({
  readMonitoredRoutes: vi.fn(),
}));
vi.mock("@/lib/traffic/mutations", () => ({
  trafficMutations: { recordHistory },
}));

const mockedRead = vi.mocked(readMonitoredRoutes);

const details = tomtomRouteDetailsSchema.parse(routeDetailsFixture);
const FETCHED_AT = "2026-10-07T12:34:50.000Z";

const answered = (): RouteOutcome => ({
  ok: true,
  details,
  fetchedAt: FETCHED_AT,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:34:56.789Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordTrafficHistory", () => {
  it("reads every route uncached so the rows describe this moment", async () => {
    mockedRead.mockResolvedValue(MONITORED_ROUTE_IDS.map(answered));
    recordHistory.mockResolvedValue({ count: 0 });

    await recordTrafficHistory();

    expect(mockedRead).toHaveBeenCalledWith(0);
  });

  it("writes every answered route in one call, keyed by the run's hour", async () => {
    mockedRead.mockResolvedValue(MONITORED_ROUTE_IDS.map(answered));
    recordHistory.mockResolvedValue({ count: 2145 });

    const run = await recordTrafficHistory();

    expect(recordHistory).toHaveBeenCalledTimes(1);
    expect(recordHistory).toHaveBeenCalledWith(
      MONITORED_ROUTE_IDS.map(() => details),
      new Date("2026-10-07T12:00:00.000Z"),
    );
    expect(run).toEqual({
      recordedAt: "2026-10-07T12:00:00.000Z",
      inserted: 2145,
      recorded: MONITORED_ROUTE_IDS.map(() => ({
        routeId: details.routeId,
        segmentCount: 165,
      })),
      failed: [],
    });
  });

  it("reports nothing inserted when the hour was already recorded", async () => {
    mockedRead.mockResolvedValue(MONITORED_ROUTE_IDS.map(answered));
    recordHistory.mockResolvedValue({ count: 0 });

    const run = await recordTrafficHistory();

    expect(run.inserted).toBe(0);
    expect(run.recorded).toHaveLength(MONITORED_ROUTE_IDS.length);
  });

  it("still records the other routes when one is unavailable", async () => {
    const [failing, ...rest] = MONITORED_ROUTE_IDS;
    mockedRead.mockResolvedValue([
      { ok: false, routeId: failing, error: "Not found" },
      ...rest.map(answered),
    ]);
    recordHistory.mockResolvedValue({ count: 1 });

    const run = await recordTrafficHistory();

    expect(recordHistory.mock.calls[0][0]).toHaveLength(rest.length);
    expect(run.failed).toEqual([{ routeId: failing, error: "Not found" }]);
  });

  it("skips the write entirely when no route answered", async () => {
    mockedRead.mockResolvedValue(
      MONITORED_ROUTE_IDS.map((routeId) => ({
        ok: false,
        routeId,
        error: "down",
      })),
    );

    const run = await recordTrafficHistory();

    expect(recordHistory).not.toHaveBeenCalled();
    expect(run.inserted).toBe(0);
    expect(run.recorded).toEqual([]);
    expect(run.failed).toHaveLength(MONITORED_ROUTE_IDS.length);
  });
});
