import { GET } from "@/app/api/traffic/route";
import { getSession } from "@/lib/auth/session";
import { getNetworkTraffic } from "@/lib/traffic/data-access";
import edwinRahrsFixture from "@/lib/traffic/fixtures/route-details-313727.json";
import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import { tomtomRouteDetailsSchema } from "@/lib/traffic/schema";
import {
  serializeNetworkTraffic,
  type NetworkTraffic,
} from "@/lib/traffic/serialization";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/traffic/data-access", () => ({ getNetworkTraffic: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

const mockedGetNetworkTraffic = vi.mocked(getNetworkTraffic);
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

const traffic = serializeNetworkTraffic([
  {
    ok: true,
    details: tomtomRouteDetailsSchema.parse(routeDetailsFixture),
    fetchedAt: "2026-09-28T12:00:00.000Z",
  },
  {
    ok: true,
    details: tomtomRouteDetailsSchema.parse(edwinRahrsFixture),
    fetchedAt: "2026-09-28T12:00:30.000Z",
  },
  { ok: false, routeId: 313719, error: "Not found Route by id(313719)" },
]);

beforeEach(() => {
  vi.resetAllMocks();
  signIn();
});

describe("GET /api/traffic", () => {
  it("refuses a request without a session", async () => {
    mockedGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockedGetNetworkTraffic).not.toHaveBeenCalled();
  });

  it("returns every monitored route that answered", async () => {
    mockedGetNetworkTraffic.mockResolvedValue(traffic);

    const response = await GET();

    expect(response.status).toBe(200);

    const body = (await response.json()) as NetworkTraffic;
    expect(body.routes.map(({ summary }) => summary.routeId)).toEqual([
      56634, 313727,
    ]);
  });

  /**
   * An unreachable route is a value in the payload, not a status: one route
   * must not cost a poll the twelve that did answer.
   */
  it("reports a failed route without failing the response", async () => {
    mockedGetNetworkTraffic.mockResolvedValue(traffic);

    const response = await GET();

    expect(response.status).toBe(200);

    const body = (await response.json()) as NetworkTraffic;
    expect(body.failures).toEqual([
      { routeId: 313719, error: "Not found Route by id(313719)" },
    ]);
  });

  it("lets unexpected errors through to the framework", async () => {
    mockedGetNetworkTraffic.mockRejectedValue(new Error("boom"));

    await expect(GET()).rejects.toThrow("boom");
  });
});
