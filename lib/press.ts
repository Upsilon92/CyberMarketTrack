// =============================================================================
// Press search via Google News RSS (server-side, no CORS). Used to ground LLM
// analysis on real articles and to attach real source URLs as proof.
// =============================================================================
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface NewsHit {
  title: string;
  link: string; // Google News redirect (resolve with resolveArticleUrl when needed)
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Google News RSS search (EN + FR), deduped by title. `max` caps the total. */
export async function searchNews(query: string, max = 24): Promise<NewsHit[]> {
  const q = encodeURIComponent(query);
  const feeds = [
    `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`,
    `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`,
  ];
  const out: NewsHit[] = [];
  const seen = new Set<string>();
  for (const url of feeds) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) continue;
      const xml = await r.text();
      const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(xml)) && out.length < max) {
        const block = m[1];
        let title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
        const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
        const source = decodeEntities(block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
        const key = title.toLowerCase();
        if (title && link && !seen.has(key)) {
          seen.add(key);
          out.push({ title, link });
        }
      }
    } catch {
      /* ignore feed errors */
    }
  }
  return out;
}

// --- Shared text-matching helpers (accent-insensitive, whole-word) -----------

export const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function mentions(hay: string, phrase?: string | null): boolean {
  const n = strip(phrase ?? "").trim();
  if (n.length < 3) return false;
  const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return re.test(hay);
}
