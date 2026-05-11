/**
 * Single-letter / coded CSV fields aligned with Stats Master + metric-flow semantics.
 */

import type { Shot } from "./types";

const LOC_ALIAS: Record<string, string> = {
  D: "D",
  DOORSTEP: "D",
  H: "H",
  HOLE: "H",
  M: "M",
  MIDDLE: "M",
  LW: "LW",
  LEFT_WING: "LW",
  LP: "LP",
  LEFT_PIPE: "LP",
  RW: "RW",
  RIGHT_WING: "RW",
  RP: "RP",
  RIGHT_PIPE: "RP",
};

export function encodeShotLocationFromCodes(codes: string[] | null | undefined): string {
  if (!codes || codes.length === 0) return "";
  if (codes.some((c) => c === "GOAL_2PT" || c === "MISS_2PT" || c === "SHOT_2PT")) return "2";
  if (codes.some((c) => c.includes("DOORSTEP"))) return "D";
  if (codes.some((c) => c.includes("HOLE") && !c.includes("DOORSTEP"))) return "H";
  if (codes.some((c) => c === "GOAL_MIDDLE" || c === "SHOT_MIDDLE")) return "M";
  if (codes.some((c) => c.includes("LEFT_WING"))) return "LW";
  if (codes.some((c) => c.includes("LEFT_PIPE"))) return "LP";
  if (codes.some((c) => c.includes("RIGHT_WING"))) return "RW";
  if (codes.some((c) => c.includes("RIGHT_PIPE"))) return "RP";
  return "";
}

/** Normalize Champion `details.shotLocation` text to D/H/M/LW/LP/RW/RP/2. */
export function normalizeShotLocationString(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "";
  const s = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if (s === "2" || s.includes("2PT") || s === "TWO") return "2";
  const key = s.replace(/^[^A-Z0-9]+/, "");
  if (LOC_ALIAS[key]) return LOC_ALIAS[key];
  if (key.includes("DOOR")) return "D";
  if (key.includes("HOLE")) return "H";
  if (key.includes("MIDDLE")) return "M";
  if (key.includes("LEFT") && key.includes("WING")) return "LW";
  if (key.includes("LEFT") && key.includes("PIPE")) return "LP";
  if (key.includes("RIGHT") && key.includes("WING")) return "RW";
  if (key.includes("RIGHT") && key.includes("PIPE")) return "RP";
  return raw.trim();
}

export function encodeSituationFromCodes(codes: string[] | null | undefined): string {
  if (!codes || codes.length === 0) return "";
  if (codes.some((c) => c.includes("SUBSTITUTION"))) return "SUB";
  if (codes.some((c) => c.includes("SETTLED"))) return "SETTLED";
  if (codes.some((c) => c.includes("FAST_BREAK"))) return "FB";
  return "";
}

export function encodeShotResultLetter(s: Shot): string {
  if (s.act !== "SH" || !s.result) return "";
  if (s.result === "GOAL") return "G";
  const mc = s.metric_codes ?? [];

  if (s.result === "SAVE") {
    if (mc.includes("SHOT_MESSY")) return "M";
    if (mc.includes("SHOT_CLEAN_SAVE") || mc.includes("SAVE_CLEAN")) return "C";
    return "C";
  }

  if (mc.includes("SHOT_OFF")) return "O";
  if (mc.includes("SHOT_PIPE")) return "P";
  if (mc.includes("SHOT_MESSY")) return "M";
  if (mc.includes("SHOT_CLEAN_SAVE")) return "C";
  return "O";
}

export function situationForExport(s: Shot): string {
  const fromFlow = encodeSituationFromCodes(s.metric_codes);
  if (fromFlow) return fromFlow;
  return s.situation ?? "";
}

export function shotLocationForExport(s: Shot): string {
  const fromFlow = encodeShotLocationFromCodes(s.metric_codes);
  if (fromFlow) return fromFlow;
  const norm = normalizeShotLocationString(s.shot_location);
  return norm || "";
}

export function reboundForExport(s: Shot): string {
  if (s.rebound === "O" || s.rebound === "D") return s.rebound;
  if (s.rebound === true) return "O";
  if (s.rebound === false) return "";
  return "";
}
