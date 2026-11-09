import { describe, expect, expectTypeOf, it } from "vitest";
import {
  classifyCongestion,
  type CONGESTION_LEVELS,
  type CongestionLevel,
} from "./congestion";

describe("classifyCongestion", () => {
  it("places each threshold in the less congested band", () => {
    const at = (relativeSpeed: number) =>
      classifyCongestion({ currentSpeed: 30, relativeSpeed });

    expect([0, 49, 50, 74, 75, 89, 90].map(at)).toEqual([
      "heavy",
      "heavy",
      "moderate",
      "moderate",
      "light",
      "light",
      "free",
    ]);
  });

  it("reports a stationary segment as closed whatever its ratio", () => {
    expect(classifyCongestion({ currentSpeed: 0, relativeSpeed: 100 })).toBe(
      "closed",
    );
  });

  it("returns exactly the levels CONGESTION_LEVELS lists", () => {
    // Checked by `pnpm typecheck`: the function and the list cannot drift.
    expectTypeOf<CongestionLevel>().toEqualTypeOf<
      (typeof CONGESTION_LEVELS)[number]
    >();
  });
});
