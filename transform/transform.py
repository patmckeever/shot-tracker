"""
transform.py - Optional post-pass for exported tracker CSV.

The React app (`src/lib/csv.ts`) now emits the full Stats Master column set in
one step (including `shot_distance` from the PLL graphic pixel→yards formula).
Use this script only when you need to **recompute** yard geometry from x/y
treated as field yards, fill xG/xSv placeholders, or batch-derive older lean
exports.

Historically this read a "lean" CSV and produced a 73-column row. MASTER_COLUMNS
below matches `buildStatsMasterCsv` in the app (including trailing
bounce_shot → net_x → net_y → arm_angle → arm_angle_degrees).

Reads the CSV emitted by the shot tracker app and can add / overwrite @derived columns:

  - Distance + angle math (shot_distance, distance_gle, distance_from_rp/lp,
    distance_pipe_to_pipe, visible_shot_angle, goalie_arc_angle, is_hand_inside)
  - Possession derivatives (previous_possession_shot_clock_time_remaining,
    shot_clock_reset, second_chance)
  - Result-derived flags (save, shot_faced_by_goalie, sog, one_point_shot_flag,
    second_assist_flag)
  - PasserShooter (= 1 when first_assist == player)
  - xG models (xg_old, xG, xSv) — load saved model artifacts

Usage:
    python transform.py shots_317377939.csv

Outputs to:
    shots_317377939_master.csv

This is the place to make analytics changes. The React app stays out of model
logic so it never needs a redeploy when xG gets retrained.

Note: The tracker app records shot (x, y) as pixel coordinates on the PLL
2000×2149 shot-location graphic (cropped), not yards. Yard-based columns from derive()
(shot_distance, visible_shot_angle, etc.) need a pixel→field conversion before
they match the historical Stats Master semantics.
"""

import sys
import csv
import math
import os
from pathlib import Path

# Field reference points (in yards from goal line center)
GOAL_X = 0
GOAL_Y_MIDLINE = 30
LEFT_PIPE_Y = 30 - 1  # 6ft / 2 = 1yd
RIGHT_PIPE_Y = 30 + 1


def shot_distance(x: float, y: float) -> float:
    """Yards from the center of the goal mouth."""
    return math.sqrt(x ** 2 + (y - GOAL_Y_MIDLINE) ** 2)


def distance_to_pipe(x: float, y: float, pipe_y: float) -> float:
    return math.sqrt(x ** 2 + (y - pipe_y) ** 2)


def visible_shot_angle(x: float, y: float) -> float:
    """Angle subtended by the goal mouth from the shooter's position, in degrees."""
    if x <= 0:
        return 0.0
    a = distance_to_pipe(x, y, LEFT_PIPE_Y)
    b = distance_to_pipe(x, y, RIGHT_PIPE_Y)
    c = 2.0  # pipe-to-pipe distance, yards
    # Law of cosines
    cos_theta = (a ** 2 + b ** 2 - c ** 2) / (2 * a * b)
    cos_theta = max(-1.0, min(1.0, cos_theta))
    return math.degrees(math.acos(cos_theta))


def derive(row: dict) -> dict:
    """Add all @derived columns to a single shot row."""
    out = dict(row)

    try:
        x = float(row.get("x") or 0)
        y = float(row.get("y") or GOAL_Y_MIDLINE)
    except (ValueError, TypeError):
        x, y = 0, GOAL_Y_MIDLINE

    out["shot_distance"] = round(shot_distance(x, y), 2)
    out["distance_gle"] = x  # yards from goal line equivalent = our x
    out["distance_from_rp"] = round(distance_to_pipe(x, y, RIGHT_PIPE_Y), 2)
    out["distance_from_lp"] = round(distance_to_pipe(x, y, LEFT_PIPE_Y), 2)
    out["distance_pipe_to_pipe"] = 2.0
    out["visible_shot_angle"] = round(visible_shot_angle(x, y), 2)

    # TODO: goalie_arc_angle requires goalie x/y — do we track that, or assume center?
    out["goalie_arc_angle"] = ""

    # Result flags
    result = (row.get("result") or "").upper()
    out["save"] = 1 if result == "SAVE" else 0
    out["shot_faced_by_goalie"] = 1 if result in ("SAVE", "GOAL") else 0
    out["sog"] = 1 if result in ("SAVE", "GOAL") else 0

    # one_point_shot_flag — derived from points column or distance-based rule
    points = row.get("points")
    out["one_point_shot_flag"] = 1 if str(points) == "1" else 0

    # second_assist_flag
    out["second_assist_flag"] = 1 if (row.get("second_assist") or "").strip() else 0

    # PasserShooter — does first_assist match player? (typically a self-pass / unassisted flag)
    out["PasserShooter"] = 1 if row.get("first_assist") == row.get("player") else 0

    # is_hand_inside — TODO: confirm definition with team. Placeholder: shooter
    # hand same side as cage center → "inside". For now leave blank.
    out["is_hand_inside"] = ""

    # xG / xSv / xg_old — TODO: load model artifacts. For now placeholder zeros.
    out["xg_old"] = ""
    out["xG"] = ""
    out["xSv"] = ""

    # Possession-derived fields — require knowledge of prev shot/event
    # Pass through what we have, rest TODO
    out["previous_possession_shot_clock_time_remaining"] = ""
    out["shot_clock_reset"] = ""
    out["second_chance"] = ""

    return out


# Final Stats Master column order (must match src/lib/csv.ts STATS_MASTER_HEADERS)
MASTER_COLUMNS = [
    "game_number", "qtr", "unique_id", "game_id", "team", "act", "player",
    "situation", "dodge_action", "dodge_location", "shot_hand", "result",
    "rebound", "first_assist", "second_assist", "shot_location", "ct_type",
    "ct_ro_bl_player", "x", "y", "shot_distance", "shot_clock",
    "closest_defender", "opposing_team", "goalie", "week", "date", "market",
    "strong_or_wrong", "points", "first_assist_flag", "possession_counter",
    "possession_ending_event_flag", "prev_possession_ended_by",
    "previous_possession_end", "previous_possession_situation",
    "possession_start", "possession_end", "unique_possession_id",
    "previous_possession_goalie", "shooter_position", "big_chance",
    "previous_possession_shot_clock_time_remaining", "passer_hand",
    "shooter_dominant_hand", "goalie_hand", "save", "shot_faced_by_goalie",
    "sog", "shot_clock_reset", "second_chance", "time_spent", "goal_time",
    "distance_from_rp", "distance_from_lp", "distance_pipe_to_pipe",
    "visible_shot_angle", "distance_gle", "goalie_arc_angle",
    "one_point_shot_flag", "second_assist_flag", "goale_on_pipe_flag",
    "defender_position", "is_hand_inside", "xg_old", "xG", "xSv", "season",
    "quality", "down", "nationality", "PasserShooter",
    "bounce_shot", "net_x", "net_y", "arm_angle", "arm_angle_degrees",
]


def main():
    if len(sys.argv) < 2:
        print("Usage: python transform.py <input.csv>", file=sys.stderr)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = input_path.with_name(input_path.stem + "_master.csv")

    with open(input_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [derive(row) for row in reader]

    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=MASTER_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    print(f"Wrote {len(rows)} rows to {output_path}")


if __name__ == "__main__":
    main()
