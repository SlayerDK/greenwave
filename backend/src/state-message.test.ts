import { stateSchema, toEventId } from "@greenwave/shared";
import { describe, expect, it } from "vitest";
import { toRouteState } from "./state-message";

describe("route state messages", () => {
  it("contains classified segments and serializable flags", () => {
    const observation = {
      eventId: toEventId("aarhus", "route", "2026-11-16T12:00:00.000Z"),
      schemaVersion: 1 as const,
      source: "fixture" as const,
      cityId: "aarhus",
      routeId: "route",
      observedAt: "2026-11-16T12:00:00.000Z",
      route: {
        name: "Route",
        lengthM: 10,
        travelTimeSec: 10,
        typicalTravelTimeSec: 10,
        delaySec: 0,
        passable: true,
      },
      segments: [
        {
          id: "segment",
          lengthM: 10,
          currentSpeedKmh: 10,
          averageSpeedKmh: 10,
          typicalSpeedKmh: 10,
          relativeSpeedPct: 80,
          confidencePct: 100,
          coordinates: [
            [1, 2],
            [2, 3],
          ] as [number, number][],
        },
      ],
    };
    const state = toRouteState(
      observation,
      [{ ...observation.segments[0], congestion: "light" }],
      {
        since: new Date("2026-11-16T11:00:00.000Z"),
        pendingSince: null,
        streak: 0,
      },
      { since: null, pendingSince: null, streak: 0 },
    );
    expect(stateSchema.parse(state).route.congestedSince).toBe(
      "2026-11-16T11:00:00.000Z",
    );
  });
});
