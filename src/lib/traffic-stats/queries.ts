import "server-only";

import { prisma } from "@/lib/config/prisma";

export const trafficStatsQueries = {
  /**
   * The importer keeps at most one dataset; ordering only decides which wins
   * should a second ever be written by hand. About 1,700 rows in one query.
   */
  getDataset: () =>
    prisma.trafficStatsDataset.findFirst({
      orderBy: { importedAt: "desc" },
      include: {
        routes: {
          orderBy: { id: "asc" },
          include: { segments: { orderBy: { ordinal: "asc" } } },
        },
      },
    }),
};
