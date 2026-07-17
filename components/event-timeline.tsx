// Visual vertical timeline: a rail with colored dots (by event category) and
// connectors, each event rendered as a sentence + optional narrative.
// MAJOR events get a highlighted dot. Server component (reuses EventLine).
import { getTranslations } from "next-intl/server";
import { EventLine } from "@/components/event-line";
import type { EventWithRelations } from "@/lib/queries";

const ACQUISITION_TYPES = ["ACQUISITION", "CO_INVESTMENT"];

// Dot color by the state dimension the event touches. `acquirerHere` is true
// when the event is an acquisition MADE by the company whose timeline this is
// (a "société rachetée") — it gets a dedicated, brighter dot.
function dotClass(type: string, acquirerHere: boolean): string {
  if (acquirerHere) return "bg-fuchsia-500"; // acquisitions made by this company
  if (ACQUISITION_TYPES.includes(type)) return "bg-violet-500"; // this company being acquired / co-invested
  if (type === "COMPANY_RENAME" || type === "SOLUTION_RENAME") return "bg-blue-500";
  if (["ABSORPTION", "DIVESTMENT", "SOLUTION_TRANSFER"].includes(type)) return "bg-violet-500";
  if (["MERGER", "SHUTDOWN", "SOLUTION_DISCONTINUED", "SOLUTION_INTEGRATED"].includes(type))
    return "bg-amber-500";
  if (type === "SOLUTION_LAUNCH") return "bg-emerald-500";
  if (type === "FUNDING") return "bg-teal-500";
  return "bg-muted-foreground/50";
}

export async function EventTimeline({
  events,
  highlightAcquirerId,
}: {
  events: EventWithRelations[];
  /** Company id whose page this is — acquisitions it made get a dedicated dot */
  highlightAcquirerId?: string;
}) {
  if (events.length === 0) return null;
  const t = await getTranslations("company");
  const hasAcquisitionsMade =
    !!highlightAcquirerId &&
    events.some((e) => ACQUISITION_TYPES.includes(e.type) && e.acquirerCompanyId === highlightAcquirerId);

  return (
    <div className="space-y-3">
      {hasAcquisitionsMade && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />
            {t("legendAcquisitionMade")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
            {t("legendOtherEvents")}
          </span>
        </div>
      )}
      <ol className="relative ml-2 border-l-2 border-border/70 space-y-5 pl-6 py-1">
      {events.map((e) => {
        const major = e.importance === "MAJOR";
        const acquirerHere =
          !!highlightAcquirerId &&
          ACQUISITION_TYPES.includes(e.type) &&
          e.acquirerCompanyId === highlightAcquirerId;
        return (
          <li key={e.id} className="relative">
            {/* Dot on the rail */}
            <span
              className={`absolute top-0.5 -left-[31px] rounded-full ring-4 ring-background ${dotClass(
                e.type,
                acquirerHere
              )} ${major ? "w-4 h-4 -left-[33px] shadow-[0_0_0_3px] shadow-current/20" : "w-3 h-3"}`}
              aria-hidden
            />
            <EventLine
              event={e}
              compact
              logoSide="right"
              excludeCompanyId={highlightAcquirerId}
            />
            {e.description && (
              <p className="text-xs text-muted-foreground mt-1 leading-snug">{e.description}</p>
            )}
          </li>
        );
      })}
      </ol>
    </div>
  );
}
