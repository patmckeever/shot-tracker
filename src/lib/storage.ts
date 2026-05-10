/**
 * localStorage wrapper.
 *
 * Per (game_id, tracker_email) so:
 *   - Closing and reopening a tab restores progress
 *   - Two trackers using the same machine can stay separated
 *   - Switching games doesn't lose work on previous games
 *
 * The tracker email comes from the auth layer; for now we use a configurable
 * "tracker name" stored in localStorage itself. Replace with real auth later.
 */

import type { Shot } from "../../lib/types";

const TRACKER_NAME_KEY = "pll_tracker_name";
const SHOTS_KEY_PREFIX = "pll_shots:";
const STATE_KEY_PREFIX = "pll_state:";

export function getTrackerName(): string {
  return localStorage.getItem(TRACKER_NAME_KEY) ?? "anonymous";
}
export function setTrackerName(name: string) {
  localStorage.setItem(TRACKER_NAME_KEY, name);
}

function shotsKey(gameId: string, tracker: string) {
  return `${SHOTS_KEY_PREFIX}${tracker}:${gameId}`;
}
function stateKey(gameId: string, tracker: string) {
  return `${STATE_KEY_PREFIX}${tracker}:${gameId}`;
}

export interface SessionState {
  active_idx: number;
  last_modified: number;
}

export const Storage = {
  saveShots(gameId: string, shots: Shot[]) {
    const t = getTrackerName();
    localStorage.setItem(shotsKey(gameId, t), JSON.stringify(shots));
  },

  loadShots(gameId: string): Shot[] | null {
    const t = getTrackerName();
    const raw = localStorage.getItem(shotsKey(gameId, t));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  saveState(gameId: string, state: SessionState) {
    const t = getTrackerName();
    localStorage.setItem(stateKey(gameId, t), JSON.stringify(state));
  },

  loadState(gameId: string): SessionState | null {
    const t = getTrackerName();
    const raw = localStorage.getItem(stateKey(gameId, t));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  /**
   * Clear all data for a game — use after successful CSV export + Slack drop
   * to free up localStorage and indicate "this game is done".
   */
  clearGame(gameId: string) {
    const t = getTrackerName();
    localStorage.removeItem(shotsKey(gameId, t));
    localStorage.removeItem(stateKey(gameId, t));
  },

  /**
   * Export a snapshot the tracker can save to disk as a backup.
   * Useful when switching machines mid-game or recovering from a browser crash.
   */
  exportBackup(gameId: string): string | null {
    const t = getTrackerName();
    const shots = localStorage.getItem(shotsKey(gameId, t));
    const state = localStorage.getItem(stateKey(gameId, t));
    if (!shots) return null;
    return JSON.stringify({ tracker: t, game_id: gameId, shots: JSON.parse(shots), state: state ? JSON.parse(state) : null });
  },

  importBackup(payload: string) {
    const parsed = JSON.parse(payload);
    setTrackerName(parsed.tracker);
    if (parsed.shots) localStorage.setItem(shotsKey(parsed.game_id, parsed.tracker), JSON.stringify(parsed.shots));
    if (parsed.state) localStorage.setItem(stateKey(parsed.game_id, parsed.tracker), JSON.stringify(parsed.state));
  },
};
