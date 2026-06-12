/**
 * WLL roster helpers — headshots, team detection, position sort orders.
 */

import type { Player } from "./types.js";

export const WLL_TEAM_CODES = new Set(["WCHA", "WCHR", "WGUA", "WPLM"]);

export function isWllTeamCode(code: string): boolean {
  return WLL_TEAM_CODES.has(code.toUpperCase().trim());
}

export function isWllGame(homeTeam: string, awayTeam: string): boolean {
  return isWllTeamCode(homeTeam) || isWllTeamCode(awayTeam);
}

export function wllPlayerSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function wllHeadshotUrl(name: string, season: number): string {
  return `https://img.premierlacrosseleague.com/Players/${season}/${wllPlayerSlug(name)}.webp`;
}

/** 10v10 regular season (D1, LSM, SSDM1, …). */
export const WLL_REGULAR_DEFENDER_ORDER = [
  "D1",
  "D2",
  "D3",
  "LSM",
  "SSDM1",
  "SSDM2",
  "M1",
  "M2",
  "M3",
  "FO",
  "A1",
  "A2",
  "A3",
  "GK",
  "SUB",
] as const;

export const WLL_REGULAR_SECOND_ASSIST_ORDER = [
  "A1",
  "A2",
  "A3",
  "M1",
  "M2",
  "M3",
  "SSDM1",
  "SSDM2",
  "FO",
  "LSM",
  "D1",
  "D2",
  "D3",
  "GK",
  "SUB",
] as const;

/** Championship Series / sixes (A1–A3, M1–M2, GK). */
export const WLL_SIXES_DEFENDER_ORDER = ["M1", "M2", "A1", "A2", "A3", "GK", "SUB"] as const;

export const WLL_SIXES_SECOND_ASSIST_ORDER = ["A1", "A2", "A3", "M1", "M2", "GK", "SUB"] as const;

export type WllFieldFormat = "regular" | "sixes";

export function wllFieldFormat(players: Player[]): WllFieldFormat {
  const hasRegularDefense = players.some((p) => {
    const c = p.position.toUpperCase().trim();
    return /^D\d/.test(c) || c === "LSM" || /^SSDM\d/.test(c);
  });
  return hasRegularDefense ? "regular" : "sixes";
}

export function wllPositionRank(code: string, order: readonly string[]): number {
  const c = code.trim().toUpperCase();
  const idx = (order as readonly string[]).indexOf(c);
  if (idx >= 0) return idx;
  if (c.startsWith("GK") || c === "G") {
    const gk = (order as readonly string[]).indexOf("GK");
    if (gk >= 0) return gk;
  }
  return 100 + c.charCodeAt(0);
}
