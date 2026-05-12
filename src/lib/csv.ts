/**
 * CSV export — full Stats Master column order (app computes distance + flags; xG columns left blank).
 */

import type { Game, Player, Shot } from "../../lib/types";
import {
  isDefenderChoiceComplete,
  isSecondAssistChoiceComplete,
  isShotManualTrackingComplete,
  isTrackerNoPlayerId,
} from "../../lib/types";
import { mergeShotsWithMetricFlow } from "../../lib/metricFlow";
import {
  encodeShotResultLetter,
  reboundForExport,
  shotLocationForExport,
  situationForExport,
} from "../../lib/csvFieldEncoding";
import { pllShotDistanceYards } from "../../lib/shotGraphicDistance";
import { opposingTeamCity } from "../../lib/teamDisplay";
import {
  deriveSaveSogFlags,
  passerShooterFlag,
  pointsForCsv,
  strongOrWrongCsv,
} from "../../lib/csvDerive";

/** Exact header order through PasserShooter, then bounce / net / arm columns. */
const STATS_MASTER_HEADERS = [
  "game_number",
  "qtr",
  "unique_id",
  "game_id",
  "team",
  "act",
  "player",
  "situation",
  "dodge_action",
  "dodge_location",
  "shot_hand",
  "result",
  "rebound",
  "first_assist",
  "second_assist",
  "shot_location",
  "ct_type",
  "ct_ro_bl_player",
  "x",
  "y",
  "shot_distance",
  "shot_clock",
  "closest_defender",
  "opposing_team",
  "goalie",
  "week",
  "date",
  "market",
  "strong_or_wrong",
  "points",
  "first_assist_flag",
  "possession_counter",
  "possession_ending_event_flag",
  "prev_possession_ended_by",
  "previous_possession_end",
  "previous_possession_situation",
  "possession_start",
  "possession_end",
  "unique_possession_id",
  "previous_possession_goalie",
  "shooter_position",
  "big_chance",
  "previous_possession_shot_clock_time_remaining",
  "passer_hand",
  "shooter_dominant_hand",
  "goalie_hand",
  "save",
  "shot_faced_by_goalie",
  "sog",
  "shot_clock_reset",
  "second_chance",
  "time_spent",
  "goal_time",
  "distance_from_rp",
  "distance_from_lp",
  "distance_pipe_to_pipe",
  "visible_shot_angle",
  "distance_gle",
  "goalie_arc_angle",
  "one_point_shot_flag",
  "second_assist_flag",
  "goale_on_pipe_flag",
  "defender_position",
  "is_hand_inside",
  "xg_old",
  "xG",
  "xSv",
  "season",
  "quality",
  "down",
  "nationality",
  "PasserShooter",
  "bounce_shot",
  "net_x",
  "net_y",
  "arm_angle",
  "arm_angle_degrees",
  "shot_type",
  "one_hand",
] as const;

export function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function boolCsv(b: boolean | null | undefined): string {
  if (b === true) return "1";
  if (b === false) return "0";
  return "";
}

function flatRosters(rosters: Record<string, Player[]>): Player[] {
  return Object.values(rosters).flat();
}

function playerById(players: Player[], id: string | null | undefined): Player | null {
  if (!id || isTrackerNoPlayerId(id)) return null;
  return players.find((p) => p.player_id === id) ?? null;
}

