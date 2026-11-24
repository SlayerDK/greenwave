import edwinRahrsFixture from "@/lib/traffic/fixtures/route-details-313727.json";
import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import { type NetworkRouteFromDb } from "@/lib/traffic/queries";
import { tomtomRouteDetailsSchema } from "@/lib/traffic/schema";
import {
  applyRouteState,
  isRouteStale,
  mergeFeatureCollections,
  parseLiveMessage,
  serializeNetworkFromDb,
  serializeNetworkTraffic,
  serializeRouteState,
  serializeRouteTraffic,
  staleRouteKey,
  toLiveFeatureCollection,
  toRouteLabel,
  updateOfflineCities,
} from "@/lib/traffic/serialization";
import { STATE_TTL_SECONDS, type RouteState } from "@greenwave/shared";
import { describe, expect, it } from "vitest";

const FETCHED_AT = "2026-09-28T12:00:00.000Z";
const OTHER_FETCHED_AT = "2026-09-28T12:00:30.000Z";

const details = tomtomRouteDetailsSchema.parse(routeDetailsFixture);
const { summary, featureCollection } = serializeRouteTraffic(
  details,
  FETCHED_AT,
);

/** A second real route: 14 segments, and the only one carrying the prefix. */
const otherDetails = tomtomRouteDetailsSchema.parse(edwinRahrsFixture);
const other = serializeRouteTraffic(otherDetails, OTHER_FETCHED_AT);

describe("tomtomRouteDetailsSchema", () => {
  it("accepts a real route-details response", () => {
    expect(
      tomtomRouteDetailsSchema.safeParse(routeDetailsFixture).success,
    ).toBe(true);
  });
});

describe("serializeRouteTraffic", () => {
  it("emits one LineString feature per segment", () => {
    expect(featureCollection.type).toBe("FeatureCollection");
    expect(featureCollection.features).toHaveLength(165);
    expect(
      featureCollection.features.every(
        (feature) => feature.geometry.type === "LineString",
      ),
    ).toBe(true);
  });

  it("writes coordinates as [longitude, latitude], not TomTom's order", () => {
    const [first] = featureCollection.features[0].geometry.coordinates;

    expect(first).toEqual([10.21815, 56.18899]);

    // Aarhus is ~10°E, ~56°N. A flipped pair would put longitude in the 56s.
    const flipped = featureCollection.features.flatMap((feature) =>
      feature.geometry.coordinates.filter(
        ([longitude, latitude]) => longitude > 50 || latitude < 50,
      ),
    );
    expect(flipped).toHaveLength(0);
  });

  it("identifies segments by a string id that survives JSON round-tripping", () => {
    const ids = featureCollection.features.map((feature) => feature.id);

    expect(ids.every((id) => typeof id === "string")).toBe(true);
    expect(new Set(ids).size).toBe(165);

    // Why the string matters: all but one of these ids exceed
    // Number.MAX_SAFE_INTEGER, so using the numeric `segmentId` would corrupt them.
    const lossyAsNumber = ids.filter((id) => String(Number(id)) !== id);
    expect(lossyAsNumber).toHaveLength(164);
  });

  it("computes a [west, south, east, north] bbox", () => {
    expect(featureCollection.bbox).toEqual([
      10.14304, 56.12864, 10.21815, 56.18899,
    ]);
  });

  it("classifies congestion from relative speed", () => {
    const counts = featureCollection.features.reduce<Record<string, number>>(
      (accumulator, feature) => {
        const { congestion } = feature.properties;
        accumulator[congestion] = (accumulator[congestion] ?? 0) + 1;

        return accumulator;
      },
      {},
    );

    expect(counts).toEqual({ heavy: 10, moderate: 109, light: 30, free: 16 });
  });

  it("keeps route metadata out of the feature collection", () => {
    expect(summary).toEqual({
      routeId: 56634,
      routeName: "Ringvejen sydgående",
      routeStatus: "ACTIVE",
      passable: true,
      routeLength: 9637,
      travelTime: 1017,
      typicalTravelTime: 977,
      delayTime: 323,
      completeness: 100,
      routeConfidence: 100,
      fetchedAt: FETCHED_AT,
    });
    expect(featureCollection).not.toHaveProperty("summary");
  });
});

