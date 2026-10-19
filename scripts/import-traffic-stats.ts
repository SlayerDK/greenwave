/**
 * Loads a TomTom Traffic Stats export folder into Postgres, replacing whatever
 * dataset was there.
 *
 *   pnpm db:import-traffic-stats [folder]          # defaults to traffic-history.geojson
 *   DATABASE_URL=<neon url> pnpm db:import-traffic-stats   # production
 *
 * Builds its own client like prisma/seed.ts: `@/lib/config/prisma` validates
 * every app env var and is `server-only`, which plain tsx cannot load.
 */
import { PrismaClient } from "@/generated/prisma/client";
import { trafficStatsExportSchema } from "@/lib/traffic-stats/schema";
import {
  toTrafficStatsImport,
  type TrafficStatsFile,
} from "@/lib/traffic-stats/serialization";
import { PrismaPg } from "@prisma/adapter-pg";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DEFAULT_FOLDER = "traffic-history.geojson";

/** The `_N` suffix is TomTom's route index — the only thing taken from a filename. */
const ROUTE_INDEX = /_(\d+)\.geojson$/;

const connectionString = z.url().parse(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const readExport = async (folder: string, file: string) => {
  const match = ROUTE_INDEX.exec(file);
  if (!match) throw new Error(`${file}: no _N route index in the filename`);

  const raw: unknown = JSON.parse(
    await readFile(path.join(folder, file), "utf8"),
  );
  const parsed = trafficStatsExportSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(`${file}: ${z.prettifyError(parsed.error)}`);

  return { routeId: Number(match[1]), data: parsed.data };
};

const importTrafficStats = async () => {
  const folder = process.argv[2] ?? DEFAULT_FOLDER;
  const files = (await readdir(folder)).filter((file) =>
    file.endsWith(".geojson"),
  );

  const exports: TrafficStatsFile[] = await Promise.all(
    files.map((file) => readExport(folder, file)),
  );
  const data = toTrafficStatsImport(exports);

  console.log(
    `Importing ${exports.length} routes into ${new URL(connectionString).host}…`,
  );

  // Neon can take longer than the 5 s default to write ~1,700 rows.
  await prisma.$transaction(
    [
      prisma.trafficStatsDataset.deleteMany(),
      prisma.trafficStatsDataset.create({ data }),
    ],
    { maxWait: 10_000, timeout: 60_000 },
  );

  const [routes, segments, dataset] = await Promise.all([
    prisma.trafficStatsRoute.count(),
    prisma.trafficStatsSegment.count(),
    prisma.trafficStatsDataset.findFirstOrThrow(),
  ]);
  console.log(
    `Imported ${routes} routes, ${segments} segments, ${dataset.slotStartMinutes.length} time slots over ${dataset.dayCount} days.`,
  );
};

importTrafficStats()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