export function buildStatsMasterCsv(
  game: Game,
  shots: Shot[],
  rosters: Record<string, Player[]>,
  metricFlow: unknown,
): string {
  const players = flatRosters(rosters);
  const merged = mergeShotsWithMetricFlow(game, shots, metricFlow);

  const rows = merged.map((raw) => {
    const s: Shot = {
      ...raw,
      closest_defender_id: isTrackerNoPlayerId(raw.closest_defender_id) ? null : raw.closest_defender_id,
      second_assist_id: isTrackerNoPlayerId(raw.second_assist_id) ? null : raw.second_assist_id,
    };

    const shooter = playerById(players, s.shooter_id);
    const rosterDominant = shooter?.handedness ?? null;
    const defender = playerById(players, s.closest_defender_id);

    const shotHand = s.shooter_dominant_hand;
    const { save, shot_faced_by_goalie, sog, one_point_shot_flag, second_assist_flag } = deriveSaveSogFlags(s);

    let shotDist = "";
    if (s.x != null && s.y != null && Number.isFinite(s.x) && Number.isFinite(s.y)) {
      shotDist = String(Math.round(pllShotDistanceYards(s.x, s.y) * 100) / 100);
    }

    const resultLetter = s.act === "SH" ? encodeShotResultLetter(s) : "";
    const reboundStr = reboundForExport(s);

    const cells: string[] = [
      escapeCsv(s.game_number),
      escapeCsv(s.qtr),
      escapeCsv(s.unique_id),
      escapeCsv(s.game_id),
      escapeCsv(s.team),
      escapeCsv(s.act),
      escapeCsv(s.player),
      escapeCsv(situationForExport(s)),
      escapeCsv(s.dodge_action),
      escapeCsv(s.dodge_location),
      escapeCsv(shotHand),
      escapeCsv(resultLetter),
      escapeCsv(reboundStr),
      escapeCsv(s.first_assist),
      escapeCsv(s.second_assist),
      escapeCsv(shotLocationForExport(s)),
      escapeCsv(s.ct_type),
      escapeCsv(s.ct_ro_bl_player),
      escapeCsv(s.x),
      escapeCsv(s.y),
      escapeCsv(shotDist),
      escapeCsv(s.shot_clock),
      escapeCsv(s.closest_defender),
      escapeCsv(opposingTeamCity(s.opposing_team)),
      escapeCsv(s.goalie),
      escapeCsv(game.week),
      escapeCsv(game.date),
      escapeCsv(game.market),
      escapeCsv(strongOrWrongCsv(s, rosterDominant)),
      escapeCsv(pointsForCsv(s)),
      escapeCsv(s.first_assist_flag),
      escapeCsv(s.possession_counter),
      escapeCsv(s.possession_ending_event_flag),
      escapeCsv(s.prev_possession_ended_by),
      escapeCsv(s.previous_possession_end),
      escapeCsv(s.previous_possession_situation),
      escapeCsv(s.possession_start),
      escapeCsv(s.possession_end),
      escapeCsv(s.unique_possession_id),
      escapeCsv(s.previous_possession_goalie),
      escapeCsv(s.shooter_position),
      escapeCsv(boolCsv(s.big_chance)),
      escapeCsv(""),
      escapeCsv(s.passer_hand),
      escapeCsv(rosterDominant),
      escapeCsv(s.goalie_hand),
      escapeCsv(save),
      escapeCsv(shot_faced_by_goalie),
      escapeCsv(sog),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(s.time_spent),
      escapeCsv(s.goal_time),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(one_point_shot_flag),
      escapeCsv(second_assist_flag),
      escapeCsv(s.goale_on_pipe_flag),
      escapeCsv(defender?.position ?? ""),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(""),
      escapeCsv(game.season),
      escapeCsv(s.quality),
      escapeCsv(s.down),
      escapeCsv(s.nationality),
      escapeCsv(passerShooterFlag(s)),
      escapeCsv(s.bounce_shot == null ? "" : s.bounce_shot ? "1" : "0"),
      escapeCsv(s.net_x),
      escapeCsv(s.net_y),
      escapeCsv(s.arm_angle),
      escapeCsv(s.arm_angle_degrees),
      escapeCsv((s.shot_type ?? "").trim()),
      escapeCsv(s.one_hand === 1 ? "1" : "0"),
    ];

    return cells.join(",");
  });

  return [STATS_MASTER_HEADERS.join(","), ...rows].join("\n");
}

/** @deprecated Use buildStatsMasterCsv — kept for call sites migrating to full schema. */
export function shotsToLeanCsv(game: Game, shots: Shot[], rosters: Record<string, Player[]>, metricFlow: unknown): string {
  return buildStatsMasterCsv(game, shots, rosters, metricFlow);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function incompleteShots(shots: Shot[]): { idx: number; missing: string[] }[] {
  const issues: { idx: number; missing: string[] }[] = [];
  shots.forEach((s, idx) => {
    if (s.act === "TO") return;
    if (isShotManualTrackingComplete(s)) return;
    const missing: string[] = [];
    if (s.x === null || s.y === null) missing.push("location");
    if (!isDefenderChoiceComplete(s)) missing.push("closest_defender");
    if (!isSecondAssistChoiceComplete(s)) missing.push("second_assist");
    if (s.shot_clock === null || s.shot_clock === undefined) missing.push("shot_clock");
    if (s.bounce_shot === null) missing.push("bounce_shot");
    if (s.arm_angle === null || s.arm_angle === undefined) missing.push("arm_angle");
    if (s.net_x === null) missing.push("net_location");
    if (missing.length > 0) issues.push({ idx, missing });
  });
  return issues;
}