describe("toRouteLabel", () => {
  it("trims the internal prefix TomTom puts on the corridor routes", () => {
    expect(toRouteLabel("CW_AU_Randersvej sydgående")).toBe(
      "Randersvej sydgående",
    );
    expect(other.summary.routeName).toBe("Edwin Rahrs Vej østgående");
  });

  it("leaves a name without the prefix alone", () => {
    expect(summary.routeName).toBe("Ringvejen sydgående");
    expect(toRouteLabel("Ringvejen nordgående")).toBe("Ringvejen nordgående");
  });
});

describe("mergeFeatureCollections", () => {
  const merged = mergeFeatureCollections([
    featureCollection,
    other.featureCollection,
  ]);

  it("concatenates every route's features into one collection", () => {
    expect(merged.type).toBe("FeatureCollection");
    expect(merged.features).toHaveLength(165 + 14);
  });

  it("tags each feature with the route it came from", () => {
    const byRoute = new Set(
      merged.features.map((feature) => feature.properties.routeId),
    );

    expect(byRoute).toEqual(new Set([56634, 313727]));
  });

  it("keeps segment ids unique across routes, so a click resolves to one road", () => {
    const ids = merged.features.map(
      (feature) => feature.properties.segmentIdStr,
    );

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("unions the per-route boxes rather than re-deriving one", () => {
    const [west, south, east, north] = merged.bbox ?? [0, 0, 0, 0];
    const [routeWest, routeSouth, routeEast, routeNorth] =
      featureCollection.bbox ?? [0, 0, 0, 0];

    expect(west).toBeLessThanOrEqual(routeWest);
    expect(south).toBeLessThanOrEqual(routeSouth);
    expect(east).toBeGreaterThanOrEqual(routeEast);
    expect(north).toBeGreaterThanOrEqual(routeNorth);
  });

  it("has no box when nothing came back", () => {
    expect(mergeFeatureCollections([]).bbox).toBeUndefined();
    expect(mergeFeatureCollections([]).features).toEqual([]);
  });
});

describe("serializeNetworkTraffic", () => {
  it("partitions reads into the routes that answered and the ones that did not", () => {
    const network = serializeNetworkTraffic([
      { ok: true, details, fetchedAt: FETCHED_AT },
      { ok: false, routeId: 313719, error: "Not found Route by id(313719)" },
      { ok: true, details: otherDetails, fetchedAt: OTHER_FETCHED_AT },
    ]);

    expect(network.routes.map(({ summary: route }) => route.routeId)).toEqual([
      56634, 313727,
    ]);
    expect(network.failures).toEqual([
      { routeId: 313719, error: "Not found Route by id(313719)" },
    ]);
  });

  it("reports every route as failed without throwing", () => {
    const network = serializeNetworkTraffic([
      { ok: false, routeId: 56634, error: "Could not reach TomTom" },
    ]);

    expect(network.routes).toEqual([]);
    expect(network.failures).toHaveLength(1);
  });
});

const OBSERVED_AT = "2026-11-23T10:00:00.000Z";
const COORDINATES: [number, number][] = [
  [10.21815, 56.18899],
  [10.21801, 56.18894],
];

const routeState = (
  observedAt = OBSERVED_AT,
  routeId = "56634",
): RouteState => ({
  eventId: `aarhus:${routeId}:${observedAt}`,
  schemaVersion: 1,
  source: "fixture",
  cityId: "aarhus",
  routeId,
  observedAt,
  route: {
    name: "Ringvejen sydgående",
    lengthM: 9637,
    travelTimeSec: 1017,
    typicalTravelTimeSec: 977,
    delaySec: 323,
    passable: true,
    congestedSince: OBSERVED_AT,
    slowerThanUsualSince: null,
  },
  segments: [
    {
      id: "1170420026289651713",
      lengthM: 10,
      currentSpeedKmh: 38,
      averageSpeedKmh: 35,
      typicalSpeedKmh: 35,
      relativeSpeedPct: 88,
      confidencePct: 100,
      coordinates: COORDINATES,
      congestion: "light",
    },
  ],
});

const routeRow = {
  cityId: "aarhus",
  id: "56634",
  name: "Ringvejen sydgående",
  lengthM: 9637,
  state: {
    passable: true,
    travelTimeSec: 1017,
    typicalTravelTimeSec: 977,
    delaySec: 323,
    observedAt: new Date(OBSERVED_AT),
    congestedSince: new Date(OBSERVED_AT),
    slowerThanUsualSince: null,
  },
  segments: [
    {
      id: "1170420026289651713",
      lengthM: 10,
      coordinates: COORDINATES,
      state: {
        congestion: "light",
        currentSpeedKmh: 38,
        typicalSpeedKmh: 35,
        averageSpeedKmh: 35,
        relativeSpeedPct: 88,
        confidencePct: 100,
      },
    },
  ],
} as unknown as NetworkRouteFromDb;

describe("serializeRouteState", () => {
  it("builds the same route as the first paint from Postgres", () => {
    const [fromDb] = serializeNetworkFromDb([routeRow]).routes;

    expect(serializeRouteState(routeState())).toEqual(fromDb);
  });

  it("keeps coordinates as [longitude, latitude] and sets the bbox", () => {
    const route = serializeRouteState(routeState());

    expect(route.featureCollection.features[0].geometry.coordinates).toEqual(
      COORDINATES,
    );
    expect(route.featureCollection.bbox).toEqual([
      10.21801, 56.18894, 10.21815, 56.18899,
    ]);
  });
});

describe("applyRouteState", () => {
  const current = serializeRouteState(routeState());
  const network = { routes: [current] };

  it("replaces a route with a newer reading", () => {
    const next = serializeRouteState(routeState("2026-11-23T10:01:00.000Z"));

    expect(applyRouteState(network, next).routes).toEqual([next]);
  });

  it("returns the same object for an older or equal reading", () => {
    const older = serializeRouteState(routeState("2026-11-23T09:59:00.000Z"));

    expect(applyRouteState(network, older)).toBe(network);
    expect(applyRouteState(network, current)).toBe(network);
  });

  it("appends a route the first paint did not have", () => {
    const unknown = serializeRouteState(routeState(OBSERVED_AT, "313727"));

    expect(applyRouteState(network, unknown).routes).toEqual([
      current,
      unknown,
    ]);
    expect(applyRouteState({ routes: [] }, current).routes).toEqual([current]);
  });
});

describe("parseLiveMessage", () => {
  const stateTopic = "greenwave/v1/aarhus/routes/56634/state";
  const statusTopic = "greenwave/v1/aarhus/adapter/status";

  it("turns a valid state into a route", () => {
    const message = parseLiveMessage(stateTopic, JSON.stringify(routeState()));

    expect(message).toEqual({
      kind: "state",
      route: serializeRouteState(routeState()),
    });
  });

  it("ignores a cleared topic, broken JSON and a wrong shape", () => {
    expect(parseLiveMessage(stateTopic, "")).toBeNull();
    expect(parseLiveMessage(stateTopic, "{not json")).toBeNull();
    expect(parseLiveMessage(stateTopic, '{"routeId":1}')).toBeNull();
    expect(parseLiveMessage(statusTopic, "{}")).toBeNull();
  });

  it("reads which city's adapter went offline", () => {
    const message = parseLiveMessage(
      statusTopic,
      JSON.stringify({
        schemaVersion: 1,
        cityId: "aarhus",
        status: "offline",
        at: OBSERVED_AT,
      }),
    );

    expect(message).toEqual({
      kind: "status",
      cityId: "aarhus",
      offline: true,
    });
  });
});

describe("updateOfflineCities", () => {
  it("adds and removes a city", () => {
    expect(updateOfflineCities([], "aarhus", true)).toEqual(["aarhus"]);
    expect(updateOfflineCities(["aarhus"], "aarhus", false)).toEqual([]);
  });

  it("returns the same array when nothing changed", () => {
    const cities = ["aarhus"];

    expect(updateOfflineCities(cities, "aarhus", true)).toBe(cities);
    expect(updateOfflineCities(cities, "odense", false)).toBe(cities);
  });
});

describe("stale routes", () => {
  const observed = Date.parse(OBSERVED_AT);
  const ttlMs = STATE_TTL_SECONDS * 1000;

  it("is fresh at exactly the TTL and stale one second past it", () => {
    expect(isRouteStale(OBSERVED_AT, observed + ttlMs)).toBe(false);
    expect(isRouteStale(OBSERVED_AT, observed + ttlMs + 1000)).toBe(true);
  });

  it("marks only the stale route's features", () => {
    const old = serializeRouteState(routeState(OBSERVED_AT, "56634"));
    const fresh = serializeRouteState(
      routeState("2026-11-23T10:05:00.000Z", "313727"),
    );
    const routes = [old, fresh];
    const key = staleRouteKey(routes, observed + ttlMs + 1000);
    const { features } = toLiveFeatureCollection(routes, key);

    expect(key).toBe("56634");
    expect(features.map((item) => item.properties.stale)).toEqual([
      true,
      false,
    ]);
  });
});
