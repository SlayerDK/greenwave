import "@/lib/config/env";
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  serverExternalPackages: ["@prisma/client"],
  experimental: { authInterrupts: true },
  ...(process.env.STANDALONE_BUILD === "1" && {
    output: "standalone" as const,
    // The app is not at the repo root: without this the trace stops at
    // frontend/ and leaves out shared/ and database/.
    outputFileTracingRoot: path.join(import.meta.dirname, ".."),
    transpilePackages: ["@t3-oss/env-nextjs", "@t3-oss/env-core"],
  }),
};

export default nextConfig;
