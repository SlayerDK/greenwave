import { observationSchema } from "@greenwave/shared";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTomTomReader, fetchRouteDetails } from "./tomtom";
import { TrafficError } from "./tomtom-schema";

const ROUTE_ID = "56634";

/** The recording exactly as TomTom sent it. */
const recording = readFileSync(
  new URL(`../fixtures/route-${ROUTE_ID}.json`, import.meta.url),
  "utf8",
);

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
  it("sends the api key as a query parameter", async () => {
    const mock = stubFetch(new Response(recording, { status: 200 }));

    await fetchRouteDetails(ROUTE_ID, "test-key");

    expect(mock.mock.calls[0][0]).toBe(
      `https://api.tomtom.com/routemonitoring/3/routes/${ROUTE_ID}/details?key=test-key`,
    );
  });

  it("returns the validated payload", async () => {
    stubFetch(new Response(recording, { status: 200 }));

    const { details } = await fetchRouteDetails(ROUTE_ID, "test-key");

    expect(details.routeName).toBe("Ringvejen sydgående");
    expect(details.detailedSegments).toHaveLength(166);
  });

  it("dates the reading from TomTom's date header", async () => {
    stubFetch(
      new Response(recording, {
        status: 200,
        headers: { date: "Mon, 28 Sep 2026 12:51:50 GMT" },
      }),
    );

    const { observedAt } = await fetchRouteDetails(ROUTE_ID, "test-key");

    expect(observedAt).toBe("2026-09-28T12:51:50.000Z");
  });

  it("falls back to the local clock when TomTom sends no date", async () => {
    stubFetch(new Response(recording, { status: 200 }));
    const before = Date.now();

    const { observedAt } = await fetchRouteDetails(ROUTE_ID, "test-key");

    expect(Date.parse(observedAt)).toBeGreaterThanOrEqual(before);
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

    const error = await catchTrafficError(
      fetchRouteDetails(ROUTE_ID, "test-key"),
    );

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

    const error = await catchTrafficError(
      fetchRouteDetails("999999999", "test-key"),
    );

    expect(error.code).toBe("not_found");
    expect(error.status).toBe(404);
    expect(error.message).toBe("Not found Route by id(999999999)");
  });

  it("reports rate limiting", async () => {
    stubFetch(new Response(null, { status: 429 }));

    const error = await catchTrafficError(
      fetchRouteDetails(ROUTE_ID, "test-key"),
    );

    expect(error.code).toBe("rate_limited");
  });

  it("falls back to the status text for an unrecognised error body", async () => {
    stubFetch(new Response("<html>gateway</html>", { status: 502 }));

    const error = await catchTrafficError(
      fetchRouteDetails(ROUTE_ID, "test-key"),
    );

    expect(error.code).toBe("upstream");
    expect(error.status).toBe(502);
  });

  it("rejects a response whose shape drifted, naming the field", async () => {
    const drifted = JSON.parse(recording) as {
      detailedSegments: Record<string, unknown>[];
    };
    delete drifted.detailedSegments[3].currentSpeed;
    stubFetch(jsonResponse(drifted, 200));

    const error = await catchTrafficError(
      fetchRouteDetails(ROUTE_ID, "test-key"),
    );

    expect(error.code).toBe("invalid_response");
    expect(error.status).toBe(502);
    expect(error.message).toMatch(/^detailedSegments\.3\.currentSpeed: /);
  });

  it("reports an unreachable TomTom rather than leaking the raw failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("timed out")),
    );

    const error = await catchTrafficError(
      fetchRouteDetails(ROUTE_ID, "test-key"),
    );

    expect(error.code).toBe("network");
    expect(error.status).toBe(504);
    expect(error.message).toContain("timed out");
  });

  it("rejects a 200 whose body is not JSON with an error that is not a TrafficError", async () => {
    stubFetch(new Response("not json", { status: 200 }));

    await expect(fetchRouteDetails(ROUTE_ID, "test-key")).rejects.toThrow(
      SyntaxError,
    );
  });
});

describe("createTomTomReader", () => {
  it("returns a live observation stamped with TomTom's time", async () => {
    stubFetch(
      new Response(recording, {
        status: 200,
        headers: { date: "Tue, 17 Nov 2026 15:21:00 GMT" },
      }),
    );
    const read = createTomTomReader({ apiKey: "test-key", cityId: "aarhus" });

    const observation = await read(ROUTE_ID);

    expect(observationSchema.parse(observation)).toEqual(observation);
    expect(observation.source).toBe("live");
    expect(observation.routeId).toBe(ROUTE_ID);
    expect(observation.observedAt).toBe("2026-11-17T15:21:00.000Z");
  });
});
