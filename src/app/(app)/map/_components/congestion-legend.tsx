import { CONGESTION_STYLE } from "@/app/(app)/map/_lib/congestion-style";

export const CongestionLegend = () => (
  <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
    {CONGESTION_STYLE.map(({ level, color, label }) => (
      <li key={level} className="flex items-center gap-2">
        {/* Inline style: Tailwind cannot generate a class for a runtime value,
            and these must be the exact colours the map paints with. */}
        <span
          aria-hidden
          className="h-1.5 w-6 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-muted-foreground">{label}</span>
      </li>
    ))}
  </ul>
);
