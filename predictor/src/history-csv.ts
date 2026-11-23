import { z } from "zod";

export const HISTORY_CSV_HEADER =
  "recordedAt,routeId,segmentIdStr,currentSpeed,averageSpeed,relativeSpeed,typicalSpeed,confidence";

const COLUMN_COUNT = HISTORY_CSV_HEADER.split(",").length;

// Not z.coerce: it would quietly read an empty column as 0.
const wholeNumber = z.string().regex(/^\d+$/).transform(Number);
const id = z.string().regex(/^\d+$/);

const rowSchema = z.object({
  recordedAt: z.iso.datetime(),
  routeId: id,
  segmentId: id,
  currentSpeed: wholeNumber,
  averageSpeed: wholeNumber,
  relativeSpeed: wholeNumber,
  typicalSpeed: wholeNumber,
});

/**
 * One recorder sample as a history bucket. `recordedAt` is the run's UTC
 * quarter hour, and a bucket of one sample stores its values as the sums.
 */
export const parseHistoryLine = (line: string, cityId: string) => {
  const columns = line.split(",");
  if (columns.length !== COLUMN_COUNT) {
    throw new Error(`Expected ${COLUMN_COUNT} columns: ${line}`);
  }

  const [
    recordedAt,
    routeId,
    segmentId,
    currentSpeed,
    averageSpeed,
    relativeSpeed,
    typicalSpeed,
  ] = columns;
  const row = rowSchema.parse({
    recordedAt,
    routeId,
    segmentId,
    currentSpeed,
    averageSpeed,
    relativeSpeed,
    typicalSpeed,
  });

  return {
    bucketStart: new Date(row.recordedAt),
    cityId,
    routeId: row.routeId,
    segmentId: row.segmentId,
    sampleCount: 1,
    currentSpeedSum: row.currentSpeed,
    averageSpeedSum: row.averageSpeed,
    typicalSpeedSum: row.typicalSpeed,
    relativeSpeedSum: row.relativeSpeed,
  };
};
