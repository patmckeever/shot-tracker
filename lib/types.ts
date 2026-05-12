/**
 * Single source of truth for data shape.
 *
 * Three core entities:
 *   - Game:    metadata about a match (teams, week, date, venue)
 *   - Player:  one player's roster info (jersey, position, hand, headshot)
 *   - Shot:    one shot event, combining Champion Data passthrough + tracker inputs
 *
 * The Shot type is the unit of work. Every other type exists to support it.
 *
 * Field origin convention (used in JSDoc on each Shot field):
 *   @cd      = Champion Data passthrough (filled when the game loads)
 *   @pll     = PLL Stats API enrichment (joined by player ID after game loads)
 *   @tracker = filled by the human in the app
 *   @derived = computed in the post-export transform step
 */

// ─────────────────────────────────────────────────────────────────────────────
// Game + roster
// ─────────────────────────────────────────────────────────────────────────────

export interface Game {
  game_id: string;          // Champion Data match ID
  game_number: number;      // sequential within season
  season: number;
  week: number;
  date: string;             // ISO date
  market: string;           // venue/market slug, e.g. "denver_2026"
  home_team: string;        // 3-letter abbreviation
  away_team: string;
  // Which end each team attacks per quarter — needed for field render flip
  attack_directions?: Record<number, { [team: string]: "N" | "S" }>;
}

export interface Player {
  player_id: string;        // PLL Stats API officialId
  name: string;
  number: number;
  team: string;             // 3-letter abbreviation
  position: string;         // A | M | SSDM | LSM | D | FO | G
  handedness: "L" | "R" | null;
  country: string | null;
  headshot_url: string | null;
}

