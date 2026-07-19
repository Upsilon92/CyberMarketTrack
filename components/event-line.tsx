// One market event rendered as a sentence with links — used on the home page,
// the news feed and entity timelines. Names are the DERIVED current names.
// The logos of the companies involved are shown as a separate cluster (never
// inline in the sentence, which would hurt readability), on a configurable side.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Flag } from "@/components/flag";
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

// The linked entity name, followed by its country flag when it is a company.
// Kept on one line so the flag never wraps away from the name.
function EntityNode({
  href,
  name,
  country,
}: {
  href: string | null;
  name: string;
  country?: string | null;
}) {
  return (
    <span className="whitespace-nowrap">
      <EntityLink href={href} name={name} />
      {country ? <Flag iso={country} size="1.05em" className="ml-1" /> : null}
    </span>
  );
}

interface InvolvedLogo {
  id: string;
  name: string;
  logoUrl: string;
}

// A cluster of company logos on a light backing (so transparent logos stay
// legible in dark mode too). Landscape-aware. Empty when no logo is available.
function LogoCluster({ logos }: { logos: InvolvedLogo[] }) {
  if (logos.length === 0) return null;
  return (
    <div className="flex gap-1.5 shrink-0 items-center">
      {logos.map((l) => (
        <Link
          key={l.id}
          href={`/companies/${l.id}`}
          title={l.name}
          className="inline-flex items-center justify-center h-8 max-w-[72px] rounded-md bg-white ring-1 ring-border overflow-hidden p-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.logoUrl} alt={l.name} className="max-h-full max-w-full object-contain" />
        </Link>
      ))}
    </div>
  );
}

export async function EventLine({
  event,
  showTypeBadge = true,
  compact = false,
  logoSide = "left",
  excludeCompanyId,
}: {
  event: EventWithRelations;
  showTypeBadge?: boolean;
  /** Compact = date+badge on their own line above the text (narrow columns) */
  compact?: boolean;
  /** Where to place the logo cluster relative to the text */
  logoSide?: "left" | "right" | "none";
  /** Company whose logo should NOT be shown (e.g. the page's own company) */
  excludeCompanyId?: string;
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
        country: null as string | null,
      }
    : subjectCompanyState
      ? {
          name: nameAtEvent(
            subjectCompanyState.timeline.namePeriods,
            at,
            subjectCompanyState.timeline.currentName
          ),
          href: `/companies/${subjectCompanyState.id}`,
          country: subjectCompanyState.country,
        }
      : { name: "?", href: null, country: null };

  // Actor: acquirer / merge partner / new solution owner
  const actorCompany = event.acquirerCompany ?? event.withCompany ?? event.newOwnerCompany;
  const actorCompanyState = actorCompany
    ? (market.companies.find((c) => c.id === actorCompany.id) ?? null)
    : null;
  // SOLUTION_INTEGRATED: the actor is a solution (the host), not a company
  const actor = event.intoSolution
    ? {
        name:
          market.solutionNameById.get(event.intoSolution.id) ?? event.intoSolution.initialName,
        href: `/solutions/${event.intoSolution.id}`,
        country: null as string | null,
      }
    : actorCompany
      ? {
          name: market.companyNameById.get(actorCompany.id) ?? actorCompany.initialName,
          href: `/companies/${actorCompany.id}`,
          country: actorCompanyState?.country ?? null,
        }
      : event.acquirerNameRaw
        ? { name: event.acquirerNameRaw, href: null, country: null }
        : null;

  const subjectNode = (
    <EntityNode href={subject.href} name={subject.name} country={subject.country} />
  );
  const actorNode = actor ? (
    <EntityNode href={actor.href} name={actor.name} country={actor.country} />
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

  // Company logos involved in the event (subject + actor), de-duplicated,
  // excluding the page's own company and any without a logo.
  const involved: InvolvedLogo[] = [];
  const pushCompany = (c: { id: string; logoUrl: string | null } | null | undefined, name: string) => {
    if (!c || !c.logoUrl || c.id === excludeCompanyId) return;
    if (involved.some((l) => l.id === c.id)) return;
    involved.push({ id: c.id, name, logoUrl: c.logoUrl });
  };
  if (subjectCompanyState) pushCompany(subjectCompanyState, subject.name);
  if (actorCompany) pushCompany(actorCompany, actor?.name ?? "");
  const cluster = logoSide !== "none" ? <LogoCluster logos={involved} /> : null;

  const textBlock = compact ? (
    <div className="min-w-0 text-sm space-y-1">
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
  ) : (
    <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
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

  // For a right-side cluster the text takes only its content width so the logo
  // sits right next to the sentence (not pushed to the far right edge). For a
  // left-side cluster the text fills the remaining width.
  return (
    <div className="flex items-center gap-2">
      {logoSide === "left" && cluster}
      <div className={logoSide === "right" ? "min-w-0" : "flex-1 min-w-0"}>{textBlock}</div>
      {logoSide === "right" && cluster}
    </div>
  );
}
