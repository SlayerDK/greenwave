"use client";

import { Button } from "@/components/ui/button";

/**
 * The only way to new traffic data short of reloading the page — the query
 * itself never refetches on a timer. Driven by the panel's query rather than
 * calling the hook again, so it acts on the one cache entry the map renders.
 */
export const RefreshTrafficButton = ({
  onRefresh,
  isFetching,
}: {
  onRefresh: () => void;
  isFetching: boolean;
}) => (
  <Button size="sm" disabled={isFetching} onClick={onRefresh}>
    {isFetching ? "Refreshing…" : "Refresh"}
  </Button>
);
