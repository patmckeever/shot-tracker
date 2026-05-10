/**
 * GET /api/games/:matchId
 *
 * Returns everything the tracker UI needs to start working on a game:
 *   - Game metadata (teams, week, date)
 *   - Both rosters (jersey, position, hand, headshot)
 *   - All shot events with @cd and @pll fields populated
 *
 * Tracker fields (x, y, defender, etc.) are null — the human fills those in.
 *
 * This endpoint can be slow (~2-5s) because it makes 2 upstream API calls.
 * Cache aggressively at the edge.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getMatch, getMatchPersons, getMatchShots } from "../../lib/championData.js";
import {
  enrichChampionRosterWithPllSide,
  rosterPlayersFromChampionPersons,
  type ChampionMatchPersonsResponse,
} from "../../lib/matchRosters.js";
import { getRostersForGameTryWeeks } from "../../lib/pllStats.js";
import type { Player } from "../../lib/types.js";
import { extractGame, extractShots, joinPllStats } from "../../lib/shotTransform.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method not allowed" });
  }

  const matchId = String(req.query.matchId ?? "");
  if (!matchId) return res.status(400).json({ error: "missing matchId" });

  try {
    const match = await getMatch(matchId);
    const game = extractGame(match);
    const matchShots = await getMatchShots(matchId);
    const shots = extractShots(game, match, matchShots.shots ?? []);

    const personsPayload = (await getMatchPersons(matchId)) as ChampionMatchPersonsResponse;
    const fromCd = rosterPlayersFromChampionPersons(personsPayload, game.home_team, game.away_team);
    let homePlayers: Player[] = fromCd.home;
    let awayPlayers: Player[] = fromCd.away;

    try {
      const m = match as Record<string, unknown>;
      const weekCandidates = [
        game.week,
        typeof m.phaseWeekNumber === "number" ? m.phaseWeekNumber : undefined,
        typeof m.weekNumber === "number" ? m.weekNumber : undefined,
      ];
      const pll = await getRostersForGameTryWeeks({
        season: game.season,
        weeks: weekCandidates.filter((x): x is number => typeof x === "number" && x > 0),
        match_external_id: matchId,
      });
      homePlayers = enrichChampionRosterWithPllSide(homePlayers, pll.home);
      awayPlayers = enrichChampionRosterWithPllSide(awayPlayers, pll.away);
    } catch (err) {
      console.warn(`PLL Stats roster enrichment failed for ${matchId} — using Champion persons only:`, err);
    }

    const allPlayers = [...homePlayers, ...awayPlayers];
    if (allPlayers.length > 0) joinPllStats(shots, allPlayers);

    // Cache for 5 min at edge — match data doesn't change often once a game is final.
    // For live games, the tracker can force a fresh load via cache-bust query param.
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");

    return res.status(200).json({
      game,
      rosters: {
        home: { team: game.home_team, players: homePlayers },
        away: { team: game.away_team, players: awayPlayers },
      },
      shots,
    });
  } catch (err: any) {
    console.error(`/api/games/${matchId} error:`, err);
    return res.status(500).json({ error: err.message ?? "unknown error" });
  }
}
