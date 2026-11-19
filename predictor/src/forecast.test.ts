import { describe, expect, it } from "vitest";
import { forecastValue } from "./forecast";

describe("forecastValue", () => {
  it("returns the current value at a zero horizon", () => {
    expect(forecastValue(40, 20, 0, 60, 100)).toBe(20);
  });

  it("approaches the profile at a long horizon", () => {
    expect(forecastValue(40, 20, 600, 60, 100)).toBe(40);
  });

  it("clamps to the observed maximum", () => {
    expect(forecastValue(120, 200, 0, 60, 100)).toBe(100);
  });
});
