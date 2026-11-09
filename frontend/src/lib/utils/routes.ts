import { type Route } from "next";

const DEFAULT_ROUTE = "/";

/**
 * `typedRoutes` can't type a path that arrives as a plain string at runtime, so
 * this is also the open-redirect guard: anything that isn't a single-slash
 * internal path falls back to the dashboard.
 */
export const toInternalRoute = (value: string | undefined): Route => {
  if (!value?.startsWith("/") || value.startsWith("//")) return DEFAULT_ROUTE;

  return value as Route;
};
