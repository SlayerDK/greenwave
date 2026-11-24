export const LiveStatus = ({
  routeCount,
  segmentCount,
  isAdapterOffline,
}: {
  routeCount: number;
  segmentCount: number;
  isAdapterOffline: boolean;
}) => (
  <>
    <p className="text-sm text-muted-foreground">
      {routeCount} routes · {segmentCount} segments
    </p>

    {isAdapterOffline && (
      <p className="text-sm text-destructive">
        The Aarhus adapter is offline. The map shows the last readings it sent.
      </p>
    )}

    {routeCount === 0 && (
      <p className="text-sm text-muted-foreground">
        No live data yet. Start the adapter and the backend.
      </p>
    )}
  </>
);
