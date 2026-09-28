import { GET } from "@/app/api/traffic/route";
import { getSession } from "@/lib/auth/session";
import { getRouteTraffic } from "@/lib/traffic/data-access";
import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import {
  DEFAULT_ROUTE_ID,
  tomtomRouteDetailsSchema,
  TrafficError,
} from "@/lib/traffic/schema";
import { serializeRouteTraffic } from "@/lib/traffic/serialization";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/traffic/data-access", () => ({ getRouteTraffic: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

const mockedGetRouteTraffic = vi.mocked(getRouteTraffic);
const mockedGetSession = vi.mocked(getSession);

const NOW = new Date("2026-09-28T12:00:00.000Z");

/** Only the presence of a session matters to the handler, not its contents. */
const signIn = () => {
  mockedGetSession.mockResolvedValue({
    session: {
      id: "session-1",
      createdAt: NOW,
      updatedAt: NOW,
      userId: "user-1",
      expiresAt: new Date("2026-10-28T12:00:00.000Z"),
      token: "token-1",
    },
    user: {
      id: "user-1",
      createdAt: NOW,
      updatedAt: NOW,
      email: "demo@greenwave.local",
      emailVerified: true,
      name: "Demo",
    },
  });
};

const traffic = serializeRouteTraffic(
  tomtomRouteDetailsSchema.parse(routeDetailsFixture),
  "2026-09-28T12:00:00.000Z",
);

const request = (query = "") =>
  new NextRequest(`http://localhost/api/traffic${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  signIn();
});

describe("GET /api/traffic", () => {
  it("refuses a request without a session", async () => {
    mockedGetSession.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockedGetRouteTraffic).not.toHaveBeenCalled();
  });

  it("defaults to the monitored route", async () => {
    mockedGetRouteTraffic.mockResolvedValue(traffic);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mockedGetRouteTraffic).toHaveBeenCalledWith(DEFAULT_ROUTE_ID);
  });

  it("forwards an explicit routeId", async () => {
    mockedGetRouteTraffic.mockResolvedValue(traffic);

    await GET(request("?routeId=57263"));

    expect(mockedGetRouteTraffic).toHaveBeenCalledWith(57263);
  });

  it("rejects a routeId that is not a positive integer", async () => {
    const response = await GET(request("?routeId=not-a-number"));

    expect(response.status).toBe(400);
    expect(mockedGetRouteTraffic).not.toHaveBeenCalled();
  });

  it("surfaces the upstream status carried by a TrafficError", async () => {
    mockedGetRouteTraffic.mockRejectedValue(
      new TrafficError("not_found", 404, "Not found Route by id(999999999)"),
    );

    const response = await GET(request("?routeId=999999999"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Not found Route by id(999999999)",
    });
  });

  it("lets unexpected errors through to the framework", async () => {
    mockedGetRouteTraffic.mockRejectedValue(new Error("boom"));

    await expect(GET(request())).rejects.toThrow("boom");
  });
});
