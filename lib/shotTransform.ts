/**
 * Champion Data → Shot[] transform.
 *
 * Match summary comes from `GET /v1/matches/:id` (MatchInfo).
 * Shot rows come from `GET /v1/matches/:id/shots` (ShotTransaction list).
 *
 * @pll fields are added later (joinPllStats).
 * @tracker fields stay null until the UI fills them.
 */

import type { Game, Player, Shot } from "./types";

/** Minimal shape of MatchInfo from `GET /v1/matches/:matchId`. */
export interface ChampionMatchInfo {
  id?: number;
  seasonId?: number;
  weekNumber?: number;
  phaseWeekNumber?: number;
  date?: { startDate?: string; utcMatchStart?: string };
  venue?: { code?: string };
  home?: { code?: string; id?: number };
  away?: { code?: string; id?: number };
}

interface ShotTxPerson {
  id?: number;
  fullname?: string;
  displayName?: string;
}

interface ShotTxMissType {
  shotOnGoal?: boolean;
  shotSaved?: boolean;
  saveType?: string;
}

interface ShotTxResult {
  name?: string;
  code?: string;
  points?: number;
  missType?: ShotTxMissType;
}

/** ShotTransaction from MatchShots.shots[]. */
export interface ShotTransaction {
  matchTrxId?: number;
  period?: number;
  periodTime?: string;
  shotPlayer?: ShotTxPerson;
  assistPlayer?: ShotTxPerson;
  goalkeeperPlayer?: ShotTxPerson;
  squad?: { code?: string };
  result?: ShotTxResult;
  details?: { shotValue?: string; shotHand?: string; shotLocation?: string; shotType?: string };
}

export function extractGame(match: ChampionMatchInfo): Game {
  const id = match.id != null ? String(match.id) : "";
  const season = typeof match.seasonId === "number" ? match.seasonId : 0;
  const week =
    typeof match.weekNumber === "number"
      ? match.weekNumber
      : typeof match.phaseWeekNumber === "number"
        ? match.phaseWeekNumber
        : 0;
  const date =
    (typeof match.date?.utcMatchStart === "string" ? match.date.utcMatchStart.slice(0, 10) : "") ||
    match.date?.startDate ||
    "";

  return {
    game_id: id,
    game_number: 0,
    season,
    week,
    date,
    market: match.venue?.code ?? "",
    home_team: (match.home?.code ?? "").toUpperCase(),
    away_team: (match.away?.code ?? "").toUpperCase(),
  };
}

function personName(p?: ShotTxPerson): string {
  if (!p) return "";
  return (p.fullname ?? p.displayName ?? "").trim();
}

function shotTransactionResult(ev: ShotTransaction): "GOAL" | "SAVE" | "MISS" {
  const name = (ev.result?.name ?? "").trim();
  if (/^goal/i.test(name)) return "GOAL";
  const mt = ev.result?.missType;
  if (mt?.shotSaved) return "SAVE";
  return "MISS";
}

function shotPoints(ev: ShotTransaction): 1 | 2 {
  const p = ev.result?.points;
  if (p === 2) return 2;
  if (p === 1) return 1;
  const hint = ev.details?.shotValue ?? "";
  return hint.includes("2") ? 2 : 1;
}

/** Champion `details.shotHand` — hand used on the shot (PBP), not roster strong side. */
function shotHandFromPlayByPlay(raw: string | undefined | null): "L" | "R" | null {
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "l" || s === "lh" || s.startsWith("left") || /\bleft\b/.test(s)) return "L";
  if (s === "r" || s === "rh" || s.startsWith("right") || /\bright\b/.test(s)) return "R";
  return null;
}

function qtrFromPeriod(period: number): 1 | 2 | 3 | 4 | 5 {
  if (period <= 1) return 1;
  if (period === 2) return 2;
  if (period === 3) return 3;
  if (period === 4) return 4;
  return 5;
}

/**
 * Build Shot rows from Champion `MatchShots.shots` transactions.
 */
export function extractShots(game: Game, matchInfo: ChampionMatchInfo, transactions: ShotTransaction[]): Shot[] {
  const home = (matchInfo.home?.code ?? "").toUpperCase();
  const away = (matchInfo.away?.code ?? "").toUpperCase();
  const shots: Shot[] = [];

  for (const ev of transactions) {
    const offensive = (ev.squad?.code ?? "").toUpperCase();
    const opposing_team =
      offensive && home && away ? (offensive === home ? away : offensive === away ? home : "") : "";

    const trxId = ev.matchTrxId ?? shots.length + 1;
    const shooterNm = personName(ev.shotPlayer);
    const assistNm = personName(ev.assistPlayer);
    const goalieNm = personName(ev.goalkeeperPlayer);

    const shot: Shot = {
      shot_id: `${game.game_id}_${trxId}`,
      unique_id: String(trxId),
      game_id: game.game_id,
      game_number: game.game_number,
      qtr: qtrFromPeriod(ev.period ?? 1),
      game_clock: ev.periodTime ?? "",

      team: offensive,
      opposing_team,
      player: shooterNm,
      shooter_id: ev.shotPlayer?.id != null ? String(ev.shotPlayer.id) : "",
      first_assist: assistNm || null,
      first_assist_id: ev.assistPlayer?.id != null ? String(ev.assistPlayer.id) : null,
      first_assist_flag: assistNm ? 1 : 0,
      goalie: goalieNm,
      goalie_id: ev.goalkeeperPlayer?.id != null ? String(ev.goalkeeperPlayer.id) : "",

      act: "Shot",
      result: shotTransactionResult(ev),
      points: shotPoints(ev),
      goale_on_pipe_flag: 0,
      goal_time: null,
      time_spent: null,

      possession_counter: 0,
      unique_possession_id: "",
      possession_start: "",
      possession_end: null,
      possession_ending_event_flag: 0,
      prev_possession_ended_by: null,
      previous_possession_end: null,
      previous_possession_situation: null,
      previous_possession_goalie: null,

      shooter_position: "",
      shooter_dominant_hand: shotHandFromPlayByPlay(ev.details?.shotHand),
      goalie_hand: null,
      passer_hand: null,
      nationality: null,

      x: null,
      y: null,
      closest_defender: null,
      closest_defender_id: null,
      second_assist: null,
      second_assist_id: null,
      shot_clock: null,
      bounce_shot: null,
      arm_angle: null,
      arm_angle_degrees: null,
      net_x: null,
      net_y: null,

      situation: null,
      dodge_action: null,
      dodge_location: null,
      shot_location: ev.details?.shotLocation ?? null,
      ct_type: null,
      ct_ro_bl_player: null,
      rebound: null,
      strong_or_wrong: null,
      big_chance: null,
      quality: null,
      down: null,
    };

    shots.push(shot);
  }

  return shots;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLL Stats enrichment
// ─────────────────────────────────────────────────────────────────────────────

export function joinPllStats(shots: Shot[], rosters: Player[]) {
  const byName = new Map<string, Player>();
  for (const p of rosters) byName.set(normalizeName(p.name), p);

  for (const s of shots) {
    const shooter = byName.get(normalizeName(s.player));
    if (shooter) {
      s.shooter_position = shooter.position;
      s.nationality = shooter.country;
    }

    if (s.first_assist) {
      const passer = byName.get(normalizeName(s.first_assist));
      if (passer) s.passer_hand = passer.handedness;
    }

    if (s.goalie) {
      const goalie = byName.get(normalizeName(s.goalie));
      if (goalie) s.goalie_hand = goalie.handedness;
    }
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}
