import fixture from "@/lib/traffic-stats/fixtures/herredsvej-nordgaende-12.json";
import {
  trafficStatsExportSchema,
  type TrafficStatsExport,
} from "@/lib/traffic-stats/schema";
import {
  serializeTrafficStats,
  toTrafficStatsImport,
  type TrafficStatsFile,
} from "@/lib/traffic-stats/serialization";
import { describe, expect, it } from "vitest";

/** A real export trimmed to its metadata and three segments. */
const parsed = trafficStatsExportSchema.parse(fixture);

/** A second route: same days and slots, fresh segment ids. */
const otherRoute = (): TrafficStatsExport => {
  const [metadata, ...segments] = structuredClone(parsed).features;

  return {
    type: "FeatureCollection",
    features: [
      {
        ...metadata,
        properties: {
          ...metadata.properties,
          routeName: "Herredsvej sydgående",
        },
      },
      ...segments.map((segment) => ({
        ...segment,
        properties: {
          ...segment.properties,
          newSegmentId: `${segment.properties.newSegmentId}-other`,
        },
      })),
    ] as TrafficStatsExport["features"],
  };
};

const files: TrafficStatsFile[] = [
  { routeId: 12, data: parsed },
  { routeId: 11, data: otherRoute() },
];

/** The JSON import types every feature as a union, so the metadata is narrowed by hand. */
type RawMetadata = {
  dateRanges: unknown[];
  timeSets: { dayToTimeRanges: { timeRanges: string[] }[] }[];
};

const rawFixture = () => {
  const raw = structuredClone(fixture);

  return { raw, metadata: raw.features[0].properties as RawMetadata };
};

describe("trafficStatsExportSchema", () => {
  it("accepts a real export", () => {
    expect(trafficStatsExportSchema.safeParse(fixture).success).toBe(true);
  });

  it("requires the metadata feature first", () => {
    const { raw } = rawFixture();
    raw.features.reverse();

    expect(trafficStatsExportSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects an export averaging more than one date range", () => {
    const { raw, metadata } = rawFixture();
    metadata.dateRanges.push(metadata.dateRanges[0]);

    expect(trafficStatsExportSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects a time set whose hours differ between days", () => {
    const { raw, metadata } = rawFixture();
    metadata.timeSets[0].dayToTimeRanges[3].timeRanges = ["06:00-07:00"];

    expect(trafficStatsExportSchema.safeParse(raw).success).toBe(false);
  });

  it("does not let the unsafe numeric segmentId through", () => {
    const [, segment] = parsed.features;

    expect(segment.properties).not.toHaveProperty("segmentId");
  });
});

describe("toTrafficStatsImport", () => {
  const data = toTrafficStatsImport(files);
  const routes = Array.isArray(data.routes?.create) ? data.routes.create : [];
  const [route] = routes;
  const segments = Array.isArray(route.segments?.createMany?.data)
    ? route.segments.createMany.data
    : [];

  it("sorts slots into one contiguous 06:00–18:00 day", () => {
    expect(data.slotStartMinutes).toHaveLength(24);
    expect(data.slotStartMinutes).toEqual(
      [...(data.slotStartMinutes as number[])].sort((a, b) => a - b),
    );
    expect((data.slotStartMinutes as number[])[0]).toBe(360);
    expect((data.slotEndMinutes as number[]).at(-1)).toBe(1080);
    // The compressed midday block.
    const midday = (data.slotStartMinutes as number[]).indexOf(570);
    expect((data.slotEndMinutes as number[])[midday]).toBe(840);
  });

  it("counts the weekdays left after the exclusions", () => {
    expect(data.dayCount).toBe(199);
    expect(data.dateFrom).toEqual(new Date("2025-09-22T00:00:00Z"));
    expect(data.dateTo).toEqual(new Date("2026-09-20T00:00:00Z"));
  });

  it("aligns every per-slot list to the slot order", () => {
    expect(route.medianTravelTimes).toHaveLength(24);
    expect(route.p10TravelTimes).toHaveLength(24);
    expect(route.p90TravelTimes).toHaveLength(24);
    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment.travelTimeRatios).toHaveLength(24);
      expect((segment.travelTimeRatios as number[])[0]).toBe(1);
    }
  });

  it("reads p10 and p90 from the percentile list", () => {
    const [summary] = parsed.features[0].properties.summaries;

    expect((route.p10TravelTimes as number[])[0]).toBe(
      summary.travelTimePercentiles[1],
    );
    expect((route.p90TravelTimes as number[])[0]).toBe(
      summary.travelTimePercentiles[17],
    );
  });

  it("keys segments by newSegmentId, in file order", () => {
    expect(segments.map(({ id, ordinal }) => [id, ordinal])).toEqual(
      parsed.features
        .slice(1)
        .map((feature, index) => [
          (feature.properties as { newSegmentId: string }).newSegmentId,
          index,
        ]),
    );
  });

  it("names routes in NFC whatever the input form", () => {
    const decomposed = structuredClone(parsed);
    decomposed.features[0].properties.routeName =
      "Herredsvej nordgående".normalize("NFD");
    const [{ name }] = toTrafficStatsImport([{ routeId: 12, data: decomposed }])
      .routes?.create as { name: string }[];

    expect(name).toBe("Herredsvej nordgående".normalize("NFC"));
    expect(name).not.toBe("Herredsvej nordgående".normalize("NFD"));
  });

  it("rejects files that disagree on their date range", () => {
    const other = otherRoute();
    other.features[0].properties.dateRanges[0].to = "2026-06-30";

    expect(() =>
      toTrafficStatsImport([files[0], { routeId: 11, data: other }]),
    ).toThrow(/date range or time sets/);
  });

  it("rejects a gap between slots", () => {
    const gapped = structuredClone(parsed);
    gapped.features[0].properties.timeSets[0].endMinute -= 5;

    expect(() => toTrafficStatsImport([{ routeId: 12, data: gapped }])).toThrow(
      /not contiguous/,
    );
  });

  it("rejects a segment missing a slot's result", () => {
    const missing = structuredClone(parsed);
    missing.features[1].properties.segmentTimeResults.pop();

    expect(() =>
      toTrafficStatsImport([{ routeId: 12, data: missing }]),
    ).toThrow(/23 results for 24 time sets/);
  });

  it("rejects a duplicated slot result", () => {
    const duplicated = structuredClone(parsed);
    const results = duplicated.features[1].properties.segmentTimeResults;
    results[1] = { ...results[0] };

    expect(() =>
      toTrafficStatsImport([{ routeId: 12, data: duplicated }]),
    ).toThrow(/2 results for time set/);
  });

  it("rejects duplicate route and segment ids", () => {
    expect(() =>
      toTrafficStatsImport([files[0], { routeId: 12, data: otherRoute() }]),
    ).toThrow(/Duplicate route id/);
    expect(() =>
      toTrafficStatsImport([files[0], { routeId: 11, data: parsed }]),
    ).toThrow(/Duplicate segment id/);
  });
});

