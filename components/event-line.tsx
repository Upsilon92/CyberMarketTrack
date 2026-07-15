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

function EntityLink({ href, name }: { href: string | null; name: string }) {
  if (!href) return <span className="font-medium">{name}</span>;
  return (
    <Link href={href} className="font-medium underline-offset-2 hover:underline">
      {name}
    </Link>
  );
}

export async function EventLine({
  event,
  showTypeBadge = true,
}: {
  event: EventWithRelations;
  showTypeBadge?: boolean;
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
      }
    : subjectCompanyState
      ? {
          name: nameAtEvent(
            subjectCompanyState.timeline.namePeriods,
            at,
            subjectCompanyState.timeline.currentName
          ),
          href: `/companies/${subjectCompanyState.id}`,
        }
      : { name: "?", href: null };

  // Actor: acquirer / merge partner / new solution owner
  const actorCompany = event.acquirerCompany ?? event.withCompany ?? event.newOwnerCompany;
  const actor = actorCompany
    ? {
        name: market.companyNameById.get(actorCompany.id) ?? actorCompany.initialName,
        href: `/companies/${actorCompany.id}`,
      }
    : event.acquirerNameRaw
      ? { name: event.acquirerNameRaw, href: null }
      : null;

  const subjectNode = <EntityLink href={subject.href} name={subject.name} />;
  const actorNode = actor ? <EntityLink href={actor.href} name={actor.name} /> : <span>?</span>;

  const key =
    event.type === "FUNDING" && !event.round ? "FUNDING_NO_ROUND" : (event.type as string);

  const text = t.rich(key, {
    subject: () => subjectNode,
    actor: () => actorNode,
    newName: event.newName ?? "?",
    amount: event.amount ?? 0,
    round: event.round ?? "",
  });

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
