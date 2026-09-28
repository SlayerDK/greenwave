import { toInternalRoute } from "@/lib/utils/routes";
import { describe, expect, it } from "vitest";

describe("toInternalRoute", () => {
  it("keeps an internal path", () => {
    expect(toInternalRoute("/devices")).toBe("/devices");
  });

  it("falls back to the dashboard for external urls", () => {
    expect(toInternalRoute("https://evil.example")).toBe("/");
  });

  it("falls back to the dashboard for protocol-relative urls", () => {
    expect(toInternalRoute("//evil.example")).toBe("/");
  });

  it("falls back to the dashboard when missing", () => {
    expect(toInternalRoute(undefined)).toBe("/");
  });
});
