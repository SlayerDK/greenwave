import { GET } from "@/app/api/cron/traffic-history/route";
import {
  recordTrafficHistory,
  type TrafficHistoryRun,
} from "@/lib/traffic/history-service";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { SECRET } = vi.hoisted(() => ({
  SECRET: "test-cron-secret-0123456789",
}));

vi.mock("@/lib/config/env", () => ({ env: { CRON_SECRET: SECRET } }));
vi.mock("@/lib/traffic/history-service", () => ({
  recordTrafficHistory: vi.fn(),
}));

const mockedRecord = vi.mocked(recordTrafficHistory);

const request = (authorization?: string) =>
  new NextRequest("http://localhost/api/cron/traffic-history", {
    headers: authorization ? { authorization } : {},
  });

const run: TrafficHistoryRun = {
  recordedAt: "2026-10-07T12:00:00.000Z",
  inserted: 165,
  recorded: [{ routeId: 56634, segmentCount: 165 }],
  failed: [],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/cron/traffic-history", () => {
  it("refuses a request without the cron secret", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("refuses a request with the wrong secret", async () => {
    const response = await GET(request("Bearer not-the-secret"));

    expect(response.status).toBe(401);
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it("records the hour and returns the run", async () => {
    mockedRecord.mockResolvedValue(run);

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(run);
  });

  /** A non-2xx is what makes the scheduler's run fail and notify someone. */
  it("fails the run when no route answered", async () => {
    mockedRecord.mockResolvedValue({
      ...run,
      inserted: 0,
      recorded: [],
      failed: [{ routeId: 56634, error: "down" }],
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(502);
  });

  it("lets unexpected errors through to the framework", async () => {
    mockedRecord.mockRejectedValue(new Error("boom"));

    await expect(GET(request(`Bearer ${SECRET}`))).rejects.toThrow("boom");
  });
});
