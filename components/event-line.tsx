// One market event rendered as a sentence with links — used on the home page,
// the news feed and entity timelines. Names are the DERIVED current names.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { compareDates, formatDate, type DatePoint, type Locale } from "@/lib/date";
import { periodAt, type NamePeriod } from "@/lib/timeline";
import { loadMarket, type EventWithRelations } from "@/lib/queries";

/**
 * Name of the entity AS OF the event date, i.e. just BEFORE the event applies:
 * a rename event should read "Alsid for AD becomes Tenable.AD", not
 * "Tenable Identity Exposure becomes Tenable.AD".
 */
function nameAtEvent(namePeriods: NamePeriod[], at: DatePoint, fallback: string): string {
  const endedHere = namePeriods.find((p) => p.end !== null && compareDates(p.end, at) === 0);
  if (endedHere) return endedHere.name;
  return periodAt(namePeriods, at)?.name ?? fallback;
}

function EntityLink({
  href,
  name,
  logoUrl,
}: {
  href: string | null;
  name: string;
  logoUrl?: string | null;
}) {
  const inner = (
    <>
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="inline-block h-4 max-w-[2rem] object-contain align-text-bottom mr-1 rounded-sm"
        />
      )}
      {name}
    </>
  );
  if (!href) return <span className="font-medium">{inner}</span>;
  return (
    <Link href={href} className="font-medium underline-offset-2 hover:underline">
      {inner}
    </Link>
  );
}

export async function EventLine({
  event,
  showTypeBadge = true,
  compact = false,
}: {
  event: EventWithRelations;
  showTypeBadge?: boolean;
  /** Compact = date+badge on their own line above the text (narrow columns) */
  compact?: boolean;
}) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("eventText");
  const tTypes = await getTranslations("eventTypes");
  const market = await loadMarket();

  // Subject: the entity whose state changes — displayed with its name AS OF
  // the event date (derived), which keeps historical sentences accurate.
  const at = { year: event.year, month: event.month };
  const subjectSolutionState = event.subjectSolution
    ? market.solutions.find((s) => s.id === event.subjectSolution!.id)
    : null;
  const subjectCompanyState = event.subjectCompany
    ? market.companies.find((c) => c.id === event.subjectCompany!.id)
    : null;
  const subject = subjectSolutionState
    ? {
        name: nameAtEvent(
          subjectSolutionState.timeline.namePeriods,
          at,
          subjectSolutionState.timeline.currentName
        ),
        href: `/solutions/${subjectSolutionState.id}`,
        logoUrl: null as string | null, // solutions have no logo
      }
    : subjectCompanyState
      ? {
          name: nameAtEvent(
            subjectCompanyState.timeline.namePeriods,
            at,
            subjectCompanyState.timeline.currentName
          ),
          href: `/companies/${subjectCompanyState.id}`,
          logoUrl: subjectCompanyState.logoUrl,
        }
      : { name: "?", href: null, logoUrl: null as string | null };

  // Actor: acquirer / merge partner / new solution owner
  const actorCompany = event.acquirerCompany ?? event.withCompany ?? event.newOwnerCompany;
  // SOLUTION_INTEGRATED: the actor is a solution (the host), not a company
  const actor = event.intoSolution
    ? {
        name:
          market.solutionNameById.get(event.intoSolution.id) ?? event.intoSolution.initialName,
        href: `/solutions/${event.intoSolution.id}`,
        logoUrl: null as string | null,
      }
    : actorCompany
      ? {
          name: market.companyNameById.get(actorCompany.id) ?? actorCompany.initialName,
          href: `/companies/${actorCompany.id}`,
          logoUrl: actorCompany.logoUrl,
        }
      : event.acquirerNameRaw
        ? { name: event.acquirerNameRaw, href: null, logoUrl: null as string | null }
        : null;

  const subjectNode = (
    <EntityLink href={subject.href} name={subject.name} logoUrl={subject.logoUrl} />
  );
  const actorNode = actor ? (
    <EntityLink href={actor.href} name={actor.name} logoUrl={actor.logoUrl} />
  ) : (
    <span>?</span>
  );

  let key: string = event.type;
  if (event.type === "FUNDING" && !event.round) key = "FUNDING_NO_ROUND";
  // ABSORPTION may have no explicit actor (owner absorbed it in place)
  if (event.type === "ABSORPTION" && !actor) key = "ABSORPTION_NO_ACTOR";

  const text = t.rich(key, {
    subject: () => subjectNode,
    actor: () => actorNode,
    newName: event.newName ?? "?",
    amount: event.amount ?? 0,
    round: event.round ?? "",
  });

  if (compact) {
    return (
      <div className="text-sm space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground tabular-nums text-xs">
            {formatDate({ year: event.year, month: event.month }, locale)}
          </span>
          {showTypeBadge && (
            <Badge variant="outline" className="text-[10px]">
              {tTypes(event.type)}
            </Badge>
          )}
        </div>
        <div className="leading-snug">{text}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <span className="text-muted-foreground tabular-nums shrink-0 w-28">
        {formatDate({ year: event.year, month: event.month }, locale)}
      </span>
      {showTypeBadge && (
        <Badge variant="outline" className="text-[10px]">
          {tTypes(event.type)}
        </Badge>
      )}
      <span>{text}</span>
    </div>
  );
}
