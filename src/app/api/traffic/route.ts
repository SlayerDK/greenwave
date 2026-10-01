import { getSession } from "@/lib/auth/session";
import { getNetworkTraffic } from "@/lib/traffic/data-access";
import { NextResponse } from "next/server";

/**
 * Pass-through so client code can poll data that lives behind `server-only`.
 *
 * `getNetworkTraffic` calls `requireAuth()` too; checking the session here as
 * well is what lets an API client get a 401 rather than an `unauthorized()`
 * interrupt. It is reachable with a stale cookie — `src/proxy.ts` redirects a
 * request carrying no cookie at all to `/login` before it arrives.
 *
 * No `routeId` parameter: the monitored routes are a fixed registry, and
 * `getNetworkTraffic` returns all of them. An unreachable route comes back as a
 * `failures` entry, so there is no upstream status left for this handler to map.
 */
export const GET = async () => {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  return NextResponse.json(await getNetworkTraffic());
};
