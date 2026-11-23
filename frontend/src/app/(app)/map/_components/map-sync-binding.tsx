"use client";

import { type MapSync } from "@/app/(app)/map/_lib/map-sync";
import { useEffect } from "react";
import { useMap } from "react-map-gl/mapbox";

/** Rendered inside a `<Map>`, because `useMap` reads that map's context. */
export const MapSyncBinding = ({ mapSync }: { mapSync: MapSync }) => {
  const { current } = useMap();

  useEffect(() => {
    if (!current) return;
    return mapSync.add(current.getMap());
  }, [current, mapSync]);

  return null;
};
