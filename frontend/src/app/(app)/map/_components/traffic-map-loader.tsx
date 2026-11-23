"use client";

import dynamic from "next/dynamic";

/**
 * `ssr: false` has to be declared from a client component — Next rejects it in
 * a server one. It earns its place twice: `mapbox-gl` reaches for `window` as
 * it loads, and `useTheme()` reports no resolved theme during SSR, which would
 * hydrate the map with the wrong basemap.
 */
export const TrafficMap = dynamic(
  () =>
    import("@/app/(app)/map/_components/traffic-map").then((m) => m.TrafficMap),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-muted" />,
  },
);
