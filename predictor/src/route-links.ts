/** Live names may carry TomTom's prefix; exports may be stored decomposed. */
export const normaliseRouteName = (name: string) =>
  name
    .normalize("NFC")
    .replace(/^CW_AU_/i, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Exact matches after normalisation; anything else is left for a human. */
export const proposeRouteLinks = (
  liveRoutes: readonly { id: string; name: string }[],
  statsRoutes: readonly { id: number; name: string }[],
) => {
  const statsByName = new Map(
    statsRoutes.map((route) => [normaliseRouteName(route.name), route]),
  );

  return liveRoutes.map((route) => ({
    routeId: route.id,
    liveName: route.name,
    stats: statsByName.get(normaliseRouteName(route.name)) ?? null,
  }));
};
