// Compact, scrollable tile of cybersecurity M&A headlines (Google News RSS,
// FR + EN). Headlines link back to the source (new tab). Server component.
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMarketNews } from "@/lib/rss";

export async function MarketNews() {
  const t = await getTranslations("home");
  const locale = await getLocale();

  let items: Awaited<ReturnType<typeof getMarketNews>> = [];
  try {
    items = await getMarketNews();
  } catch {
    items = [];
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span aria-hidden>📰</span>
          {t("rssTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 py-6">{t("rssUnavailable")}</p>
        ) : (
          <ul className="max-h-[260px] overflow-y-auto divide-y">
            {items.map((it, i) => (
              <li key={i} className="px-4 py-2">
                <a
                  href={it.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground hover:text-primary hover:underline line-clamp-2"
                >
                  {it.title}
                </a>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                  {it.source && <span>{it.source}</span>}
                  {it.date && <span>{new Date(it.date).toLocaleDateString(locale)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
