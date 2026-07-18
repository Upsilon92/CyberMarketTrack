// CyberMarketTrack brand logo — the official icon (shield + histogram + rising
// trend arrow + padlock). Served as a transparent PNG from /logo-icon.png so it
// renders identically on light and dark themes. `size` sets the rendered height;
// width follows the icon's aspect ratio.
export function BrandLogo({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-icon.png"
      alt="CyberMarketTrack"
      style={{ height: size, width: "auto" }}
      className={className}
    />
  );
}
