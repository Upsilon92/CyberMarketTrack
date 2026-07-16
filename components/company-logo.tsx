// Company logo with graceful fallback to a monogram (first letters) when no
// logo is set. Works with a URL or a data URI (uploaded logo). A neutral
// container adapts to light/dark; transparent-background logos look best.
export function CompanyLogo({
  name,
  logoUrl,
  size = 40,
  className = "",
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-md bg-white/70 dark:bg-white/10 ring-1 ring-border overflow-hidden shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="max-w-[85%] max-h-[85%] object-contain" />
      </span>
    );
  }
  // Monogram fallback
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-primary/10 text-primary font-semibold ring-1 ring-primary/20 shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}
