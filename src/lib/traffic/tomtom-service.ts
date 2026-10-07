import "server-only";

import { env } from "@/lib/config/env";
import {
  MONITORED_ROUTE_IDS,
  TRAFFIC_REFRESH_SECONDS,
  TrafficError,
  tomtomErrorBodySchema,
  tomtomRouteDetailsSchema,
  trafficTag,
  type TomTomRouteDetails,
  type TrafficErrorCode,
} from "@/lib/traffic/schema";
import { type RouteOutcome } from "@/lib/traffic/serialization";

const ROUTES_URL = "https://api.tomtom.com/routemonitoring/3/routes";
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * TomTom answers with `no-store`, which the Next Data Cache ignores in favour of
 * these options. Caching here deduplicates upstream calls across every
 * concurrent viewer; `recordRouteSnapshotAction` calls `updateTag` to expire the
 * entry once it has read something newer.
 */

/**
 * TomTom's own `date` header, which the Data Cache stores with the response.
 * Stamping the clock at serialize time instead would report "now" for a payload
 * that may be up to a full revalidation window old.
 */
const toFetchedAt = (header: string | null) => {
  const upstream = header ? new Date(header) : null;

  return upstream && !Number.isNaN(upstream.getTime())
    ? upstream.toISOString()
    : new Date().toISOString();
};

const toErrorCode = (status: number): TrafficErrorCode => {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";

  return "upstream";
};

const toErrorMessage = (body: unknown, fallback: string) => {
  const parsed = tomtomErrorBodySchema.safeParse(body);
  if (!parsed.success) return fallback;

  return "detailedError" in parsed.data
    ? parsed.data.detailedError.message
    : parsed.data.errorMessage;
};

export type RouteDetailsResult = {
  details: TomTomRouteDetails;
  /** When TomTom produced the payload, not when we read it out of the cache. */
  fetchedAt: string;
};

/** `revalidateSeconds: 0` bypasses the cache — what the ingest path needs. */
export const fetchRouteDetails = async (
  routeId: number,
  revalidateSeconds: number = TRAFFIC_REFRESH_SECONDS,
): Promise<RouteDetailsResult> => {
  const url = new URL(`${ROUTES_URL}/${routeId}/details`);
  url.searchParams.set("key", env.TOMTOM_API_KEY);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: revalidateSeconds, tags: [trafficTag(routeId)] },
    });
  } catch (error) {
    throw new TrafficError(
      "network",
      504,
      `Could not reach TomTom: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);

    throw new TrafficError(
      toErrorCode(response.status),
      response.status,
      toErrorMessage(body, response.statusText),
    );
  }

  const payload: unknown = await response.json();
  const parsed = tomtomRouteDetailsSchema.safeParse(payload);
  if (!parsed.success)
    throw new TrafficError(
      "invalid_response",
      502,
      `Unexpected TomTom response shape: ${parsed.error.issues[0].message}`,
    );

  return {
    details: parsed.data,
    fetchedAt: toFetchedAt(response.headers.get("date")),
  };
};

/**
 * Reads every monitored route, shared by the map (`getNetworkTraffic`) and the
 * hourly history job. Read in parallel, not in sequence: `fetchRouteDetails`
 * allows itself eight seconds per call, so thirteen awaits in a row would take
 * up to two minutes.
 *
 * `Promise.all` rather than `allSettled` — `readRoute` only rejects on a
 * genuine fault, so a rejected entry would be a bug being swallowed.
 *
 * The explicit arrow matters: `.map(readRoute)` would pass each array index as
 * `revalidateSeconds`, silently caching route i for i seconds.
 */
export const readMonitoredRoutes = async (
  revalidateSeconds?: number,
): Promise<RouteOutcome[]> =>
  Promise.all(
    MONITORED_ROUTE_IDS.map((routeId) => readRoute(routeId, revalidateSeconds)),
  );

/**
 * A `TrafficError` is an expected outcome — TomTom down, rate-limiting, or not
 * recognising the route — so it becomes this route's failure value and the rest
 * of the network still comes back. Anything else is a real fault and is left
 * to throw.
 */
const readRoute = async (
  routeId: number,
  revalidateSeconds?: number,
): Promise<RouteOutcome> => {
  try {
    const { details, fetchedAt } = await fetchRouteDetails(
      routeId,
      revalidateSeconds,
    );

    return { ok: true, details, fetchedAt };
  } catch (error) {
    if (error instanceof TrafficError)
      return { ok: false, routeId, error: error.message };

    throw error;
  }
};
