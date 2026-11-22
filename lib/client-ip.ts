// Client IP behind the reverse proxy (Nginx Proxy Manager / openresty).
//
// The proxy APPENDS the address it sees to X-Forwarded-For
// ($proxy_add_x_forwarded_for), so the LAST entry is the one written by our
// own proxy. Earlier entries come from the client and can be forged: using the
// first one would let anyone dodge per-IP rate limits by sending a fake header.
export function clientIpFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  return (h.get("x-real-ip") ?? "unknown").slice(0, 64);
}
