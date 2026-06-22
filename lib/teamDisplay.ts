/** Champion / PLL squad code → CSV team nickname (Waterdogs, Charm, Charging, …). */

const TEAM_CODE_ALIASES: Record<string, string> = {
  MD: "WHP",
  BOS: "CAN",
  DEN: "OUT",
  NY: "ATL",
  PHI: "WAT",
  CAR: "CHA",
  CA: "RED",
  UTA: "ARC",
  MDC: "WCHR",
  NYC: "WCHA",
};

const TEAM_NAMES: Record<string, string> = {
  OUT: "Outlaws",
  WHP: "Whipsnakes",
  ARC: "Archers",
  CAN: "Cannons",
  WAT: "Waterdogs",
  ATL: "Atlas",
  CHA: "Chaos",
  CHR: "Chrome",
  RED: "Redwoods",
  WCHR: "Maryland Charm",
  WCHA: "New York Charging",
  WGUA: "Boston Guard",
  WPLM: "California Palms",
};

function canonicalTeamCode(teamAbbrev: string): string {
  const code = teamAbbrev.toUpperCase().trim();
  return TEAM_CODE_ALIASES[code] ?? code;
}

/** Mascot / nickname for CSV — "Maryland Charm" → "Charm", "Outlaws" stays "Outlaws". */
export function csvTeamName(teamAbbrev: string | null | undefined): string {
  if (!teamAbbrev) return "";
  const code = canonicalTeamCode(teamAbbrev);
  const fullName = TEAM_NAMES[code] ?? teamAbbrev;
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;
}
