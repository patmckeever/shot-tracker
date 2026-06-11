/**
 * PLL shot-location xG model (logistic) for live field hover preview.
 * Coefficients match the Stats Master spreadsheet formula.
 */

import {
  PLL_GOAL_CENTER_X,
  PLL_GOAL_LINE_Y,
  pllShotDistanceYards,
} from "./shotGraphicDistance.js";

const PLL_SCALE_PER_YARD = 40.29;
const PLL_CALIBRATION = 0.88;
const YARDS_PER_PIXEL = PLL_CALIBRATION / PLL_SCALE_PER_YARD;

const GOAL_LATERAL_CENTER_Y = 30;
const LEFT_PIPE_Y = 29;
const RIGHT_PIPE_Y = 31;
const PIPE_TO_PIPE_YARDS = 2;

export interface ShotXgContext {
  shotHand: "L" | "R" | null;
  firstAssistFlag: 0 | 1;
  secondAssistFlag: 0 | 1;
}

/** Goal-mouth angle (degrees) from PLL graphic pixel coords; null when depth ≤ 0. */
function visibleShotAngleDeg(px: number, py: number): number | null {
  const depthYards = Math.abs(py - PLL_GOAL_LINE_Y) * YARDS_PER_PIXEL;
  if (depthYards <= 0) return null;
  const lateralYards = GOAL_LATERAL_CENTER_Y + (px - PLL_GOAL_CENTER_X) * YARDS_PER_PIXEL;
  const fromLeftPipe = Math.hypot(depthYards, lateralYards - LEFT_PIPE_Y);
  const fromRightPipe = Math.hypot(depthYards, lateralYards - RIGHT_PIPE_Y);
  const cosTheta =
    (fromLeftPipe ** 2 + fromRightPipe ** 2 - PIPE_TO_PIPE_YARDS ** 2) /
    (2 * fromLeftPipe * fromRightPipe);
  if (!Number.isFinite(cosTheta)) return null;
  return (Math.acos(Math.max(-1, Math.min(1, cosTheta))) * 180) / Math.PI;
}

function isHandInside(px: number, shotHand: "L" | "R" | null): 0 | 1 {
  if (shotHand === "L" && px <= 1053) return 1;
  if (shotHand === "R" && px >= 953) return 1;
  return 0;
}

/** Expected goal probability for a shot at graphic pixel (x, y). */
export function computeShotXg(
  x: number,
  y: number,
  ctx: ShotXgContext,
): number {
  const shotDistance = pllShotDistanceYards(x, y);
  const angleDeg = visibleShotAngleDeg(x, y);
  const ySide = y < PLL_GOAL_LINE_Y ? -1 : 1;
  const angleTerm = angleDeg === null ? 0 : (ySide * angleDeg - 9.92090296) / 6.77367017;

  const logit =
    -1.02102827168216 +
    -0.30840709 * ((shotDistance - 10.35452224) / 4.493208) +
    0.28514388 * angleTerm +
    0.11307827 * ((ctx.firstAssistFlag - 0.48477089) / 0.49976802) +
    0.08536588 * ((ctx.secondAssistFlag - 0.14858491) / 0.35567883) +
    0.07022085 * ((isHandInside(x, ctx.shotHand) - 0.63113208) / 0.48249806);

  return 1 / (1 + Math.exp(-logit));
}
