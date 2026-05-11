/**
 * GET /api/games?season=2026&league=pll_regular
 *
 * Returns the list of matches for a season so the frontend can render
 * a game picker. Lightweight — only metadata, no shot events.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSchedule, LEAGUE_IDS, type ChampionScheduleMatchRow } from "../../lib/championData.js";
import { sortMatchesChronologically } from "../../lib/scheduleGameNumber.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }

  try {
    const season = parseInt(String(req.query.season ?? "2025"), 10);
    const leagueParam = String(req.query.league ?? "pll_regular") as keyof typeof LEAGUE_IDS;
    const league_id = LEAGUE_IDS[leagueParam] ?? LEAGUE_IDS.pll_regular;

    const schedule = await getSchedule({ season_id: season, league_id });

    const raw: ChampionScheduleMatchRow[] = schedule.matches ?? [];
    const sorted = sortMatchesChronologically(raw);
    const matches = sorted.map((m, i) => ({
      match_id: String(m.matchId),
      game_number: i + 1,
      week: m.round ?? null,
      date: m.localStartTime ?? null,
      home: m.homeSquadCode ?? null,
      away: m.awaySquadCode ?? null,
      market: m.venueCode ?? null,
      status: m.matchStatus ?? null,
    }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ season, league: leagueParam, matches });
  } catch (err: any) {
    console.error("/api/games error:", err);
    return res.status(500).json({ error: err.message ?? "unknown error" });
  }
}
