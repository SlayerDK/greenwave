import { recordRouteSnapshotsAction } from "@/lib/traffic/actions";
import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import {
  MONITORED_ROUTE_IDS,
  tomtomRouteDetailsSchema,
  TrafficError,
  trafficTag,
} from "@/lib/traffic/schema";
import { fetchRouteDetails } from "@/lib/traffic/tomtom-service";
import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `vi.hoisted` keeps the handle on the mutation mock without importing
 * `mutations` here — that import is restricted outside the data layer.
 */
const { recordSnapshot } = vi.hoisted(() => ({ recordSnapshot: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ requireAuth: vi.fn() }));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/traffic/tomtom-service", () => ({ fetchRouteDetails: vi.fn() }));
vi.mock("@/lib/traffic/mutations", () => ({
  trafficMutations: { recordSnapshot },
}));

const mockedFetch = vi.mocked(fetchRouteDetails);
const mockedUpdateTag = vi.mocked(updateTag);

const details = tomtomRouteDetailsSchema.parse(routeDetailsFixture);
const FETCHED_AT = "2026-09-28T12:00:00.000Z";

/** Every route answers with the same fixture; only the count is under test. */
const everyRouteAnswers = () => {
  mockedFetch.mockResolvedValue({ details, fetchedAt: FETCHED_AT });
  recordSnapshot.mockResolvedValue({ id: "snapshot-1" });
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("recordRouteSnapshotsAction", () => {
  it("records one snapshot per monitored route", async () => {
    everyRouteAnswers();

    const result = await recordRouteSnapshotsAction();

    expect(result).toEqual({
      success: true,
      data: {
        recorded: MONITORED_ROUTE_IDS.map((routeId) => ({
          routeId,
          segmentCount: 165,
        })),
        failed: [],
      },
    });
    expect(recordSnapshot).toHaveBeenCalledTimes(MONITORED_ROUTE_IDS.length);
  });

  it("reads every upstream uncached so the snapshots are of this moment", async () => {
    everyRouteAnswers();

    await recordRouteSnapshotsAction();

    MONITORED_ROUTE_IDS.forEach((routeId) => {
      expect(mockedFetch).toHaveBeenCalledWith(routeId, 0);
    });
  });

  /**
   * Without this the `router.refresh()` that follows a successful record
   * re-renders out of the read cache, so the map keeps painting the payload the
   * snapshot has already superseded — a silent staleness with no failing call.
   */
  it("drops the read cache entry of every route it has read past", async () => {
    everyRouteAnswers();

    await recordRouteSnapshotsAction();

    expect(mockedUpdateTag).toHaveBeenCalledTimes(MONITORED_ROUTE_IDS.length);
    MONITORED_ROUTE_IDS.forEach((routeId) => {
      expect(mockedUpdateTag).toHaveBeenCalledWith(trafficTag(routeId));
    });
  });

  it("still records the other routes when one is unavailable", async () => {
    const [failing, ...rest] = MONITORED_ROUTE_IDS;

    mockedFetch.mockImplementation((routeId) =>
      routeId === failing
        ? Promise.reject(
            new TrafficError(
              "not_found",
              404,
              `Not found Route by id(${routeId})`,
            ),
          )
        : Promise.resolve({ details, fetchedAt: FETCHED_AT }),
    );
    recordSnapshot.mockResolvedValue({ id: "snapshot-1" });

    const result = await recordRouteSnapshotsAction();

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.recorded.map(({ routeId }) => routeId)).toEqual(rest);
    expect(result.data.failed).toEqual([
      { routeId: failing, error: `Not found Route by id(${failing})` },
    ]);

    // The route that never answered has nothing newer to expire.
    expect(mockedUpdateTag).not.toHaveBeenCalledWith(trafficTag(failing));
    expect(mockedUpdateTag).toHaveBeenCalledTimes(rest.length);
  });

  it("lets an unexpected error through rather than reporting it as a failed route", async () => {
    mockedFetch.mockRejectedValue(new Error("boom"));

    const result = await recordRouteSnapshotsAction();

    expect(result).toEqual({
      success: false,
      error: "Something went wrong. Please try again.",
    });
  });
});
