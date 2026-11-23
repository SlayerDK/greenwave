import { describe, expect, it } from "vitest";
import { parseHistoryLine } from "./history-csv";

const LINE =
  "2026-11-02T22:45:00.000Z,56628,1170138551123509248,52,37,96,50,91";

describe("parseHistoryLine", () => {
  it("maps a recorder sample to a one-sample bucket", () => {
    expect(parseHistoryLine(LINE, "aarhus")).toEqual({
      bucketStart: new Date("2026-11-02T22:45:00.000Z"),
      cityId: "aarhus",
      routeId: "56628",
      segmentId: "1170138551123509248",
      sampleCount: 1,
      currentSpeedSum: 52,
      averageSpeedSum: 37,
      relativeSpeedSum: 96,
      typicalSpeedSum: 50,
    });
  });

  it("keeps a segment id too large for a JavaScript number", () => {
    expect(parseHistoryLine(LINE, "aarhus").segmentId).toBe(
      "1170138551123509248",
    );
  });

  it("accepts a row without a confidence", () => {
    expect(() =>
      parseHistoryLine(
        "2026-10-30T10:00:00.000Z,56628,117,52,37,96,50,",
        "aarhus",
      ),
    ).not.toThrow();
  });

  it("rejects an empty speed instead of reading it as zero", () => {
    expect(() =>
      parseHistoryLine(
        "2026-11-02T22:45:00.000Z,56628,117,,37,96,50,91",
        "aarhus",
      ),
    ).toThrow();
  });

  it("rejects a row with the wrong number of columns", () => {
    expect(() => parseHistoryLine("2026-11-02,56628", "aarhus")).toThrow(
      /columns/,
    );
  });
});
