import { type TrafficFeatureCollection } from "@/lib/traffic/serialization";
import { z } from "zod";

export type Selection = {
  segmentIdStr: string;
  longitude: number;
  latitude: number;
};

/**
 * Mapbox hands a clicked feature's properties back untyped, so they are parsed
 * rather than cast. Lives here beside `findSegment` because it describes what
 * mapbox-gl returns, not anything TomTom sends or we store.
 */
export const clickedSegmentSchema = z.object({ segmentIdStr: z.string() });

/**
 * Resolves a click back to our own typed feature.
 *
 * Keyed on `segmentIdStr` rather than the GeoJSON feature `id` on purpose:
 * mapbox-gl builds its tile features with `this.id = parseInt(feature.id, 10)`,
 * and every TomTom segment id is past Number.MAX_SAFE_INTEGER, so the id that
 * comes back out of the map is silently rounded and matches nothing. Feature
 * properties are passed through untouched, so the string id survives there.
 */
export const findSegment = (
  features: TrafficFeatureCollection["features"],
  segmentIdStr: string,
) =>
  features.find((feature) => feature.properties.segmentIdStr === segmentIdStr);
