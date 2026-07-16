// Visual vertical timeline: a rail with colored dots (by event category) and
// connectors, each event rendered as a sentence + optional narrative.
// MAJOR events get a highlighted dot. Server component (reuses EventLine).
import { EventLine } from "@/components/event-line";
import type { EventWithRelations } from "@/lib/queries";

// Dot color by the state dimension the event touches.
function dotClass(type: string): string {
  if (type === "COMPANY_RENAME" || type === "SOLUTION_RENAME") return "bg-blue-500";
  if (["ACQUISITION", "CO_INVESTMENT", "ABSORPTION", "DIVESTMENT", "SOLUTION_TRANSFER"].includes(type))
    return "bg-violet-500";
  if (["MERGER", "SHUTDOWN", "SOLUTION_DISCONTINUED", "SOLUTION_INTEGRATED"].includes(type))
    return "bg-amber-500";
  if (type === "SOLUTION_LAUNCH") return "bg-emerald-500";
  if (type === "FUNDING") return "bg-teal-500";
  return "bg-muted-foreground/50";
}

export function EventTimeline({ events }: { events: EventWithRelations[] }) {
  if (events.length === 0) return null;
  return (
    <ol className="relative ml-2 border-l-2 border-border/70 space-y-5 pl-6 py-1">
      {events.map((e) => {
        const major = e.importance === "MAJOR";
        return (
          <li key={e.id} className="relative">
            {/* Dot on the rail */}
            <span
              className={`absolute top-0.5 -left-[31px] rounded-full ring-4 ring-background ${dotClass(
                e.type
              )} ${major ? "w-4 h-4 -left-[33px] shadow-[0_0_0_3px] shadow-current/20" : "w-3 h-3"}`}
              aria-hidden
            />
            <EventLine event={e} compact />
            {e.description && (
              <p className="text-xs text-muted-foreground mt-1 leading-snug">{e.description}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
