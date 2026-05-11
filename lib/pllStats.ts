/**
 * PLL Stats GraphQL API client.
 *
 * Used to enrich Champion Data shot events with roster information:
 * jersey numbers, positions, handedness, country, headshots when exposed.
 *
 * Auth: API key in env var (PLL_STATS_API_KEY), passed as Bearer token.
 *
 * Endpoint: https://api.stats.premierlacrosseleague.com/graphql
 *
 * Schema notes (validated against production — introspection disabled):
 * - `Team` has no `teamCode`; use `officialId` as the roster team key when joining downstream.
 * - `seasonEvents.week` is typed as String (pass e.g. `"1"` from numeric week).
 * - Events align with Champion via `externalEventId` (match ID string).
 * - Roster rows expose `handedness`, `country`, `profileUrl` on `playersGameStats` (`Player`).
 */

import type { Player } from "./types.js";

const PLL_GRAPHQL = "https://api.stats.premierlacrosseleague.com/graphql";

async function gql<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const apiKey = process.env.PLL_STATS_API_KEY;
  if (!apiKey) throw new Error("Missing PLL_STATS_API_KEY env var");

  const res = await fetch(PLL_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`PLL Stats API ${res.status}: ${await res.text()}`);
  }

  const body = await res.json() as { data?: T; errors?: any[] };
  if (body.errors?.length) {
    throw new Error(`PLL Stats GraphQL errors: ${JSON.stringify(body.errors)}`);
  }
  if (!body.data) throw new Error("PLL Stats API returned no data");
  return body.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Roster query — both teams in one round trip via seasonEvents shape
// ─────────────────────────────────────────────────────────────────────────────

const ROSTER_QUERY = `
  query GameRosters($season: Int!, $week: String!) {
    seasonEvents(season: $season, week: $week, includeCS: true) {
      week
      externalEventId
      homeTeam {
        officialId
        playersGameStats {
          officialId
          name
          jerseyNum
          position
          profileUrl
          handedness
          country 
        }
      }
      awayTeam {
        officialId
        playersGameStats {
          officialId
          name
          jerseyNum
          position
          profileUrl
          handedness
          country 
        }
      }
    }
  }
`;

interface RosterPlayerRaw {
  officialId: string;
  name: string;
  jerseyNum: number;
  position: string;
  profileUrl: string | null;
  handedness: "L" | "R" | null;
  country: string | null;
}

interface RosterTeamRaw {
  officialId: string;
  playersGameStats: RosterPlayerRaw[];
}

interface SeasonEventsResponse {
  seasonEvents: {
    week: number;
    externalEventId: string;
    homeTeam: RosterTeamRaw;
    awayTeam: RosterTeamRaw;
  }[];
}

/**
 * Fetch rosters for a specific week in a specific season.
 * Returns one Roster per team (home and away) for the matching event.
 */
export async function getRostersForGame(opts: {
  season: number;
  week: number;
  match_external_id: string;
}): Promise<{ home: Player[]; away: Player[] }> {
  const data = await gql<SeasonEventsResponse>(ROSTER_QUERY, {
    season: opts.season,
    week: String(opts.week),
  });

  const event = data.seasonEvents.find((e) => e.externalEventId === opts.match_external_id);
  if (!event) {
    throw new Error(`No event matching externalEventId ${opts.match_external_id} in season ${opts.season} week ${opts.week}`);
  }

  return {
    home: event.homeTeam.playersGameStats.map((p) => mapPlayer(p, event.homeTeam.officialId)),
    away: event.awayTeam.playersGameStats.map((p) => mapPlayer(p, event.awayTeam.officialId)),
  };
}

/**
 * Try several PLL week numbers — Champion week can disagree with Stats “week” buckets.
 */
export async function getRostersForGameTryWeeks(opts: {
  season: number;
  weeks: number[];
  match_external_id: string;
}): Promise<{ home: Player[]; away: Player[] }> {
  const uniq = [...new Set(opts.weeks.filter((w) => typeof w === "number" && w > 0))];
  const attemptWeeks = uniq.length > 0 ? uniq : [1];

  let lastErr: unknown;
  for (const week of attemptWeeks) {
    try {
      return await getRostersForGame({
        season: opts.season,
        week,
        match_external_id: opts.match_external_id,
      });
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "PLL roster lookup failed"));
}

function mapPlayer(p: RosterPlayerRaw, teamOfficialId: string): Player {
  return {
    player_id: p.officialId,
    name: p.name,
    number: p.jerseyNum,
    team: String(teamOfficialId),
    position: p.position,
    handedness: p.handedness as "L" | "R" | null,
    country: p.country,
    headshot_url: p.profileUrl,
  };
}
