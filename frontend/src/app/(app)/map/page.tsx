import { TrafficMapPanel } from "@/app/(app)/map/_components/traffic-map-panel";
import { env } from "@/lib/config/env";
import { getNetworkTraffic } from "@/lib/traffic/data-access";

export default async function MapPage() {
  const traffic = await getNetworkTraffic();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Traffic map</h1>

      {/* A `pk.` token is public by design — it ships with every request the
          browser makes to Mapbox — so it is read here and handed down rather
          than renamed to `NEXT_PUBLIC_`. */}
      <TrafficMapPanel
        initialTraffic={traffic}
        mapboxToken={env.MAPBOX_PUBLIC_TOKEN}
      />
    </div>
  );
}
