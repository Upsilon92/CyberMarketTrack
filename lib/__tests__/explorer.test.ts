import { describe, expect, it } from "vitest";
import { layoutLabels } from "@/lib/explorer-frise";
import { domainFromText, domainOfTypes } from "@/lib/domains";
import { hitRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { formatDealValue } from "@/lib/money";

describe("frise label layout", () => {
  it("never overlaps labels on the same side and tier", () => {
    const labels = Array.from({ length: 12 }, (_, i) => ({ key: String(i), x: i * 30, w: 140 }));
    const { placements } = layoutLabels(labels, 1000);
    const boxes = [...placements.values()];
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b || a.side !== b.side || a.tier !== b.tier) continue;
        const overlap = a.left < b.left + 140 && b.left < a.left + 140;
        expect(overlap).toBe(false);
      }
  });
  it("keeps labels inside the plot", () => {
    const { placements } = layoutLabels([{ key: "end", x: 995, w: 150 }], 1000);
    expect(placements.get("end")!.left).toBeLessThanOrEqual(850);
  });
});

describe("market domains", () => {
  it("maps solution types to domains", () => {
    expect(domainOfTypes(["edr", "xdr", "pam"])).toBe("detection");
    expect(domainOfTypes(["dmarc"])).toBe("email");
  });
  it("infers a domain from a description, conservatively", () => {
    expect(domainFromText("Éditeur de sécurité e-mail anti-phishing")).toBe("email");
    expect(domainFromText("Plateforme CNAPP de sécurité cloud couvrant les vulnérabilités")).toBe("cloud");
    expect(domainFromText("Fournisseur de sécurité DNS, DDoS et protection applicative")).toBe("network");
    expect(domainFromText("Acteur à vérifier ; sécurité cloud")).toBeNull();
    expect(domainFromText("")).toBeNull();
  });
});

describe("login protections", () => {
  it("rate limit returns remaining attempts then a retry delay", () => {
    const k = `t-${Math.random()}`;
    expect(hitRateLimit(k, 2, 60_000)).toMatchObject({ ok: true, remaining: 1 });
    expect(hitRateLimit(k, 2, 60_000)).toMatchObject({ ok: true, remaining: 0 });
    const r = hitRateLimit(k, 2, 60_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(55_000);
  });
  it("uses the proxy-appended (last) X-Forwarded-For entry", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.7");
  });
});

describe("deal value format", () => {
  it("formats millions and billions", () => {
    expect(formatDealValue(7750, "en")).toBe("$7.75B");
    expect(formatDealValue(120, "en")).toBe("$120M");
    expect(formatDealValue(null, "fr")).toBeNull();
  });
});
