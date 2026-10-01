import { type SerializedRouteTraffic } from "@/lib/traffic/serialization";

/**
 * The data describes Danish roads, so the clock that matters is theirs — and
 * pinning it keeps the server and client markup identical.
 */
const timeFormat = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDelay = (seconds: number) => {
  if (seconds <= 0) return "No delay";

  const minutes = Math.round(seconds / 60);

  return minutes >= 1 ? `+${minutes} min delay` : `+${seconds} s delay`;
};

/**
 * Listed in registry order rather than sorted by delay: the order has to stay
 * put across a poll, and rows that reshuffle every minute are unreadable.
 */
export const RouteSummaryList = ({
  routes,
}: {
  routes: SerializedRouteTraffic[];
}) => (
  <ul className="divide-y rounded-lg border">
    {routes.map(({ summary }) => (
      <li key={summary.routeId} className="flex flex-col gap-0.5 px-3 py-2">
        <p className="text-sm font-medium">{summary.routeName}</p>
        <p className="text-xs text-muted-foreground">
          {formatDelay(summary.delayTime)} ·{" "}
          {timeFormat.format(new Date(summary.fetchedAt))}
          {summary.passable ? "" : " · impassable"}
        </p>
      </li>
    ))}
  </ul>
);
