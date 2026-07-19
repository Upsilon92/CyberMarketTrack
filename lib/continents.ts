// ISO 3166-1 alpha-2 country code -> continent. Used by the companies filter so
// users can narrow by continent first, then by country within it.
export const CONTINENTS = [
  "EUROPE",
  "NORTH_AMERICA",
  "SOUTH_AMERICA",
  "ASIA",
  "AFRICA",
  "OCEANIA",
  "ANTARCTICA",
] as const;
export type Continent = (typeof CONTINENTS)[number];

const BY_CONTINENT: Record<Continent, string> = {
  EUROPE:
    "AL AD AT BY BE BA BG HR CY CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA",
  NORTH_AMERICA:
    "AG AI AW BS BB BZ BM BQ CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL KN LC MF PM VC SX TT TC US VG VI",
  SOUTH_AMERICA: "AR BO BR CL CO EC FK GF GY PE PY SR UY VE",
  ASIA:
    "AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE",
  AFRICA:
    "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW",
  OCEANIA:
    "AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF",
  ANTARCTICA: "AQ BV GS HM TF",
};

const MAP: Record<string, Continent> = {};
for (const c of CONTINENTS) for (const iso of BY_CONTINENT[c].split(" ")) MAP[iso] = c;

export function continentOf(iso: string | null | undefined): Continent | null {
  if (!iso) return null;
  return MAP[iso.toUpperCase()] ?? null;
}
