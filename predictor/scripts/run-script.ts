import { createPrismaClient, type DatabaseClient } from "@greenwave/database";
import { env } from "../src/env";

/** Gives a one-off script a client, a clean exit and a failing exit code. */
export const runScript = async (
  task: (prisma: DatabaseClient) => Promise<void>,
) => {
  const prisma = createPrismaClient(env.DATABASE_URL);

  try {
    await task(prisma);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};
