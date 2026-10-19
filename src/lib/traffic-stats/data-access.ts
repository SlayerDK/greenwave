import "server-only";

import { requireAuth } from "@/lib/auth/session";
import { trafficStatsQueries } from "@/lib/traffic-stats/queries";
import {
  serializeTrafficStats,
  type SerializedTrafficStats,
} from "@/lib/traffic-stats/serialization";

/** `null` until `pnpm db:import-traffic-stats` has run. */
export const getTrafficStats =
  async (): Promise<SerializedTrafficStats | null> => {
    await requireAuth();
    const dataset = await trafficStatsQueries.getDataset();

    return dataset ? serializeTrafficStats(dataset) : null;
  };
