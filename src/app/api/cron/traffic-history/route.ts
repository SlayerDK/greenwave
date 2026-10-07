import { env } from "@/lib/config/env";
import { recordTrafficHistory } from "@/lib/traffic/history-service";
import { NextResponse, type NextRequest } from "next/server";

/** Thirteen parallel reads capped at eight seconds each, then one insert. */
export const maxDuration = 60;

/**
 * Called hourly by `.github/workflows/traffic-history.yml` (or Vercel Cron on
 * Pro), both sending `Authorization: Bearer $CRON_SECRET`. There is no session,
 * which is why `src/proxy.ts` must not match `api/cron`.
 *
 * 502 when no route answered, so the scheduler's run fails visibly; a partial
 * failure still records the rest and only warns.
 */
export const GET = async (request: NextRequest) => {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const run = await recordTrafficHistory();
  if (run.failed.length > 0)
    console.warn("traffic-history: routes failed", run.failed);

  return NextResponse.json(run, {
    status: run.recorded.length > 0 ? 200 : 502,
  });
};
