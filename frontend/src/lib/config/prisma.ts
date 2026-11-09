import { env } from "@/lib/config/env";
import { createPrismaClient, type DatabaseClient } from "@greenwave/database";

const globalForPrisma = globalThis as unknown as {
  prisma: DatabaseClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient(
    env.DATABASE_URL,
    env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  );

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
