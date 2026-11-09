import { describe, expect, it } from "vitest";
import { adapterStatusSchema, offlineStatus, onlineStatus } from "./status";

describe("adapter status", () => {
  it("serializes messages the schema accepts", () => {
    const at = new Date("2026-11-09T12:00:00Z");

    expect(adapterStatusSchema.parse(JSON.parse(onlineStatus(at)))).toEqual({
      status: "online",
      at: "2026-11-09T12:00:00.000Z",
    });
    expect(
      adapterStatusSchema.parse(JSON.parse(offlineStatus(at))).status,
    ).toBe("offline");
  });
});
