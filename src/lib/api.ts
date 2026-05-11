/**
 * Typed frontend client for the Vercel API endpoints.
 * Centralizes URL construction, error handling, and response shaping.
 */

import type { Game, Player, Shot } from "../../lib/types";

interface GameLoadResponse {
  game: Game;
  rosters: {
    home: { team: string; players: Player[] };
    away: { team: string; players: Player[] };
  };
  shots: Shot[];
  /** Champion `GET /v1/matches/:id/flow/metric` payload (may be null if fetch failed). */
  metric_flow: unknown | null;
}

/** Leagues exposed in the game picker (maps to `lib/championData` LEAGUE_IDS). */
export type GameListLeague = "pll_regular" | "champ_series";

interface GameListResponse {
  season: number;
  league: string;
  matches: {
    match_id: string;
    game_number: number;
    week: number | null;
    date: string | null;
    home: string | null;
    away: string | null;
    market: string | null;
    status: string | null;
  }[];
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

export const API = {
  listGames: (season = 2025, league: GameListLeague = "pll_regular") =>
    api<GameListResponse>(`/api/games?season=${season}&league=${encodeURIComponent(league)}`),

  loadGame: (matchId: string) =>
    api<GameLoadResponse>(`/api/games/${encodeURIComponent(matchId)}`),
};