type DatasetRow = Parameters<typeof serializeTrafficStats>[0];
type RouteRow = DatasetRow["routes"][number];
type SegmentRow = RouteRow["segments"][number];

/**
 * Prisma's create inputs are unions of nested-write shapes, so the import is
 * narrowed back to the row Postgres would return — the round trip the page
 * actually performs.
 */
const toDatasetRow = (
  data: ReturnType<typeof toTrafficStatsImport>,
): DatasetRow => {
  const [route] = data.routes?.create as (Omit<
    RouteRow,
    "datasetId" | "segments"
  > & {
    segments: { createMany: { data: Omit<SegmentRow, "routeId">[] } };
  })[];
  const { segments, ...routeRow } = route;

  return {
    ...(data as Omit<DatasetRow, "id" | "importedAt" | "routes">),
    id: "dataset",
    importedAt: new Date("2026-10-14T08:00:00Z"),
    routes: [
      {
        ...routeRow,
        datasetId: "dataset",
        segments: segments.createMany.data.map((segment) => ({
          ...segment,
          routeId: route.id,
        })),
      },
    ],
  };
};

describe("serializeTrafficStats", () => {
  const stats = serializeTrafficStats(
    toDatasetRow(toTrafficStatsImport([files[0]])),
  );

  it("sends calendar dates and ISO timestamps", () => {
    expect(stats.dateFrom).toBe("2025-09-22");
    expect(stats.dateTo).toBe("2026-09-20");
    expect(stats.exportedAt).toBe("2026-09-23T12:16:21.892Z");
  });

  it("parses stored shapes back into positions", () => {
    const [segment] = stats.routes[0].segments;

    expect(segment.shape[0]).toHaveLength(2);
    expect(segment.shape[0][0]).toBeCloseTo(10.2, 0);
  });

  it("frames the network as [west, south, east, north]", () => {
    const [west, south, east, north] = stats.bbox ?? [0, 0, 0, 0];

    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(west).toBeGreaterThan(10);
    expect(south).toBeGreaterThan(56);
  });

  it("puts the network at exactly 1× in the first slot", () => {
    expect(stats.networkTravelTimeRatios).toHaveLength(24);
    expect(stats.networkTravelTimeRatios[0]).toBe(1);
    expect(Math.max(...stats.networkTravelTimeRatios)).toBeGreaterThan(1);
  });
});
