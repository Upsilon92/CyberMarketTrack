// Renders a country flag as a static, same-origin SVG image (public/flags,
// from country-flag-icons, MIT). Emoji flags are not used: Windows renders
// regional-indicator emoji as two letters ("US") instead of a flag.
// `size` keeps the historical emoji scale (≈ glyph size); the image height is
// ~72% of it so existing call sites keep the same visual weight.
import { FLAG_CODES } from "@/lib/flag-codes";

export function Flag({
  iso,
  className = "",
  title,
  size = "1.35em",
}: {
  iso: string | null | undefined;
  className?: string;
  title?: string;
  size?: string;
}) {
  const code = iso?.toUpperCase();
  // Strict whitelist: the code ends up in a URL path.
  if (!code || !/^[A-Z]{2}$/.test(code) || !FLAG_CODES.has(code)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${code}.svg`}
      alt={title ?? code}
      title={title ?? code}
      loading="lazy"
      decoding="async"
      className={`inline-block align-middle rounded-[2px] ring-1 ring-black/10 dark:ring-white/15 ${className}`}
      style={{ height: `calc(${size} * 0.72)`, width: `calc(${size} * 1.08)`, objectFit: "cover" }}
    />
  );
}
