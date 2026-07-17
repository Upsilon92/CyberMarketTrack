"use client";

// Downloads a company's logo with a filename based on the company name, so the
// exported files can later be re-associated to companies by filename.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Filesystem-safe file base from the company name. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "_") || "logo";
}

export function LogoDownloadButton({ name, logoUrl }: { name: string; logoUrl: string }) {
  const t = useTranslations("company");
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      let blob: Blob;
      let ext = "png";
      if (logoUrl.startsWith("data:")) {
        const m = logoUrl.match(/^data:([^;]+);base64,(.*)$/);
        if (!m) return;
        ext = EXT[m[1]] ?? "img";
        const bin = atob(m[2]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        blob = new Blob([arr], { type: m[1] });
      } else {
        // Remote URL: fetch to force the download filename.
        const res = await fetch(logoUrl);
        blob = await res.blob();
        ext = EXT[blob.type] ?? logoUrl.split(".").pop()?.split(/[?#]/)[0] ?? "img";
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName(name)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Cross-origin fetch may fail; open the URL as a fallback.
      window.open(logoUrl, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={busy}>
      ⬇ {t("downloadLogo")}
    </Button>
  );
}
