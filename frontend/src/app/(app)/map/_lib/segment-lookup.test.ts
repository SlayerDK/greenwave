import {
  clickedSegmentSchema,
  findSegment,
} from "@/app/(app)/map/_lib/segment-lookup";
import routeDetailsFixture from "@/lib/traffic/fixtures/route-details.json";
import { tomtomRouteDetailsSchema } from "@/lib/traffic/schema";
import { serializeRouteTraffic } from "@/lib/traffic/serialization";
import { describe, expect, it } from "vitest";

const details = tomtomRouteDetailsSchema.parse(routeDetailsFixture);
const { featureCollection } = serializeRouteTraffic(
  details,
  "2026-09-28T12:00:00.000Z",
);

const { features } = featureCollection;
const [first] = features;

/**
 * What mapbox-gl actually hands back from `queryRenderedFeatures`: its
 * `FeatureWrapper` sets `this.id = parseInt(feature.id, 10)`, while properties
 * are passed through untouched as `feature.tags`.
 */
const asMapboxReturnsIt = (feature: (typeof features)[number]) => ({
  id: parseInt(String(feature.id), 10),
  properties: { ...feature.properties } as unknown,
});

describe("the click path", () => {
  it("recovers the clicked segment from what mapbox hands back", () => {
    const clicked = asMapboxReturnsIt(first);

    const parsed = clickedSegmentSchema.safeParse(clicked.properties);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(findSegment(features, parsed.data.segmentIdStr)).toBe(first);
  });

  /**
   * The reason the click path keys on a property instead of the feature `id`.
   * Every TomTom segment id is past Number.MAX_SAFE_INTEGER, so the id mapbox
   * returns is silently rounded and matches nothing — the popup simply never
   * opens. Guarded here because the failure is invisible at the type level:
   * `id` is typed `string | number`, so the broken version compiles cleanly.
   */
  it("would match nothing if it keyed on the id mapbox returns", () => {
    const clicked = asMapboxReturnsIt(first);

    expect(Number(first.properties.segmentIdStr)).toBeGreaterThan(
      Number.MAX_SAFE_INTEGER,
    );
    expect(String(clicked.id)).not.toBe(first.properties.segmentIdStr);
    expect(features.find(({ id }) => id === clicked.id)).toBe(undefined);
  });

  it("round-trips every segment in the route", () => {
    const recovered = features.filter((feature) => {
      const parsed = clickedSegmentSchema.safeParse(
        asMapboxReturnsIt(feature).properties,
      );

      return (
        parsed.success &&
        findSegment(features, parsed.data.segmentIdStr) === feature
      );
    });

    expect(recovered).toHaveLength(features.length);
  });

  it("ignores a click that hit no feature", () => {
    expect(clickedSegmentSchema.safeParse(undefined).success).toBe(false);
    expect(clickedSegmentSchema.safeParse({}).success).toBe(false);
    expect(findSegment(features, "no-such-segment")).toBe(undefined);
  });
});
