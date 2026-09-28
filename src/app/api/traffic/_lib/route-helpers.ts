import { getSession } from "@/lib/auth/session";
import {
  DEFAULT_ROUTE_ID,
  routeIdSchema,
  TrafficError,
} from "@/lib/traffic/schema";
import { NextResponse, type NextRequest } from "next/server";

type RouteError = { error: string };

/**
 * Checks the session, resolves the optional `routeId`, and turns a
 * `TrafficError` back into the status TomTom gave us. Anything else is a real
 * fault and is rethrown for the framework to handle.
 *
 * The data-access layer calls `requireAuth()` too; checking here as well is what
 * lets an API client get a 401 rather than an `unauthorized()` interrupt.
 */
export const respondWithRouteId = async <T>(
  request: NextRequest,
  handle: (routeId: number) => Promise<T>,
): Promise<NextResponse<T | RouteError>> => {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = routeIdSchema.safeParse(
    request.nextUrl.searchParams.get("routeId") ?? DEFAULT_ROUTE_ID,
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid routeId." }, { status: 400 });

  try {
    return NextResponse.json(await handle(parsed.data));
  } catch (error) {
    if (error instanceof TrafficError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );

    throw error;
  }
};
