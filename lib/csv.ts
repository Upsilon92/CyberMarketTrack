// =============================================================================
// Minimal CSV parsing/serialization — no external dependency.
// Handles quoted fields (embedded delimiters, quotes, newlines), CRLF, and
// auto-detects the delimiter (comma or semicolon — French Excel exports use
// semicolons).
// =============================================================================

export interface CsvTable {
  headers: string[];
  rows: Record<string, string>[];
}

export function detectDelimiter(firstLine: string): "," | ";" {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/** Parses CSV text into rows keyed by the header line. Throws on empty input. */
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, ""); // strip BOM
  const firstLineEnd = clean.indexOf("\n");
  const delimiter = detectDelimiter(firstLineEnd === -1 ? clean : clean.slice(0, firstLineEnd));

  // Tokenize with quote awareness
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) throw new Error("empty CSV");

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}

/** Serializes rows to CSV (used for the downloadable templates and exports). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

// --- Import templates (one per data type; documented in ARCHITECTURE.md) -------

export const CSV_TEMPLATES: Record<string, { headers: string[]; example: string[] }> = {
  companies: {
    headers: [
      "initialName",
      "types",
      "foundedYear",
      "foundedMonth",
      "country",
      "originCountry",
      "description",
      "website",
    ],
    example: ["Acme Security", "VENDOR|SERVICE_PROVIDER", "2015", "", "FR", "", "Éditeur français", "https://acme.example"],
  },
  solutions: {
    headers: [
      "initialName",
      "initialCompany",
      "launchYear",
      "launchMonth",
      "description",
      "website",
      "tags",
    ],
    example: ["Acme Shield", "Acme Security", "2018", "", "EDR nouvelle génération", "", "edr|active-directory"],
  },
  tags: {
    headers: ["slug", "family", "labelFr", "labelEn", "category"],
    example: ["dlp", "SOLUTION_TYPE", "DLP", "DLP", ""],
  },
  events: {
    headers: [
      "type",
      "subjectCompany",
      "subjectSolution",
      "year",
      "month",
      "newName",
      "acquirer",
      "outcome",
      "withCompany",
      "newOwner",
      "amount",
      "round",
      "note",
      "description",
    ],
    example: ["ACQUISITION", "Acme Security", "", "2021", "3", "", "BigCorp", "AUTONOMOUS", "", "", "", "", "", "Rachat industriel"],
  },
};
