import { TrafficStatsPanel } from "@/app/(app)/history/_components/traffic-stats-panel";
import { env } from "@/lib/config/env";
import { getTrafficStats } from "@/lib/traffic-stats/data-access";

/** UTC: the stored dates are calendar days, not instants. */
const formatDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export default async function HistoryPage() {
  const stats = await getTrafficStats();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Traffic history</h1>
        {stats && (
          <p className="text-sm text-muted-foreground">
            Average weekday · {stats.dayCount} days ·{" "}
            {formatDate(stats.dateFrom)} – {formatDate(stats.dateTo)} · TomTom
            Traffic Stats
          </p>
        )}
      </div>

      {stats ? (
        <TrafficStatsPanel
          stats={stats}
          mapboxToken={env.MAPBOX_PUBLIC_TOKEN}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No traffic history imported yet — run{" "}
          <code>pnpm db:import-traffic-stats</code>.
        </p>
      )}
    </div>
  );
}
