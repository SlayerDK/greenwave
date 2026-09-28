import "@/lib/config/env";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  serverExternalPackages: ["@prisma/client"],
  experimental: { authInterrupts: true },
  ...(process.env.STANDALONE_BUILD === "1" && {
    output: "standalone" as const,
    transpilePackages: ["@t3-oss/env-nextjs", "@t3-oss/env-core"],
  }),
};

export default nextConfig;
