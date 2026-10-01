import edwinRahrsFixture from "@/lib/traffic/fixtures/route-details-313727.json";
import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import { tomtomRouteDetailsSchema } from "@/lib/traffic/schema";
import {
  mergeFeatureCollections,
  serializeNetworkTraffic,
  serializeRouteTraffic,
  toRouteLabel,
} from "@/lib/traffic/serialization";
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
