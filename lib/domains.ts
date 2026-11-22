// Market DOMAINS: a coarse grouping of the SOLUTION_TYPE tags (8 domains =
// the 8 validated categorical colours), used to stack the Explorer charts.
// A company's domain comes from its solutions' types; when it has no typed
// solution (typical for acquired start-ups), it is INFERRED from its
// description with conservative keyword rules — flagged as such in the UI.

export const DOMAINS = ["identity", "data", "email", "detection", "cloud", "network", "exposure", "ai"] as const;
export type Domain = (typeof DOMAINS)[number];

const TYPE_DOMAIN: Record<string, Domain> = {
  iam: "identity", pam: "identity", am: "identity", ciam: "identity", iga: "identity", itdr: "identity",
  ispm: "identity", nhi: "identity", ad_sec: "identity", "secret-management": "identity",
  pki: "identity", clm: "identity", cms: "identity", hsm: "identity", "public-ca": "identity", kms: "identity",
  dlp: "data", dspm: "data", dag: "data", dam: "data", fam: "data",
  "email-security": "email", dmarc: "email", cyber_aware: "email",
  edr: "detection", xdr: "detection", siem: "detection", soar: "detection", mdr: "detection", ndr: "detection",
  cti: "detection", bas: "detection", fim: "detection",
  cspm: "cloud", cwpp: "cloud", cnapp: "cloud", sspm: "cloud", waf: "cloud", waap: "cloud", sast: "cloud", dast: "cloud",
  sase: "network", ztna: "network", firewall: "network", micro_seg: "network", "ot-security": "network",
  easm: "exposure", vuln_scan: "exposure", vuln_mgmt: "exposure", patch_mgmt: "exposure", "config-vuln-assessment": "exposure",
  "ai-security": "ai",
};

export function domainOfType(slug: string): Domain | null {
  return TYPE_DOMAIN[slug] ?? null;
}

/** Most frequent domain among a company's solution types (ties: DOMAINS order). */
export function domainOfTypes(slugs: Iterable<string>): Domain | null {
  const n = new Map<Domain, number>();
  for (const s of slugs) {
    const d = domainOfType(s);
    if (d) n.set(d, (n.get(d) ?? 0) + 1);
  }
  let best: Domain | null = null;
  for (const d of DOMAINS) if ((n.get(d) ?? 0) > (best ? n.get(best)! : 0)) best = d;
  return best;
}

// Ordered rules (first match wins): specific domains before generic ones.
const RULES: [Domain, RegExp][] = [
  ["ai", /(s[ée]curit[ée] (de l[’']|des usages de l[’']|des agents )?(ia|intelligence artificielle)|ai security|security for ai|\bllm|ia g[ée]n[ée]rative|generative ai|agents? (ia|d[’']ia)|ai agents?|red teaming ia|prompt)/],
  ["email", /(e-?mail|messagerie|phishing|hame[çc]onnage|dmarc|anti-?spam|spam|sensibilisation|security awareness|d[ée]livrabilit)/],
  ["identity", /(identit|\biam\b|\bpam\b|\biga\b|\bmfa\b|authentifi|authentication|acc[èe]s [àa] privil[èe]ges|privileged|\bpki\b|certificat|\bhsm\b|cryptograph|gestion des secrets|secrets? management|active directory|\bsso\b|habilitation)/],
  ["data", /(donn[ée]es|data security|data protection|\bdspm\b|\bdlp\b|fuites? de|exfiltration|risques? internes?|menaces internes|insider|classification|chiffrement des donn)/],
  ["cloud", /\b(cnapp|cspm|cwpp|ciem|sspm)\b/],
  ["detection", /(\bedr\b|\bxdr\b|\bsiem\b|\bsoar\b|\bmdr\b|\bndr\b|d[ée]tection|detection|r[ée]ponse aux incidents|r[ée]ponse [àa] incident|incident response|threat intel|renseignement sur les menaces|sandbox|forensi|investigation|malware|deception|leurre|\bsoc\b|antivirus|mobile|terminaux|endpoint|t[ée]l[ée]m[ée]trie|telemetry|data fabric)/],
  ["exposure", /(vuln[ée]rabilit|vulnerab|exposition|exposure|surface d[’']attaque|attack surface|chemins d[’']attaque|attack path|pentest|tests? d[’']intrusion|correctifs|patch|rem[ée]diation des risques|priorisation)/],
  ["network", /(r[ée]seau|network|\bsase\b|\bsse\b|\bztna\b|zero trust|pare-feu|firewall|sd-wan|\bvpn\b|\bdns\b|ddos|\bot\b|industriel|\bics\b|scada|\btls\b|navigateur|browser|passerelle|filtrage web|proxy|\bcasb\b|wi-?fi|\bnac\b|iot)/],
  ["cloud", /(cloud|kubernetes|conteneur|container|\bsaas\b|appsec|s[ée]curit[ée] (du code|applicative|des api)|devsecops|\bapi\b|\bwaf\b|rasp|infrastructure-as-code|infrastructure as code|\biac\b|applicati)/],
];

/** Domain inferred from a free-text description (null when uncertain). */
export function domainFromText(text: string | null | undefined): Domain | null {
  if (!text) return null;
  const s = text.toLowerCase();
  if (/(à v[ée]rifier|to be verified|unverified)/.test(s)) return null; // unreliable description
  for (const [d, re] of RULES) if (re.test(s)) return d;
  return null;
}
