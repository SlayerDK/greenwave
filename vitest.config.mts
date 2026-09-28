import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `server-only` throws unless it is resolved under the `react-server` condition.
 * The package ships a zero-byte module for that case; pointing at it directly
 * keeps the `server-only` data layer importable from tests.
 */
const serverOnlyStub = fileURLToPath(
  new URL("node_modules/server-only/empty.js", import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": serverOnlyStub },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
