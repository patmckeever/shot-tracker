/** Champion / PLL squad code → city label for CSV `opposing_team`. */

const TEAM_CODE_ALIASES: Record<string, string> = {
  ATL: "NY",
  CHA: "CAR",
  WAT: "PHI",
};

const CODE_TO_CITY: Record<string, string> = {
  MD: "Baltimore",
  BOS: "Boston",
  DEN: "Denver",
  NY: "New York",
  PHI: "Philadelphia",
  CAR: "Charlotte",
  CA: "California",
  UTA: "Utah",
};

export function opposingTeamCity(teamAbbrev: string | null | undefined): string {
  if (!teamAbbrev) return "";
  const code = teamAbbrev.toUpperCase().trim();
  const mapped = TEAM_CODE_ALIASES[code] ?? code;
  return CODE_TO_CITY[mapped] ?? code;
}
