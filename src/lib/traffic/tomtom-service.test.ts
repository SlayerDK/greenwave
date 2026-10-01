import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import { MONITORED_ROUTE_IDS, TrafficError } from "@/lib/traffic/schema";
import { fetchRouteDetails } from "@/lib/traffic/tomtom-service";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The fixture is route 56634, the first of the monitored routes. */
const ROUTE_ID = MONITORED_ROUTE_IDS[0];

vi.mock("@/lib/config/env", () => ({ env: { TOMTOM_API_KEY: "test-key" } }));

const stubFetch = (response: Response) => {
  const mock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", mock);

  return mock;
};

const jsonResponse = (body: unknown, status: number, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

/** Asserts rejection without an `as` cast, and fails loudly when nothing throws. */
const catchTrafficError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TrafficError) return error;

    throw error;
  }

  throw new Error("Expected the call to reject with a TrafficError.");
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRouteDetails", () => {
  it("sends the api key as a query parameter and caches the response", async () => {
    const mock = stubFetch(jsonResponse(routeDetailsFixture, 200));

    await fetchRouteDetails(ROUTE_ID);

    const [url, init] = mock.mock.calls[0];
    expect(url).toBe(
      `https://api.tomtom.com/routemonitoring/3/routes/${ROUTE_ID}/details?key=test-key`,
    );
    expect(init?.next).toEqual({
      revalidate: 60,
      tags: [`traffic-${ROUTE_ID}`],
    });
  });

  it("returns the validated payload", async () => {
    stubFetch(jsonResponse(routeDetailsFixture, 200));

    const { details } = await fetchRouteDetails(ROUTE_ID);

    expect(details.routeName).toBe("Ringvejen sydgående");
    expect(details.detailedSegments).toHaveLength(165);
  });

  it("dates the payload from TomTom, so a cache hit is not reported as fresh", async () => {
    stubFetch(
      jsonResponse(routeDetailsFixture, 200, {
        date: "Mon, 28 Sep 2026 12:51:50 GMT",
      }),
    );

    const { fetchedAt } = await fetchRouteDetails(ROUTE_ID);

    expect(fetchedAt).toBe("2026-09-28T12:51:50.000Z");
  });

  it("falls back to the local clock when the upstream sends no date", async () => {
    stubFetch(
      new Response(JSON.stringify(routeDetailsFixture), { status: 200 }),
    );

    const { fetchedAt } = await fetchRouteDetails(ROUTE_ID);

    expect(Number.isNaN(Date.parse(fetchedAt))).toBe(false);
  });

  it("bypasses the cache when asked for a fresh read", async () => {
    const mock = stubFetch(jsonResponse(routeDetailsFixture, 200));

    await fetchRouteDetails(ROUTE_ID, 0);

    expect(mock.mock.calls[0][1]?.next).toEqual({
      revalidate: 0,
      tags: [`traffic-${ROUTE_ID}`],
    });
  });

  it("reads the `detailedError` envelope returned on 401", async () => {
    stubFetch(
      jsonResponse(
        {
          detailedError: {
            code: "Unauthorized",
            message: "You are missing valid authentication credentials",
          },
        },
        401,
      ),
    );

    const error = await catchTrafficError(fetchRouteDetails(ROUTE_ID));

    expect(error.code).toBe("unauthorized");
    expect(error.status).toBe(401);
    expect(error.message).toBe(
      "You are missing valid authentication credentials",
    );
  });

  it("reads the unrelated `errorMessage` envelope returned on 404", async () => {
    stubFetch(
      jsonResponse({ errorMessage: "Not found Route by id(999999999)" }, 404),
    );

    const error = await catchTrafficError(fetchRouteDetails(999999999));

    expect(error.code).toBe("not_found");
    expect(error.status).toBe(404);
    expect(error.message).toBe("Not found Route by id(999999999)");
  });

  it("falls back to the status text for an unrecognised error body", async () => {
    stubFetch(new Response("<html>gateway</html>", { status: 502 }));

    const error = await catchTrafficError(fetchRouteDetails(ROUTE_ID));

    expect(error.code).toBe("upstream");
    expect(error.status).toBe(502);
  });

  it("rejects a response whose shape drifted", async () => {
    stubFetch(jsonResponse({ routeId: 56634, detailedSegments: [] }, 200));

    const error = await catchTrafficError(fetchRouteDetails(ROUTE_ID));

    expect(error.code).toBe("invalid_response");
    expect(error.status).toBe(502);
  });

  it("reports an unreachable upstream rather than leaking the raw failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("timed out")),
    );

    const error = await catchTrafficError(fetchRouteDetails(ROUTE_ID));

    expect(error.code).toBe("network");
    expect(error.status).toBe(504);
    expect(error.message).toContain("timed out");
  });
});
