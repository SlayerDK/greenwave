import { respondWithRouteId } from "@/app/api/traffic/_lib/route-helpers";
import { getRouteHistory } from "@/lib/traffic/data-access";
import { type NextRequest } from "next/server";

/** Recorded snapshots for the last 24 hours, oldest first. */
export const GET = (request: NextRequest) =>
  respondWithRouteId(request, getRouteHistory);
