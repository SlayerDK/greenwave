import { type Observation } from "@greenwave/shared";
import { toObservation } from "./normalize";
import {
  describeFirstIssue,
  tomtomErrorBodySchema,
  tomtomRouteDetailsSchema,
  TrafficError,
  type TomTomRouteDetails,
  type TrafficErrorCode,
} from "./tomtom-schema";

const ROUTES_URL = "https://api.tomtom.com/routemonitoring/3/routes";
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * TomTom's own `date` header: when TomTom answered. The payload carries no
 * measurement time (`createdAt` is when the route was set up), so this is the
 * closest the adapter gets. The local clock is only the fallback for a missing
 * or unreadable header.
 */
const toObservedAt = (header: string | null) => {
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

type RouteDetailsResult = {
  details: TomTomRouteDetails;
  observedAt: string;
};

/**
 * The URL carries the key as a query parameter, so it is never logged or put
 * into an error message. A 200 whose body is not JSON rejects with the parser's
 * own error rather than a `TrafficError`; the poll treats both as a failed route.
 */
export const fetchRouteDetails = async (
  routeId: string,
  apiKey: string,
): Promise<RouteDetailsResult> => {
  const url = new URL(`${ROUTES_URL}/${routeId}/details`);
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      describeFirstIssue(parsed.error),
    );

  return {
    details: parsed.data,
    observedAt: toObservedAt(response.headers.get("date")),
  };
};

/** The live reader: one TomTom call per read, stamped with TomTom's time. */
export const createTomTomReader =
  ({ apiKey, cityId }: { apiKey: string; cityId: string }) =>
  async (routeId: string): Promise<Observation> => {
    const { details, observedAt } = await fetchRouteDetails(routeId, apiKey);

    return toObservation(details, { cityId, observedAt, source: "live" });
  };
