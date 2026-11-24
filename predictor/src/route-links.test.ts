import { describe, expect, it } from "vitest";
import { normaliseRouteName, proposeRouteLinks } from "./route-links";

describe("normaliseRouteName", () => {
  it("strips the prefix, case and extra whitespace", () => {
    expect(normaliseRouteName("CW_AU_Randersvej   Sydgående ")).toBe(
      "randersvej sydgående",
    );
  });

  it("treats decomposed and composed characters as equal", () => {
    expect(normaliseRouteName("Sydgående")).toBe(
      normaliseRouteName("Sydgående"),
    );
  });
});

describe("proposeRouteLinks", () => {
  it("links equal names and leaves the rest unmatched", () => {
    const [matched, unmatched] = proposeRouteLinks(
      [
        { id: "1", name: "CW_AU_Randersvej sydgående" },
        { id: "2", name: "Unknown vej" },
      ],
      [{ id: 7, name: "randersvej sydgående" }],
    );

    expect(matched.stats?.id).toBe(7);
    expect(unmatched.stats).toBeNull();
  });
});
