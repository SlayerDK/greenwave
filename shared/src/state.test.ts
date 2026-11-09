import { describe, expect, it } from "vitest";
import { classifyCongestion } from "./congestion";
import fixture from "./fixtures/observation-56634.json";
import { stateSchema } from "./state";

const state = {
  ...fixture,
  route: { ...fixture.route, congestedSince: null, slowerThanUsualSince: null },
  segments: fixture.segments.map((segment) => ({
    ...segment,
    congestion: classifyCongestion({
      currentSpeed: segment.currentSpeedKmh,
      relativeSpeed: segment.relativeSpeedPct,
    }),
  })),
};

describe("stateSchema", () => {
  it("accepts the fixture plus what the backend derives", () => {
    expect(stateSchema.safeParse(state).success).toBe(true);
  });

  it("keeps the observation's eventId check", () => {
    expect(stateSchema.safeParse({ ...state, eventId: "x" }).success).toBe(
      false,
    );
  });

  it("requires both route flags, null when off", () => {
    const route = { ...state.route, congestedSince: undefined };

    expect(stateSchema.safeParse({ ...state, route }).success).toBe(false);
  });
});
