// Company logo with graceful fallback to a monogram (first letters) when no
// logo is set. Works with a URL or a data URI (uploaded logo).
//
// Logos are often landscape (they include the company name), so the container
// is a rectangle: the image is contained inside without cropping. A neutral
// white-ish backing makes transparent logos legible in both light and dark.
export function CompanyLogo({
  name,
  logoUrl,
  width = 40,
  height = 40,
  className = "",
}: {
  name: string;
  logoUrl?: string | null;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <span
        // Always a light (white) backing so transparent logos stay legible in
        // dark mode too.
        className={`inline-flex items-center justify-center rounded-md bg-white ring-1 ring-border overflow-hidden shrink-0 p-1 ${className}`}
        style={{ width, height }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="max-w-full max-h-full object-contain" />
      </span>
    );
  }
  // Monogram fallback (square, sized to the height)
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-primary/10 text-primary font-semibold ring-1 ring-primary/20 shrink-0 ${className}`}
      style={{ width: height, height, fontSize: height * 0.4 }}
    >
      {initials}
    </span>
  );
}
