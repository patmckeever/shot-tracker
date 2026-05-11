/**
 * Derived CSV fields aligned with transform/transform.py derive().
 */

import type { Shot } from "./types.js";
import { encodeShotResultLetter } from "./csvFieldEncoding.js";

export function deriveSaveSogFlags(s: Shot) {
  const letter = s.act === "SH" && s.result ? encodeShotResultLetter(s) : "";
  const resultUpper = (() => {
    if (letter === "G") return "GOAL";
    if (letter === "C" || letter === "M") return "SAVE";
    if (letter === "O" || letter === "P") return "MISS";
    if (s.result === "GOAL") return "GOAL";
    if (s.result === "SAVE") return "SAVE";
    if (s.result === "MISS") return "MISS";
    return "";
  })();

  const save = resultUpper === "SAVE" || letter === "C" || letter === "M" ? 1 : 0;
  const shot_faced_by_goalie =
    resultUpper === "SAVE" || resultUpper === "GOAL" || letter === "G" || letter === "C" || letter === "M" ? 1 : 0;
  const sog = shot_faced_by_goalie;

  const one_point_shot_flag = s.result === "GOAL" && s.points === 1 ? 1 : 0;
  const second_assist_flag = (s.second_assist ?? "").trim() ? 1 : 0;

  return { save, shot_faced_by_goalie, sog, one_point_shot_flag, second_assist_flag, resultUpper, letter };
}

export function passerShooterFlag(s: Shot): number {
  const fa = (s.first_assist ?? "").trim();
  const pl = (s.player ?? "").trim();
  return fa !== "" && fa === pl ? 1 : 0;
}

export function pointsForCsv(s: Shot): number {
  if (s.result === "GOAL" && (s.points === 1 || s.points === 2)) return s.points;
  return 0;
}

export function strongOrWrongCsv(s: Shot, rosterHand: "L" | "R" | null): string {
  const shotHand = s.shooter_dominant_hand;
  if (!shotHand || !rosterHand) return "";
  return shotHand === rosterHand ? "Strong" : "Wrong";
}
