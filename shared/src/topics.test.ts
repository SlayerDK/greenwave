import { describe, expect, it } from "vitest";
import {
  ALL_STATES,
  ALL_STATUSES,
  cityOfStatusTopic,
  observationTopic,
  SHARED_OBSERVATIONS,
  stateTopic,
  statusTopic,
} from "./topics";

describe("topics", () => {
  it("builds one topic per city and route", () => {
    expect(observationTopic("aarhus", "56634")).toBe(
      "greenwave/v1/aarhus/routes/56634/observations",
    );
    expect(stateTopic("aarhus", "56634")).toBe(
      "greenwave/v1/aarhus/routes/56634/state",
    );
    expect(statusTopic("aarhus")).toBe("greenwave/v1/aarhus/adapter/status");
  });

  it("subscribes to every city and route", () => {
    expect(SHARED_OBSERVATIONS).toBe(
      "$share/backend/greenwave/v1/+/routes/+/observations",
    );
    expect(ALL_STATES).toBe("greenwave/v1/+/routes/+/state");
    expect(ALL_STATUSES).toBe("greenwave/v1/+/adapter/status");
  });

  it("reads the city back from a status topic", () => {
    expect(cityOfStatusTopic(statusTopic("aarhus"))).toBe("aarhus");
  });
});
