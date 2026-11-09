"use client";

import { Button } from "@/components/ui/button";

/**
 * The only page that reaches a third party while rendering. `getNetworkTraffic()`
 * absorbs an expected upstream failure — TomTom down, rate-limiting, or not
 * recognising a route — into that route's `failures` entry, so this boundary is
 * reached only by a genuine fault. An RSC has no wrapper to turn one into a
 * status, so without it the whole page 500s.
 *
 * `error.message` is deliberately not rendered. Next redacts the message of any
 * error thrown during a server render before it reaches the client, so in
 * production it holds a paragraph of framework boilerplate rather than the
 * TomTom reason — only `digest` survives, and only as a log correlator.
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
          Could not load traffic data. The upstream service may be unavailable
          or rate-limiting — try again in a moment.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </div>

      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
