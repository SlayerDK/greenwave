"use client";

import { Button } from "@/components/ui/button";

/**
 * The only page that reaches a third party while rendering: `getRouteTraffic()`
 * throws `TrafficError` when TomTom is down, rate-limiting, or rejecting the
 * key. The route handlers turn that into a status via `respondWithRouteId`;
 * an RSC has no such wrapper, so without this boundary the whole page 500s.
 */
export default function MapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Traffic map</h1>
        <p className="text-sm text-muted-foreground">
          Could not load traffic data. {error.message}
        </p>
      </div>

      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
