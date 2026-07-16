// Renders a country's emoji flag at a controllable size (emoji size follows
// font-size). `size` in rem-ish em units; default larger than body text.
import { countryFlag } from "@/lib/flags";

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
  const flag = countryFlag(iso);
  if (!flag) return null;
  return (
    <span
      className={`inline-block leading-none align-middle ${className}`}
      style={{ fontSize: size }}
      title={title ?? iso ?? undefined}
      aria-label={iso ?? undefined}
    >
      {flag}
    </span>
  );
}
