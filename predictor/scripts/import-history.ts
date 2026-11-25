import type { DatabaseClient } from "@greenwave/database";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { HISTORY_CSV_HEADER, parseHistoryLine } from "../src/history-csv";
import { runScript } from "./run-script";

const CITY_ID = "aarhus";
const BATCH_SIZE = 5_000;
const EXPORT_FILE = path.join(
  import.meta.dirname,
  "../../data/traffic-history/traffic-history.csv.gz",
);

type HistoryRow = ReturnType<typeof parseHistoryLine>;

async function* readDataLines() {
  const lines = createInterface({
    input: createReadStream(EXPORT_FILE).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let isHeader = true;

  for await (const line of lines) {
    if (!isHeader) yield line;
    else if (line !== HISTORY_CSV_HEADER) {
      throw new Error("Unexpected CSV header");
    }
    isHeader = false;
  }
}

/**
 * skipDuplicates makes a re-run safe, and keeps a pipeline bucket (about 15
 * samples) from being overwritten by a recorder bucket (1 sample).
 */
const insertBatch = async (prisma: DatabaseClient, rows: HistoryRow[]) => {
  const { count } = await prisma.trafficSegmentHistory.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return count;
};

const importHistory = async (prisma: DatabaseClient) => {
  let read = 0;
  let inserted = 0;
  let batch: HistoryRow[] = [];

  for await (const line of readDataLines()) {
    batch.push(parseHistoryLine(line, CITY_ID));
    read += 1;
    if (batch.length === BATCH_SIZE) {
      inserted += await insertBatch(prisma, batch);
      batch = [];
    }
  }
  inserted += await insertBatch(prisma, batch);

  console.info(
    `read ${read} rows, inserted ${inserted}, already present ${read - inserted}`,
  );
};

void runScript(importHistory);
