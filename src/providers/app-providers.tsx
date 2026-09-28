import { QueryProvider } from "@/providers/query-provider";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { type ReactNode } from "react";

export const AppProviders = ({ children }: { children: ReactNode }) => (
  <NuqsAdapter>
    <QueryProvider>{children}</QueryProvider>
  </NuqsAdapter>
);