export interface Roster {
  team: string;
  players: Player[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Shot
// ─────────────────────────────────────────────────────────────────────────────

export type ShotResult = "GOAL" | "SAVE" | "MISS";
/** Release angle bucket — 60° bands: under [0,60), side [60,120), over [120,180] */
export type ArmAngleBucket = "underhand" | "sidearm" | "overhand";

export interface Shot {
  // ── Identity ────────────────────────────────────────────────────────────
  /** @cd */ shot_id: string;        // unique within game
  /** @cd */ unique_id: string;      // unique across all PLL data
  /** @cd */ game_id: string;
  /** @cd */ game_number: number;
  /** @cd */ qtr: 1 | 2 | 3 | 4 | 5; // 5 = OT
  /** @cd */ game_clock: string;     // "MM:SS"

  // ── Teams + players ─────────────────────────────────────────────────────
  /** @cd */ team: string;           // offensive team abbreviation
  /** @cd */ opposing_team: string;
  /** @cd */ player: string;         // shooter name (for legacy CSV compat)
  /** @cd */ shooter_id: string;
  /** @cd */ first_assist: string | null;
  /** @cd */ first_assist_id: string | null;
  /** @cd */ first_assist_flag: 0 | 1;
  /** @cd */ goalie: string;
  /** @cd */ goalie_id: string;

  // ── Champion Data event fields ──────────────────────────────────────────
  /** @cd */ act: string;            // "SH" | "TO"
  /** @cd */ result: ShotResult | null; // null for TO rows
  /** @cd */ points: 0 | 1 | 2;
  /** @cd */ goale_on_pipe_flag: 0 | 1;
  /** @cd */ goal_time: string | null;
  /** @cd */ time_spent: number | null;

  // ── Possession context ──────────────────────────────────────────────────
  /** @cd */ possession_counter: number;
  /** @cd */ unique_possession_id: string;
  /** @cd */ possession_start: string;
  /** @cd */ possession_end: string | null;
  /** @cd */ possession_ending_event_flag: 0 | 1;
  /** @cd */ prev_possession_ended_by: string | null;
  /** @cd */ previous_possession_end: string | null;
  /** @cd */ previous_possession_situation: string | null;
  /** @cd */ previous_possession_goalie: string | null;

  // ── PLL Stats enrichment ────────────────────────────────────────────────
  /** @pll */ shooter_position: string;
  /** @cd Champion PBP `details.shotHand` only (CSV `shot_hand`); not roster strong hand. */
  shooter_dominant_hand: "L" | "R" | null;
  /** @pll */ goalie_hand: "L" | "R" | null;
  /** @pll */ passer_hand: "L" | "R" | null;            // joined via first_assist
  /** @pll */ nationality: string | null;

  // ── Tracker inputs ──────────────────────────────────────────────────────
  /** @tracker */ x: number | null;                  // PLL graphic pixel X (1–2000), left→right
  /** @tracker */ y: number | null;                  // PLL graphic pixel Y (1–2149); league anchors (e.g. goal line y=900), not raw SVG viewBox y
  /** @tracker */ closest_defender: string | null;   // player name
  /** @tracker */ closest_defender_id: string | null;
  /** @tracker */ second_assist: string | null;
  /** @tracker */ second_assist_id: string | null;
  /** @tracker */ shot_clock: number | null;         // seconds remaining
  /** @tracker */ bounce_shot: boolean | null;       // null = unanswered
  /** @tracker */ arm_angle: ArmAngleBucket | null;
  /** @tracker */ arm_angle_degrees: number | null;  // 0-180
  /** @tracker */ net_x: number | null;              // inches, goal-mouth-relative
  /** @tracker */ net_y: number | null;

  // ── Tracker inputs — extra categorical fields ──────────────────────────
  // (added based on team confirmation of which "unclear" columns are tracker-input)
  /** @tracker */ situation: string | null;
  /** @tracker */ dodge_action: string | null;
  /** @tracker */ dodge_location: string | null;
  /** @tracker */ shot_location: string | null;
  /** @tracker "" = Normal (blank in export); ATW/BTB/BH/TTL for trick shot types */
  shot_type: "" | "ATW" | "BTB" | "BH" | "TTL";
  /** @tracker 1 = one-handed, 0 = not (defaults to 0); not part of yellow “in progress” UX */
  one_hand: 0 | 1;
  /** @tracker */ ct_type: string | null;
  /** @tracker */ ct_ro_bl_player: string | null;
  /** @tracker | @flow offensive/defensive board: "O" | "D", or legacy boolean */
  /** @tracker */ rebound: boolean | "O" | "D" | null;
  /** @tracker */ strong_or_wrong: string | null;
  /** @tracker */ big_chance: boolean | null;
  /** @tracker */ quality: string | null;
  /** @tracker */ down: string | null;

  /** @cd All Champion metric codes for this trx id (metric flow), when available */
  metric_codes?: string[] | null;
}

/**
 * The lean shape the app emits as CSV.
 * The post-export transform script reads this and produces the full 73-col
 * Stats Master row by computing distances, xG, possession derivatives, etc.
 */
export type LeanCsvRow = Shot;

/** Stored in `closest_defender_id` / `second_assist_id` when the tracker confirms no player for that role */
export const TRACKER_NO_PLAYER_ID = "__TRACKER_NONE__" as const;

export function isTrackerNoPlayerId(id: string | null | undefined): boolean {
  return id === TRACKER_NO_PLAYER_ID;
}

/** True once user chose a defender or explicitly chose none */
export function isDefenderChoiceComplete(s: Shot): boolean {
  const id = s.closest_defender_id;
  return id != null && id !== "";
}

/** No primary assist → N/A. Otherwise user must pick an assist player or explicitly none */
export function isSecondAssistChoiceComplete(s: Shot): boolean {
  if (!s.first_assist) return true;
  const id = s.second_assist_id;
  return id != null && id !== "";
}

/** True when every tracker field for a shot (`act === "SH"`) row is answered. Turnovers excluded. */
export function isShotManualTrackingComplete(s: Shot): boolean {
  if (s.act === "TO") return false;
  if (s.x === null || s.y === null) return false;
  if (!isDefenderChoiceComplete(s)) return false;
  if (!isSecondAssistChoiceComplete(s)) return false;
  if (s.shot_clock === null) return false;
  if (s.bounce_shot === null) return false;
  if (s.arm_angle === null) return false;
  if (s.net_x === null) return false;
  return true;
}

/** True if any manual tracker fields that drive "meaningful progress" / yellow state are filled (excludes shot_type + one_hand). */
export function hasMeaningfulManualProgress(s: Shot): boolean {
  if (s.act === "TO") return false;
  return (
    s.x !== null ||
    s.shot_clock !== null ||
    s.bounce_shot !== null ||
    s.arm_angle !== null ||
    s.net_x !== null ||
    isDefenderChoiceComplete(s) ||
    (s.first_assist ? isSecondAssistChoiceComplete(s) : false)
  );
}
