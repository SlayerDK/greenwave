import { getSession } from "@/lib/auth/session";
import { getLatestForecast } from "@/lib/forecasts/data-access";
import { NextResponse } from "next/server";

/**
 * Pass-through so an open map can pick up new runs: forecasts live only in
 * Postgres and never travel over MQTT. Checking the session here as well lets
 * the browser get a 401 rather than an `unauthorized()` interrupt.
 */
export const GET = async () => {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  return NextResponse.json(await getLatestForecast());
};
