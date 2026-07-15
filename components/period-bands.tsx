// Horizontal "period bands" view: one row per dimension (names, owners,
// statuses), segments positioned proportionally on a year axis.
// Everything is computed server-side from derived periods — pure rendering.
import { getTranslations } from "next-intl/server";
import type { Period } from "@/lib/timeline";

export interface BandSegment {
  label: string;
  start: number | null; // year (null = unknown start, rendered dashed from axis start)
  end: number | null; // year (null = ongoing, extends to axis end)
  colorIndex: number;
}

export interface BandRow {
  label: string;
  segments: BandSegment[];
}

const SEGMENT_COLORS = [
  "bg-primary/70 text-primary-foreground",
  "bg-teal-600/70 text-white",
  "bg-violet-600/70 text-white",
  "bg-amber-600/70 text-white",
  "bg-rose-600/70 text-white",
  "bg-sky-600/70 text-white",
];

/** Helper to turn derived periods into band segments. */
export function toSegments<P extends Period>(
  periods: P[],
  labelOf: (p: P) => string
): BandSegment[] {
  return periods.map((p, i) => ({
    label: labelOf(p),
    start: p.start?.year ?? null,
    end: p.end?.year ?? null,
    colorIndex: i % SEGMENT_COLORS.length,
  }));
}

export async function PeriodBands({ rows }: { rows: BandRow[] }) {
  const t = await getTranslations("common");
  const currentYear = new Date().getFullYear();

  // Axis bounds: earliest known year -> current year (+ a small margin)
  const years = rows.flatMap((r) => r.segments.flatMap((s) => [s.start, s.end])).filter(
    (y): y is number => y !== null
  );
  if (years.length === 0) return null;
  const minYear = Math.min(...years);
  const maxYear = Math.max(currentYear, ...years) + 1;
  const span = maxYear - minYear || 1;
  const pos = (y: number) => ((y - minYear) / span) * 100;

  // Year ticks: at most ~8, rounded steps
  const step = Math.max(1, Math.ceil(span / 8));
  const ticks: number[] = [];
  for (let y = minYear; y <= maxYear; y += step) ticks.push(y);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] space-y-2">
        {/* Axis */}
        <div className="relative h-5 ml-28 text-[10px] text-muted-foreground">
          {ticks.map((y) => (
            <span key={y} className="absolute -translate-x-1/2" style={{ left: `${pos(y)}%` }}>
              {y}
            </span>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <div className="w-28 shrink-0 text-xs font-medium text-muted-foreground text-right pr-2">
              {row.label}
            </div>
            <div className="relative flex-1 h-8 rounded bg-muted/40">
              {row.segments.map((s, i) => {
                const startYear = s.start ?? minYear;
                const endYear = s.end ?? maxYear;
                const left = pos(startYear);
                const width = Math.max(pos(endYear) - left, 2);
                return (
                  <div
                    key={i}
                    className={`absolute top-0.5 bottom-0.5 rounded px-1.5 flex items-center overflow-hidden text-[11px] whitespace-nowrap ${SEGMENT_COLORS[s.colorIndex]} ${s.start === null ? "border-l-2 border-dashed border-white/70" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${s.label} (${s.start ?? "?"} – ${s.end ?? t("asOfNow").toLowerCase()})`}
                  >
                    {s.label}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
