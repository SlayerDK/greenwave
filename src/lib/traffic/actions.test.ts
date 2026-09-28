import { recordRouteSnapshotAction } from "@/lib/traffic/actions";
import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import {
  DEFAULT_ROUTE_ID,
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

beforeEach(() => {
  vi.resetAllMocks();
});

describe("recordRouteSnapshotAction", () => {
  it("stores a snapshot and reports what it wrote", async () => {
    mockedFetch.mockResolvedValue({
      details,
      fetchedAt: "2026-09-28T12:00:00.000Z",
    });
    recordSnapshot.mockResolvedValue({ id: "snapshot-1" });

    const result = await recordRouteSnapshotAction(DEFAULT_ROUTE_ID);

    expect(result).toEqual({
      success: true,
      data: { snapshotId: "snapshot-1", segmentCount: 165 },
    });
  });

  it("reads the upstream uncached so the snapshot is of this moment", async () => {
    mockedFetch.mockResolvedValue({
      details,
      fetchedAt: "2026-09-28T12:00:00.000Z",
    });
    recordSnapshot.mockResolvedValue({ id: "snapshot-1" });

    await recordRouteSnapshotAction(DEFAULT_ROUTE_ID);

    expect(mockedFetch).toHaveBeenCalledWith(DEFAULT_ROUTE_ID, 0);
  });

  /**
   * Without this the `router.refresh()` that follows a successful record
   * re-renders out of the read cache, so the map keeps painting the payload the
   * snapshot has already superseded — a silent staleness with no failing call.
   */
  it("drops the read cache entry it has just read past", async () => {
    mockedFetch.mockResolvedValue({
      details,
      fetchedAt: "2026-09-28T12:00:00.000Z",
    });
    recordSnapshot.mockResolvedValue({ id: "snapshot-1" });

    await recordRouteSnapshotAction(DEFAULT_ROUTE_ID);

    expect(mockedUpdateTag).toHaveBeenCalledWith(trafficTag(DEFAULT_ROUTE_ID));
  });

  it("returns an upstream failure as a result rather than throwing", async () => {
    mockedFetch.mockRejectedValue(
      new TrafficError("not_found", 404, "Not found Route by id(1)"),
    );

    const result = await recordRouteSnapshotAction(1);

    expect(result).toEqual({
      success: false,
      error: "Not found Route by id(1)",
    });
    expect(recordSnapshot).not.toHaveBeenCalled();
    expect(mockedUpdateTag).not.toHaveBeenCalled();
  });

  it("rejects a routeId that is not a positive integer", async () => {
    const result = await recordRouteSnapshotAction(-5);

    expect(result.success).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
