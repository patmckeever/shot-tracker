/** PLL shot graphic pixel space → yards from goal mouth (same calibration as tracker UI). */

export const PLL_GOAL_CENTER_X = 1000;
export const PLL_GOAL_LINE_Y = 900;
const PLL_SCALE_PER_YARD = 40.29;
const PLL_CALIBRATION = 0.88;

function pllRawToYards(rawDist: number): number {
  return (rawDist / PLL_SCALE_PER_YARD) * PLL_CALIBRATION;
}

/** Distance from shot (x,y) to goal center (1000, 900), in calibrated yards */
export function pllShotDistanceYards(px: number, py: number): number {
  return pllRawToYards(Math.hypot(px - PLL_GOAL_CENTER_X, py - PLL_GOAL_LINE_Y));
}
