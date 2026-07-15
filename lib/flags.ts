// Country code (ISO 3166-1 alpha-2) -> emoji flag. Pure string arithmetic,
// no image assets needed.
export function countryFlag(iso: string | null | undefined): string {
  if (!iso || iso.length !== 2) return "";
  const base = 0x1f1e6; // regional indicator A
  const chars = iso.toUpperCase().split("");
  return String.fromCodePoint(
    base + (chars[0].charCodeAt(0) - 65),
    base + (chars[1].charCodeAt(0) - 65)
  );
}
