/**
 * Champion metric flow — merge /shots tracker rows with TO rows and flow-derived rebound / CT fields.
 */

import type { Game, Shot } from "./types.js";
import { encodeShotResultLetter } from "./csvFieldEncoding.js";

function qtrFromPeriod(period: number): 1 | 2 | 3 | 4 | 5 {
  if (period <= 1) return 1;
  if (period === 2) return 2;
  if (period === 3) return 3;
  if (period === 4) return 4;
  return 5;
}

/** Collect metric codes from a single flow entry (handles `metric` as object with `code`). */
export function collectFlowEntryCodes(entry: Record<string, unknown>): string[] {
  const m = entry.metric;
  if (m && typeof m === "object" && "code" in m) {
    const c = (m as { code?: string }).code;
    if (typeof c === "string" && c) return [c];
  }
  return [];
}

function squadCode(entry: Record<string, unknown>): string {
  const s = entry.squad as { code?: string } | undefined;
  return (s?.code ?? "").toUpperCase().trim();
}

function playerFullname(entry: Record<string, unknown>): string {
  const p = entry.player as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== "object" || Object.keys(p).length === 0) return "";
  const fn = p.fullname ?? p.displayName;
  return typeof fn === "string" ? fn.trim() : "";
}

export function extractFlowArray(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { flow?: unknown[] };
  if (!Array.isArray(r.flow)) return [];
  return r.flow.filter((x): x is Record<string, unknown> => x != null && typeof x === "object") as Record<
    string,
    unknown
  >[];
}

function orderedMetricIds(flow: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const e of flow) {
    if (e.id == null) continue;
    const sid = String(e.id);
    if (seen.has(sid)) continue;
    seen.add(sid);
    ids.push(sid);
  }
  return ids;
}

function allCodesForId(flow: Record<string, unknown>[], id: string): string[] {
  const codes: string[] = [];
  for (const e of flow) {
    if (String(e.id) !== id) continue;
    codes.push(...collectFlowEntryCodes(e));
  }
  return codes;
}

function opposingFrom(offensive: string, home: string, away: string): string {
  const o = offensive.toUpperCase();
  const h = home.toUpperCase();
  const a = away.toUpperCase();
  if (!o || !h || !a) return "";
  if (o === h) return a;
  if (o === a) return h;
  return "";
}

function syntheticToRow(game: Game, id: string, qtr: 1 | 2 | 3 | 4 | 5, clock: string, team: string, player: string): Shot {
  const opp = opposingFrom(team, game.home_team, game.away_team);
  return {
    shot_id: `${game.game_id}_TO_${id}`,
    unique_id: id,
    game_id: game.game_id,
    game_number: game.game_number,
    qtr,
    game_clock: clock,
    team,
    opposing_team: opp,
    player: player === "" ? "Team" : player,
    shooter_id: "",
    first_assist: null,
    first_assist_id: null,
    first_assist_flag: 0,
    goalie: "",
    goalie_id: "",
    act: "TO",
    result: null,
    points: 0,
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
    shooter_dominant_hand: null,
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
    shot_location: null,
    shot_type: "",
    one_hand: 0,
    ct_type: null,
    ct_ro_bl_player: null,
    rebound: null,
    strong_or_wrong: null,
    big_chance: null,
    quality: null,
    down: null,
    metric_codes: null,
  };
}

function isTurnoverOnly(codes: string[]): boolean {
  return codes.includes("TURNOVER") && !codes.includes("TURNOVER_CAUSED");
}

function isShotFamily(codes: string[]): boolean {
  return codes.some(
    (c) =>
      c.startsWith("GOAL_") ||
      (c.startsWith("SHOT_") && !c.startsWith("SHOT_ALLOWED")) ||
      c.startsWith("MISS_") ||
      c === "SAVE" ||
      c.startsWith("SAVE_"),
  );
}

/**
 * Merge tracker shots with metric flow: correct order, TO rows, rebound (O/D), ct_ro_bl from caused turnovers.
 * When flow is empty, returns shots sorted by quarter and clock.
 */
export function mergeShotsWithMetricFlow(game: Game, shots: Shot[], flowRaw: unknown): Shot[] {
  const flow = extractFlowArray(flowRaw);

  const byTrx = new Map<string, Shot>();
  for (const s of shots) {
    byTrx.set(String(s.unique_id), { ...s });
  }

  if (flow.length === 0) {
    return sortShotsChronologically([...shots.map((s) => ({ ...s }))]);
  }

  const ids = orderedMetricIds(flow);
  const merged: Shot[] = [];
  let lastAppendedShot: Shot | null = null;

  for (const id of ids) {
    const id_metrics = flow.filter((e) => String(e.id) === id);
    if (id_metrics.length === 0) continue;
    const codes = allCodesForId(flow, id);
    const first = id_metrics[0]!;
    const period = typeof first.period === "number" ? first.period : Number(first.period) || 1;
    const qtr = qtrFromPeriod(period);
    const clock = (first.periodTime as string) ?? (first.time as string) ?? "";
    const squad = squadCode(first);

    if (lastAppendedShot && lastAppendedShot.act === "SH" && lastAppendedShot.result && encodeShotResultLetter(lastAppendedShot) !== "G") {
      const shotTeam = lastAppendedShot.team.toUpperCase();
      if (squad && shotTeam) {
        lastAppendedShot.rebound = squad === shotTeam ? "O" : "D";
      }
    }

    if (codes.includes("TURNOVER_CAUSED")) {
      const name = playerFullname(first);
      const causer = name === "" ? "?" : name;
      const target = merged[merged.length - 1] ?? null;
      if (target && !target.ct_ro_bl_player) {
        target.ct_ro_bl_player = causer;
      }
      if (!isTurnoverOnly(codes) && !isShotFamily(codes)) continue;
    }

    if (isTurnoverOnly(codes)) {
      const pName = playerFullname(first);
      const toRow = syntheticToRow(game, id, qtr, clock, squad, pName);
      merged.push(toRow);
      lastAppendedShot = toRow;
      continue;
    }

    if (isShotFamily(codes)) {
      const shot = byTrx.get(id);
      if (shot) {
        const clone = {
          ...shot,
          qtr,
          game_clock: clock || shot.game_clock,
          metric_codes: [...new Set([...(shot.metric_codes ?? []), ...codes])],
        };
        merged.push(clone);
        lastAppendedShot = clone;
      }
    }
  }

  const inMerged = new Set(merged.filter((r) => r.act === "SH").map((r) => String(r.unique_id)));
  const extras: Shot[] = [];
  for (const s of shots) {
    if (!inMerged.has(String(s.unique_id))) {
      extras.push({ ...s });
    }
  }

  return sortShotsChronologically([...merged, ...extras]);
}

/** In-game order: quarter ascending, game clock ascending, then trx id. */
export function sortShotsChronologically(list: Shot[]): Shot[] {
  return [...list].sort((a, b) => {
    if (a.qtr !== b.qtr) return a.qtr - b.qtr;
    const ca = parseClock(a.game_clock);
    const cb = parseClock(b.game_clock);
    if (ca !== cb) return ca - cb;
    const na = Number(a.unique_id);
    const nb = Number(b.unique_id);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a.unique_id).localeCompare(String(b.unique_id), undefined, { numeric: true });
  });
}

function parseClock(clock: string): number {
  const t = clock.trim();
  const parts = t.split(":");
  if (parts.length !== 2) return 0;
  const m = Number(parts[0]);
  const s = Number(parts[1]);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return 0;
  return m * 60 + s;
}
