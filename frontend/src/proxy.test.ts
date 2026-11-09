import { config } from "@/proxy";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

describe("proxy matcher", () => {
  /**
   * The scheduler has no session. Were the proxy to match, it would get a 307
   * to /login, which curl and Vercel Cron both treat as success — a green run
   * that recorded nothing.
   */
  it("leaves the cron endpoint to its own secret check", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/api/cron/traffic-history",
      }),
    ).toBe(false);
  });

  it("still gates the app and its data endpoint", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/map" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/traffic" })).toBe(
      true,
    );
  });
});
