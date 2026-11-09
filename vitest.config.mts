import { defineConfig } from "vitest/config";

/**
 * One project per workspace package. The frontend keeps its own config (jsdom,
 * the server-only alias, the setup file); the others run on Node by default.
 * A glob, because Vitest refuses a listed directory that does not exist yet.
 */
export default defineConfig({
  test: {
    projects: ["{frontend,shared,database,adapter,backend,predictor,loadgen}"],
  },
});
