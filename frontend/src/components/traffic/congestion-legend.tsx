import {
  CONGESTION_STYLE,
  STALE_STYLE,
  type CongestionStyle,
} from "@/components/traffic/congestion-style";

const LegendEntry = ({ color, label }: { color: string; label: string }) => (
  <li className="flex items-center gap-2">
    {/* Inline style: Tailwind cannot generate a class for a runtime value,
        and these must be the exact colours the map paints with. */}
    <span
      aria-hidden
      className="h-1.5 w-6 rounded-full"
      style={{ backgroundColor: color }}
    />
    <span className="text-muted-foreground">{label}</span>
  </li>
);

export const CongestionLegend = ({
  levels = CONGESTION_STYLE,
  caption,
  showStale = false,
}: {
  /** Defaults to every level; a page that can never paint one leaves it out. */
  levels?: readonly CongestionStyle[];
  /** What the colours are measured against, when that is not free flow. */
  caption?: string;
  /** Only the live map has readings that can age out. */
  showStale?: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {levels.map(({ level, color, label }) => (
        <LegendEntry key={level} color={color} label={label} />
      ))}
      {showStale && <LegendEntry {...STALE_STYLE} />}
    </ul>
    {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
  </div>
);
