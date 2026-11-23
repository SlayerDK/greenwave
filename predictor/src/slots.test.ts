import { describe, expect, it } from "vitest";
import {
  dayTypeOf,
  localSlotOf,
  previousLocalDays,
  slotsUntilMidnight,
  startOfLocalDay,
} from "./slots";

describe("localSlotOf", () => {
  it("uses Copenhagen time in winter and summer", () => {
    expect(localSlotOf(new Date("2026-12-01T23:59:00Z"))).toBe(3); // 00:59
    expect(localSlotOf(new Date("2026-07-01T23:59:00Z"))).toBe(7); // 01:59
  });
});

describe("dayTypeOf", () => {
  it("is a weekend when it is still Friday in UTC", () => {
    expect(dayTypeOf(new Date("2026-11-27T23:30:00Z"))).toBe("weekend");
  });

  it("is a weekday when it is still Sunday in UTC", () => {
    expect(dayTypeOf(new Date("2026-11-29T23:30:00Z"))).toBe("weekday");
  });
});

describe("slotsUntilMidnight", () => {
  it("has 95 slots from 00:05 on a normal day", () => {
    expect(slotsUntilMidnight(new Date("2026-11-22T23:05:00Z"))).toHaveLength(
      95,
    );
  });

  it("has 99 slots on the day the clocks go back", () => {
    expect(slotsUntilMidnight(new Date("2026-10-24T22:05:00Z"))).toHaveLength(
      99,
    );
  });

  it("has 91 slots on the day the clocks go forward", () => {
    expect(slotsUntilMidnight(new Date("2027-03-27T23:05:00Z"))).toHaveLength(
      91,
    );
  });

  it("has none after 23:45", () => {
    expect(slotsUntilMidnight(new Date("2026-11-23T22:50:00Z"))).toEqual([]);
  });
});

describe("local days", () => {
  it("finds local midnight across a clock change", () => {
    expect(
      startOfLocalDay(new Date("2026-10-25T12:00:00Z")).toISOString(),
    ).toBe("2026-10-24T22:00:00.000Z");
  });

  it("lists the complete days before today, oldest first", () => {
    const days = previousLocalDays(new Date("2026-11-23T10:00:00Z"), 2);

    expect(days.map((day) => day.toISOString())).toEqual([
      "2026-11-20T23:00:00.000Z",
      "2026-11-21T23:00:00.000Z",
    ]);
  });
});
