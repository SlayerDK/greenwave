import { describe, expect, it } from "vitest";
import fixture from "./fixtures/observation-56634.json";
import { observationSchema, toEventId } from "./observation";

const withRoute = (routeId: string) => ({
  ...fixture,
  routeId,
  eventId: toEventId(fixture.cityId, routeId, fixture.observedAt),
});

describe("observationSchema", () => {
  it("parses the Ringvejen fixture", () => {
    const observation = observationSchema.parse(fixture);

    expect(observation.segments).toHaveLength(165);
    expect(observation.eventId).toBe("aarhus:56634:2026-10-19T09:41:00Z");
  });

  it("keeps segment ids as exact strings", () => {
    const ids = observationSchema.parse(fixture).segments.map(({ id }) => id);

    expect(ids[0]).toBe("1170420026289651713");
    expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // Why they are strings: as numbers they would not survive JSON.parse.
    expect(ids.some((id) => !Number.isSafeInteger(Number(id)))).toBe(true);
  });

  it("rejects an eventId that does not match the reading", () => {
    const result = observationSchema.safeParse({
      ...fixture,
      eventId: "aarhus:56634:2026-10-19T09:40:00Z",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["eventId"]);
  });

  it("accepts an observedAt with milliseconds", () => {
    const observedAt = "2026-10-19T09:41:00.123Z";
    const result = observationSchema.safeParse({
      ...fixture,
      observedAt,
      eventId: toEventId(fixture.cityId, fixture.routeId, observedAt),
    });

    expect(result.success).toBe(true);
  });

  it.each(["56/634", "56+634", "#"])(
    "rejects routeId %j, which would break the topic",
    (routeId) => {
      expect(observationSchema.safeParse(withRoute(routeId)).success).toBe(
        false,
      );
    },
  );
});
