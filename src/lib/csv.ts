/**
 * CSV export — produces the lean Stats Master format.
 *
 * Column order matches the master schema. Empty strings for null values.
 * The post-export transform script (transform/transform.py) reads this file
 * and adds the @derived columns to produce the final 73-column row.
 *
 * If you change the column list, also update transform/transform.py to match.
 */

import type { Shot } from "../../lib/types";
import {
  isDefenderChoiceComplete,
  isSecondAssistChoiceComplete,
  isTrackerNoPlayerId,
} from "../../lib/types";

// Order MUST match the existing Stats Master sheet's column order so that the
// CSV can be eyeballed against it during QC. The transform script adds derived
// columns afterward — this file produces only the columns the app is responsible for.
const LEAN_COLUMNS: (keyof Shot)[] = [
  // Identity
  "game_number", "qtr", "unique_id", "game_id",
  // Teams + players
  "team", "act", "player",
  // Tracker categorical (extra columns to be confirmed)
  "situation", "dodge_action", "dodge_location",
  // Shooter / shot fields
  "shooter_dominant_hand",     // = shot_hand in the legacy CSV header
  "result", "rebound",
  "first_assist", "second_assist",
  "shot_location",
  "ct_type", "ct_ro_bl_player",
  // Coordinates
  "x", "y",
  // shot_distance is @derived — handled in transform.py
  "shot_clock", "closest_defender", "opposing_team", "goalie",
  // Game metadata
  "qtr",  // duplicated in legacy schema? Confirm — leave for now
  // Possession context (passthrough)
  "first_assist_flag",
  "possession_counter", "possession_ending_event_flag",
  "prev_possession_ended_by", "previous_possession_end", "previous_possession_situation",
  "possession_start", "possession_end", "unique_possession_id",
  "previous_possession_goalie",
  // PLL Stats enrichment
  "shooter_position",
  "big_chance",
  "passer_hand", "shooter_dominant_hand", "goalie_hand",
  // Time
  "time_spent", "goal_time",
  // Champion Data flags
  "goale_on_pipe_flag",
  // Tracker - new fields
  "bounce_shot",
  "arm_angle", "arm_angle_degrees",
  "net_x", "net_y",
  // Categorical (continued)
  "strong_or_wrong", "quality", "down",
  "nationality",
];

// Map field name → CSV header name (handle differences like shooter_dominant_hand → shot_hand)
const HEADER_OVERRIDE: Partial<Record<keyof Shot, string>> = {
  shooter_dominant_hand: "shot_hand",
};

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function shotsToLeanCsv(shots: Shot[]): string {
  const headers = LEAN_COLUMNS.map((k) => HEADER_OVERRIDE[k] ?? k);
  const rows = shots.map((raw) => {
    const s: Shot = {
      ...raw,
      closest_defender_id: isTrackerNoPlayerId(raw.closest_defender_id) ? null : raw.closest_defender_id,
      second_assist_id: isTrackerNoPlayerId(raw.second_assist_id) ? null : raw.second_assist_id,
    };
    return LEAN_COLUMNS.map((k) => {
      const v = s[k];
      if (typeof v === "boolean") return v ? "1" : "0";
      return escapeCsv(v);
    }).join(",");
  });
  return [headers.join(","), ...rows].join("\n");
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

/**
 * Returns a list of incomplete shot indices and which fields they're missing.
 * Used to show a "X shots incomplete" warning before exporting.
 */
export function incompleteShots(shots: Shot[]): { idx: number; missing: string[] }[] {
  const issues: { idx: number; missing: string[] }[] = [];
  shots.forEach((s, idx) => {
    const missing: string[] = [];
    if (s.x === null || s.y === null) missing.push("location");
    if (!isDefenderChoiceComplete(s)) missing.push("closest_defender");
    if (!isSecondAssistChoiceComplete(s)) missing.push("second_assist");
    if (s.shot_clock === null || s.shot_clock === undefined) missing.push("shot_clock");
    if (s.arm_angle === null || s.arm_angle === undefined) missing.push("arm_angle");
    if (missing.length > 0) issues.push({ idx, missing });
  });
  return issues;
}
