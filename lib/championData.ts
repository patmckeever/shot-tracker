/**
 * Champion Data REST API client.
 *
 * Auth: HTTP Basic — same shape as Python `requests` with `HTTPBasicAuth(user, pwd)`:
 *   `Authorization: Basic base64(username + ":" + password)`
 *
 * Ref: https://api.lacrosse.championdata.io/swagger/index.html
 */

const CHAMPION_BASE = "https://api.lacrosse.championdata.io";

// PLL's league ID conventions (from Notion doc):
//   1 = PLL Regular Season
//   5 = Champ Series
//   6 = WLL Champ Series
//   7 = WLL Regular Season (likely)
export const LEAGUE_IDS = {
  pll_regular: 1,
  champ_series: 5,
  wll_champ_series: 6,
  wll_regular: 7,
} as const;

function getBasicAuthorization(): string {
  const username = process.env.CHAMPION_DATA_USERNAME?.trim();
  const password = process.env.CHAMPION_DATA_PASSWORD ?? "";
  if (!username) {
    throw new Error(
      "Missing CHAMPION_DATA_USERNAME (and optionally CHAMPION_DATA_PASSWORD) in env vars",
    );
  }
  const token = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Flat `matches` row expected by `/api/games` and smoke tests (derived from Champion nested schedule). */
export type ChampionScheduleMatchRow = {
  matchId: string | number;
  round?: number;
  localStartTime?: string | null;
  homeSquadCode?: string | null;
  awaySquadCode?: string | null;
  venueCode?: string | null;
  matchStatus?: string | null;
};

function normalizeScheduleMatchRow(
  m: Record<string, unknown>,
  weekNumber?: number,
): ChampionScheduleMatchRow {
  const squads = m.squads as Record<string, { code?: string }> | undefined;
  const date = m.date as Record<string, string | undefined> | undefined;
  const venue = m.venue as { code?: string } | undefined;
  const status = m.status as { code?: string; name?: string } | undefined;
  const weekOrder = m.weekOrder;

  return {
    matchId: (m.matchId ?? m.id) as string | number,
    round:
      weekNumber ??
      (typeof weekOrder === "number" ? weekOrder : typeof m.round === "number" ? m.round : undefined),
    localStartTime: (m.localStartTime as string | undefined) ?? date?.utcMatchStart ?? date?.startDate ?? null,
    homeSquadCode: (m.homeSquadCode as string | undefined) ?? squads?.home?.code ?? null,
    awaySquadCode: (m.awaySquadCode as string | undefined) ?? squads?.away?.code ?? null,
    venueCode: (m.venueCode as string | undefined) ?? venue?.code ?? null,
    matchStatus: (m.matchStatus as string | undefined) ?? status?.code ?? status?.name ?? null,
  };
}

/** Champion returns `phases[].weeks[].matches[]`; older docs assumed a top-level `matches` array. */
function flattenScheduleToMatches(raw: unknown): ChampionScheduleMatchRow[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.matches)) {
    return (r.matches as Record<string, unknown>[]).map((m) =>
      normalizeScheduleMatchRow(m),
    );
  }
  const phases = r.phases;
  if (!Array.isArray(phases)) return [];
  const out: ChampionScheduleMatchRow[] = [];
  for (const phase of phases) {
    if (!phase || typeof phase !== "object") continue;
    const weeks = (phase as Record<string, unknown>).weeks;
    if (!Array.isArray(weeks)) continue;
    for (const week of weeks) {
      if (!week || typeof week !== "object") continue;
      const weekNum = (week as Record<string, unknown>).number;
      const wm = (week as Record<string, unknown>).matches;
      if (!Array.isArray(wm)) continue;
      for (const m of wm) {
        if (!m || typeof m !== "object") continue;
        out.push(
          normalizeScheduleMatchRow(
            m as Record<string, unknown>,
            typeof weekNum === "number" ? weekNum : undefined,
          ),
        );
      }
    }
  }
  return out;
}

async function cdFetch(path: string): Promise<any> {
  const res = await fetch(`${CHAMPION_BASE}${path}`, {
    headers: {
      Authorization: getBasicAuthorization(),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Champion Data ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

/**
 * GET /v1/leagues/:leagueId/levels/:levelId/seasons/:seasonId/schedule
 * Returns an array of matches for the season.
 */
export async function getSchedule(opts: {
  league_id?: number;
  level_id?: number;
  season_id: number;
}) {
  const { league_id = LEAGUE_IDS.pll_regular, level_id = 1, season_id } = opts;
  const path = `/v1/leagues/${league_id}/levels/${level_id}/seasons/${season_id}/schedule`;
  const raw = await cdFetch(path);
  const matches = flattenScheduleToMatches(raw);
  return { ...raw, matches };
}

/**
 * GET /v1/matches/:matchId
 * Returns match metadata (MatchInfo). Shot-level rows live under `/shots`, not here.
 */
export async function getMatch(matchId: string) {
  return cdFetch(`/v1/matches/${matchId}`);
}

/**
 * GET /v1/matches/:matchId/shots
 * Returns `{ matchId, shots: ShotTransaction[] }` — the feed the tracker uses.
 */
export async function getMatchShots(matchId: string) {
  return cdFetch(`/v1/matches/${matchId}/shots`);
}

/**
 * GET /v1/matches/:matchId/persons
 * Home/away squads with roster players — `code` matches shot `squad.code` (unlike PLL `officialId`).
 */
export async function getMatchPersons(matchId: string) {
  return cdFetch(`/v1/matches/${matchId}/persons`);
}

/**
 * GET /v1/matches/:matchId/flow/metric
 * Metric-level timeline (turnovers, shot flags, etc.).
 */
export async function getMatchMetricFlow(matchId: string) {
  return cdFetch(`/v1/matches/${matchId}/flow/metric`);
}
