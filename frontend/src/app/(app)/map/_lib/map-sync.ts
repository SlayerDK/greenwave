type Camera = {
  center: { lng: number; lat: number };
  zoom: number;
  bearing: number;
  pitch: number;
};

export type SyncedMap = {
  getCenter: () => Camera["center"];
  getZoom: () => number;
  getBearing: () => number;
  getPitch: () => number;
  jumpTo: (camera: Camera) => unknown;
  on: (type: "move", listener: () => void) => unknown;
  off: (type: "move", listener: () => void) => unknown;
};

const copyCamera = (source: SyncedMap, target: SyncedMap) => {
  target.jumpTo({
    center: source.getCenter(),
    zoom: source.getZoom(),
    bearing: source.getBearing(),
    pitch: source.getPitch(),
  });
};

/**
 * Keeps the live and predicted maps on one camera. Imperative rather than a
 * shared React view state, so dragging does not re-render the panel per frame.
 */
export const createMapSync = () => {
  const maps = new Set<SyncedMap>();
  // `jumpTo` fires `move` synchronously; without this the maps would echo.
  let isCopying = false;

  return {
    add: (map: SyncedMap) => {
      const [leader] = maps;
      if (leader) copyCamera(leader, map);

      const onMove = () => {
        if (isCopying) return;
        isCopying = true;
        try {
          for (const other of maps) {
            if (other !== map) copyCamera(map, other);
          }
        } finally {
          isCopying = false;
        }
      };

      maps.add(map);
      map.on("move", onMove);

      return () => {
        map.off("move", onMove);
        maps.delete(map);
      };
    },
  };
};

export type MapSync = ReturnType<typeof createMapSync>;
