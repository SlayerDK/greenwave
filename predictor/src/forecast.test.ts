import { STATE_TTL_SECONDS } from "@greenwave/shared";
import { describe, expect, it } from "vitest";
import { forecastValue, isReadingFresh } from "./forecast";

const base = {
  profileAtTarget: 40,
  profileNow: 40,
  current: 20,
  horizonMinutes: 0,
  tauMinutes: 60,
  maximum: 100,
};

describe("forecastValue", () => {
  it("returns the current value at a zero horizon", () => {
    expect(forecastValue(base)).toBe(20);
  });

  it("approaches the profile at a long horizon", () => {
    expect(forecastValue({ ...base, horizonMinutes: 600 })).toBe(40);
  });

  it("fades today's deviation by e^(−h/τ)", () => {
    // 40 + (20 − 40) · e^−1 = 32.64
    expect(forecastValue({ ...base, horizonMinutes: 60 })).toBe(33);
  });

  it("applies the deviation from the profile now to the profile at the target", () => {
    expect(
      forecastValue({
        ...base,
        profileAtTarget: 70,
        profileNow: 50,
        current: 30,
      }),
    ).toBe(50);
  });

  it("clamps to zero and to the observed maximum", () => {
    expect(forecastValue({ ...base, current: 200 })).toBe(100);
    expect(
      forecastValue({
        ...base,
        profileAtTarget: 5,
        profileNow: 90,
        current: 0,
      }),
    ).toBe(0);
  });

  it("is the profile alone when there is no fresh reading", () => {
    expect(forecastValue({ ...base, current: null })).toBe(40);
  });
});

describe("isReadingFresh", () => {
  const now = new Date("2026-11-23T10:00:00.000Z");

  it("trusts a reading up to the state TTL and not past it", () => {
    const atLimit = new Date(now.getTime() - STATE_TTL_SECONDS * 1000);
    const past = new Date(atLimit.getTime() - 1);

    expect(isReadingFresh(atLimit, now)).toBe(true);
    expect(isReadingFresh(past, now)).toBe(false);
  });
});
