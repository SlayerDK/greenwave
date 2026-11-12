import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The repo-wide .env sits one level up; Prisma runs from this directory. In
// Docker there is none, and Compose sets the variables instead.
config({ path: "../.env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Prisma Migrate takes a session-level advisory lock, which a transaction
    // pooler (Neon's pooled DATABASE_URL) cannot hold. Neon's Vercel integration
    // exposes the direct connection as DATABASE_URL_UNPOOLED; locally there is
    // no pooler, so DATABASE_URL is used as-is.
    //
    // Not Prisma's env(), which throws on a missing variable when the config
    // loads: `prisma generate` never connects, and runs in Docker builds and in
    // `pnpm install` on a clone without a .env.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
