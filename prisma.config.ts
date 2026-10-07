import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Prisma Migrate takes a session-level advisory lock, which a transaction
    // pooler (Neon's pooled DATABASE_URL) cannot hold. Neon's Vercel integration
    // exposes the direct connection as DATABASE_URL_UNPOOLED; locally there is
    // no pooler, so DATABASE_URL is used as-is.
    url: process.env.DATABASE_URL_UNPOOLED ?? env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
