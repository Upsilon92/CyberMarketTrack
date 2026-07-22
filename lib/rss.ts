// Market news from Google News RSS (cybersecurity M&A, FR + EN). Fetched
// server-side (no CORS), parsed dependency-free, merged/deduped/sorted, and
// cached ~20 min via the fetch data cache. Only headlines + links back to the
// source are shown (standard RSS syndication).

export interface RssItem {
  title: string;
  link: string;
  source: string | null;
  date: string | null; // ISO
}

const FEEDS = [
  "https://news.google.com/rss/search?q=cybers%C3%A9curit%C3%A9%20%28rachat%20OR%20acquisition%20OR%20fusion%20OR%20acquiert%29&hl=fr&gl=FR&ceid=FR:fr",
  "https://news.google.com/rss/search?q=cybersecurity%20%28acquisition%20OR%20acquires%20OR%20merger%20OR%20buyout%29&hl=en-US&gl=US&ceid=US:en",
];

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const grab = (re: RegExp) => {
      const x = block.match(re);
      return x ? decode(x[1]) : null;
    };
    let title = grab(/<title>([\s\S]*?)<\/title>/);
    const link = grab(/<link>([\s\S]*?)<\/link>/);
    const pub = grab(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const source = grab(/<source\b[^>]*>([\s\S]*?)<\/source>/);
    if (!title || !link) continue;
    // Google News appends " - Source" to titles; drop it when redundant.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const date = pub && !isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : null;
    items.push({ title, link, source, date });
  }
  return items;
}

async function fetchFeed(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CyberMarketTrack/1.0; +https://cyber.upsilon.ovh)",
      },
      // Cache the raw feed ~60 min (overrides force-dynamic's no-store default).
      next: { revalidate: 3600 },
    });
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

export async function getMarketNews(): Promise<RssItem[]> {
  const xmls = await Promise.all(FEEDS.map(fetchFeed));
  const all = xmls.flatMap(parseFeed);

  const seen = new Set<string>();
  const deduped = all.filter((i) => {
    const key = i.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return deduped.slice(0, 30);
}
