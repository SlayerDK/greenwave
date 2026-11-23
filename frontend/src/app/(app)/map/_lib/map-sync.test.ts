import { createMapSync, type SyncedMap } from "@/app/(app)/map/_lib/map-sync";
import { describe, expect, it, vi } from "vitest";

const fakeMap = (zoom: number) => {
  const listeners = new Set<() => void>();
  let camera = { center: { lng: 10, lat: 56 }, zoom, bearing: 0, pitch: 0 };
  const move = () => listeners.forEach((listener) => listener());

  const map = {
    getCenter: () => camera.center,
    getZoom: () => camera.zoom,
    getBearing: () => camera.bearing,
    getPitch: () => camera.pitch,
    jumpTo: vi.fn((next: typeof camera) => {
      camera = next;
      move(); // mapbox fires `move` synchronously from jumpTo
    }),
    on: (_type: "move", listener: () => void) => listeners.add(listener),
    off: (_type: "move", listener: () => void) => listeners.delete(listener),
  } satisfies SyncedMap;

  return {
    map,
    pan: (nextZoom: number) => {
      camera = { ...camera, zoom: nextZoom };
      move();
    },
  };
};

describe("createMapSync", () => {
  it("starts a new map on the first map's camera", () => {
    const sync = createMapSync();
    const first = fakeMap(12);
    const second = fakeMap(9);
    sync.add(first.map);
    sync.add(second.map);

    expect(second.map.getZoom()).toBe(12);
  });

  it("copies a move to the other map without echoing it back", () => {
    const sync = createMapSync();
    const first = fakeMap(12);
    const second = fakeMap(12);
    sync.add(first.map);
    sync.add(second.map);
    second.map.jumpTo.mockClear();

    first.pan(14);

    expect(second.map.getZoom()).toBe(14);
    expect(second.map.jumpTo).toHaveBeenCalledTimes(1);
    expect(first.map.jumpTo).not.toHaveBeenCalled();
  });

  it("stops following once removed", () => {
    const sync = createMapSync();
    const first = fakeMap(12);
    const second = fakeMap(12);
    sync.add(first.map);
    const remove = sync.add(second.map);
    remove();

    first.pan(15);

    expect(second.map.getZoom()).toBe(12);
  });
});
