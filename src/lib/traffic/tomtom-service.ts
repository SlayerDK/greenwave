import "server-only";

import { env } from "@/lib/config/env";
import {
  TrafficError,
  tomtomErrorBodySchema,
  tomtomRouteDetailsSchema,
  trafficTag,
  type TomTomRouteDetails,
  type TrafficErrorCode,
} from "@/lib/traffic/schema";

const ROUTES_URL = "https://api.tomtom.com/routemonitoring/3/routes";
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * TomTom refreshes roughly once a minute and answers with `no-store`, which the
 * Next Data Cache ignores in favour of these options. Caching here deduplicates
 * upstream calls across every concurrent viewer; `revalidateTag` forces a refresh.
 */
const REVALIDATE_SECONDS = 60;

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
  revalidateSeconds: number = REVALIDATE_SECONDS,
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
