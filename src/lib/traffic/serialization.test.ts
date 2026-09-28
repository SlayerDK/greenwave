import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import { tomtomRouteDetailsSchema } from "@/lib/traffic/schema";
import { serializeRouteTraffic } from "@/lib/traffic/serialization";
import { describe, expect, it } from "vitest";

const FETCHED_AT = "2026-09-28T12:00:00.000Z";

const details = tomtomRouteDetailsSchema.parse(routeDetailsFixture);
const { summary, featureCollection } = serializeRouteTraffic(
  details,
  FETCHED_AT,
);

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
