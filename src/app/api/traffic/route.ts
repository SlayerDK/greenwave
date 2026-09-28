import { respondWithRouteId } from "@/app/api/traffic/_lib/route-helpers";
import { getRouteTraffic } from "@/lib/traffic/data-access";
import { type NextRequest } from "next/server";

/** Pass-through so client code can poll data that lives behind `server-only`. */
export const GET = (request: NextRequest) =>
  respondWithRouteId(request, getRouteTraffic);
