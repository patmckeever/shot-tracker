/** Champion / PLL squad code → city label for CSV `opposing_team`. */

const TEAM_CODE_ALIASES: Record<string, string> = {
  MD: "WHP",
  BOS: "CAN",
  DEN: "OUT",
  NY: "ATL",
  PHI: "WAT",
  CAR: "CHA",
  CA: "RED",
  UTA: "ARC",
};

const CODE_TO_CITY: Record<string, string> = {
  OUT: "Denver",
  WHP: "Baltimore",
  ARC: "Utah",
  CAN: "Boston",
  WAT: "Philadelphia",
  ATL: "New York",
  CHA: "Charlotte",
  RED: "California",
  WCHA: "Maryland",
  WCHR: "New York",
  WGUA: "Boston",
  WPLM: "California",
};

export function opposingTeamCity(teamAbbrev: string | null | undefined): string {
  if (!teamAbbrev) return "";
  const code = teamAbbrev.toUpperCase().trim();
  const mapped = TEAM_CODE_ALIASES[code] ?? code;
  return CODE_TO_CITY[mapped] ?? code;
}
