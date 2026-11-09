import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export const createPrismaClient = (
  connectionString: string,
  log: ("error" | "warn")[] = ["error"],
) => new PrismaClient({ adapter: new PrismaPg({ connectionString }), log });

export type DatabaseClient = ReturnType<typeof createPrismaClient>;
export { Prisma, PrismaClient } from "./generated/prisma/client";
export * from "./generated/prisma/enums";
