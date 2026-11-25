import type { DatabaseClient } from "@greenwave/database";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { proposeRouteLinks } from "../src/route-links";
import { runScript } from "./run-script";

const OUTPUT = path.join(import.meta.dirname, "traffic-stats-route-links.sql");
const CITY_ID = "aarhus";

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

const linkRoutes = async (prisma: DatabaseClient) => {
  const [liveRoutes, statsRoutes] = await Promise.all([
    prisma.trafficRoute.findMany({
      where: { cityId: CITY_ID },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.trafficStatsRoute.findMany({ select: { id: true, name: true } }),
  ]);
  if (liveRoutes.length === 0 || statsRoutes.length === 0) {
    throw new Error(
      "Needs live routes (run the backend) and Traffic Stats (pnpm db:import-traffic-stats).",
    );
  }

  const proposals = proposeRouteLinks(liveRoutes, statsRoutes);
  console.table(
    proposals.map(({ routeId, liveName, stats }) => ({
      routeId,
      liveName,
      trafficStats: stats?.name ?? "(no match)",
    })),
  );

  const links = proposals.flatMap(({ routeId, stats }) =>
    stats ? [{ cityId: CITY_ID, routeId, statsRouteId: stats.id }] : [],
  );
  await prisma.$transaction(
    links.map((link) =>
      prisma.trafficStatsRouteLink.upsert({
        where: {
          cityId_routeId: { cityId: link.cityId, routeId: link.routeId },
        },
        create: link,
        update: { statsRouteId: link.statsRouteId },
      }),
    ),
  );

  const values = links
    .map(
      (link) =>
        `  (${quote(link.cityId)}, ${quote(link.routeId)}, ${link.statsRouteId})`,
    )
    .join(",\n");
  await writeFile(
    OUTPUT,
    `-- Check against the table the script prints before committing.\n` +
      `INSERT INTO traffic_stats_route_link ("cityId", "routeId", "statsRouteId") VALUES\n` +
      `${values}\n` +
      `ON CONFLICT ("cityId", "routeId") DO UPDATE SET "statsRouteId" = EXCLUDED."statsRouteId";\n`,
  );
  console.info(`linked ${links.length} of ${proposals.length} routes`);
};

void runScript(linkRoutes);
