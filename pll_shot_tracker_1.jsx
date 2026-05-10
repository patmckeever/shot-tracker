import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Download, Check, Circle, AlertCircle, Target, Zap, Clock, Users } from "lucide-react";

// ============================================================================
// MOCK DATA — replace with Champion Data API calls in production
// ============================================================================
// Canonical field frame: 110 yards long × 60 yards wide, goal at (0, 30).
// The offense always attacks toward increasing visual "up"; we flip render only.
// Coordinates are stored yards from the goal line, so a shot at (5, 30) is
// 5 yards in front of the cage on the midline.

const GAMES = [
  { id: "317377939", label: "2026 Week 1 — Maryland Whipsnakes vs Boston Cannons", date: "2026-06-07", home: "BOS", away: "MD" },
  { id: "317377940", label: "2026 Week 1 — Denver Outlaws vs New York Atlas",    date: "2026-06-07", home: "NY",  away: "DEN" },
  { id: "317377941", label: "2026 Week 1 — Carolina Chaos vs Philadelphia Waterdogs", date: "2026-06-08", home: "PHI", away: "CAR" },
  { id: "317377942", label: "2026 Week 1 — Utah Archers vs California Redwoods", date: "2026-06-08", home: "CA", away: "UTA" },
];

const TEAM_COLORS = {
  MD:  { primary: "#1a1a1a", accent: "#ffd100", name: "Whipsnakes" },
  BOS: { primary: "#0b5394", accent: "#e06666", name: "Cannons" },
  DEN: { primary: "#000000", accent: "#fbbc04", name: "Outlaws" },
  NY:  { primary: "#1d1d5e", accent: "#d4af37", name: "Atlas" },
  PHI: { primary: "#1b1b1b", accent: "#ff6d00", name: "Waterdogs" },
  CAR: { primary: "#3d0066", accent: "#8e44ad", name: "Chaos" },
  CA:  { primary: "#0b3d2e", accent: "#c0392b", name: "Redwoods" },
  UTA: { primary: "#6b1f3d", accent: "#ecf0f1", name: "Archers" },
};

// Roster generator — in production pulled from dim_players in BigQuery.
const makeRoster = (team, seed) => {
  const firstNames = ["Michael", "Matt", "Tom", "CJ", "Brennan", "Connor", "Rob", "Grant", "Jeff", "Mac", "Jared", "Asher", "Ryan", "Ross", "Myles", "TJ", "Jack", "Chris", "Kieran", "Dylan"];
  const lastNames = ["Sowers", "Rambo", "Schreiber", "Kirst", "O'Neill", "Fields", "Pannell", "Ament", "Teat", "O'Keefe", "Bernhardt", "Nelson", "Ambler", "Scott", "Jones", "Malloe", "Hannah", "Gray", "McArdle", "Molloy"];
  const positions = ["A", "A", "A", "M", "M", "M", "M", "SSDM", "LSM", "D", "D", "D", "FO", "G"];
  const r = [];
  let s = seed;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 23; i++) {
    const first = firstNames[Math.floor(rand() * firstNames.length)];
    const last = lastNames[Math.floor(rand() * lastNames.length)];
    r.push({
      id: `${team}_${i}`,
      number: i < 14 ? positions.length > i ? Math.floor(rand() * 49) + 1 : Math.floor(rand() * 49) + 1 : Math.floor(rand() * 49) + 1,
      name: `${first} ${last}`,
      position: positions[i] || "M",
      team,
    });
  }
  // Unique jersey numbers
  const used = new Set();
  r.forEach(p => {
    while (used.has(p.number)) p.number = Math.floor(rand() * 49) + 1;
    used.add(p.number);
  });
  return r;
};

// Sample shots for game 317377939 — MD @ BOS
const makeSampleShots = (homeRoster, awayRoster) => {
  const shots = [];
  const shooters = [...homeRoster.slice(0, 8), ...awayRoster.slice(0, 8)].filter(p => ["A", "M"].includes(p.position));
  const assisters = [...homeRoster.slice(0, 10), ...awayRoster.slice(0, 10)];
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const results = ["GOAL", "SAVE", "MISS", "GOAL", "SAVE", "SAVE", "MISS"];

  let seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  for (let i = 0; i < 58; i++) {
    const shooter = shooters[Math.floor(rand() * shooters.length)];
    const hasAssist = rand() > 0.55;
    const assister = hasAssist ? assisters.find(p => p.team === shooter.team && p.id !== shooter.id) : null;
    const quarter = quarters[Math.min(3, Math.floor(i / 15))];
    const minutes = Math.floor(rand() * 12);
    const seconds = Math.floor(rand() * 60);
    shots.push({
      shot_id: `sh_${i + 1}`,
      game_id: "317377939",
      shooter_id: shooter.id,
      shooter_name: shooter.name,
      shooter_number: shooter.number,
      offensive_team: shooter.team,
      defensive_team: shooter.team === "BOS" ? "MD" : "BOS",
      hand: rand() > 0.2 ? "R" : "L",  // ~80% RH in PLL
      assister_id: assister?.id || null,
      assister_name: assister?.name || null,
      assister_number: assister?.number || null,
      quarter,
      game_clock: `${minutes}:${String(seconds).padStart(2, "0")}`,
      result: results[Math.floor(rand() * results.length)],
      // Fields we TRACK — start null
      shot_x: null,
      shot_y: null,
      closest_defender_id: null,
      second_assist_id: null,
      shot_clock: null,
      bounce_shot: null,
      arm_angle: null,
      arm_angle_degrees: null,
      net_x: null,
      net_y: null,
    });
  }
  return shots;
};

// ============================================================================
// FIELD — stadium-shaped attack zone matching PLL Stats graphic
// ============================================================================
// Reference coordinate system stays the same:
//   shot_x = yards from goal line (0 at cage, positive = further out)
//   shot_y = yards from left sideline (0-60, midline = 30)
// But the render is now a "stadium" outline: rectangle bottom + arched top.
// Goal sits near the bottom, crease visible around it. This matches the PLL
// Stats visual style.

const FIELD_W = 60;           // yards wide (sideline to sideline)
const FIELD_H = 40;           // yards shown from end line
const GOAL_Y_FROM_ENDLINE = 4; // goal is ~4yd off the end line (behind-cage space)
const CREASE_R = 3;            // 9ft = 3yd
const ARCH_RADIUS_YD = 18;     // radius of the arched top (shooting arc)

// Zone dimensions — in the reference image, the stadium extends ~2/3 of the
// width and has a tall aspect. Our SVG viewBox will use padding on either side
// so the field doesn't touch the edges.
const ZONE_INSET_X = 8;     // yards of padding on each side
const ZONE_W = FIELD_W - ZONE_INSET_X * 2;  // 44yd wide playing zone
const ZONE_TOP = 2;          // padding from top of viewBox
const ZONE_BOTTOM = FIELD_H - 2;  // padding from bottom
const ZONE_ARCH_HEIGHT = ZONE_W / 2;  // semicircle arch on top

function Field({ shots, activeShotId, onFieldClick, onHoverShot }) {
  const svgRef = useRef(null);
  const [hoverCoord, setHoverCoord] = useState(null);

  // SVG Y coord where the goal sits
  const goalSvgY = ZONE_BOTTOM - GOAL_Y_FROM_ENDLINE;
  const goalSvgX = FIELD_W / 2;

  // Build the stadium outline: rectangle sides + arched top
  const leftX = ZONE_INSET_X;
  const rightX = FIELD_W - ZONE_INSET_X;
  const archTopY = ZONE_TOP;
  const archStartY = ZONE_TOP + ZONE_ARCH_HEIGHT;
  const stadiumPath = `
    M ${leftX} ${ZONE_BOTTOM}
    L ${leftX} ${archStartY}
    A ${ZONE_W/2} ${ZONE_ARCH_HEIGHT} 0 0 1 ${rightX} ${archStartY}
    L ${rightX} ${ZONE_BOTTOM}
    Z
  `;

  // Convert SVG click → canonical (shot_x, shot_y)
  // SVG y=goalSvgY → shot_x=0 ; moving up (smaller y) → positive shot_x
  // SVG x=goalSvgX → shot_y=30 (midline)
  const svgToCanonical = (svgX, svgY) => ({
    shot_x: +(goalSvgY - svgY).toFixed(2),
    shot_y: +(svgX).toFixed(2),
  });
  const canonicalToSvg = (shot_x, shot_y) => ({
    x: shot_y,
    y: goalSvgY - shot_x,
  });

  const handleClick = (e) => {
    const pt = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - pt.left) / pt.width) * FIELD_W;
    const y = ((e.clientY - pt.top) / pt.height) * FIELD_H;
    const c = svgToCanonical(x, y);
    onFieldClick(c);
  };

  const handleMove = (e) => {
    const pt = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - pt.left) / pt.width) * FIELD_W;
    const y = ((e.clientY - pt.top) / pt.height) * FIELD_H;
    setHoverCoord({ x, y, canonical: svgToCanonical(x, y) });
  };

  return (
    <div className="relative w-full" style={{ aspectRatio: `${FIELD_W}/${FIELD_H}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
        className="w-full h-full rounded-md"
        style={{
          background: "linear-gradient(180deg, #f7f7f4 0%, #e8e8e3 100%)",
          cursor: "crosshair",
        }}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverCoord(null)}
      >
        {/* Stadium fill + outline */}
        <path d={stadiumPath} fill="#ffffff" fillOpacity={0.6} stroke="#0a2540"
              strokeWidth={0.35} strokeLinejoin="round" />

        {/* Crease */}
        <circle cx={goalSvgX} cy={goalSvgY} r={CREASE_R}
                fill="none" stroke="#0a2540" strokeWidth={0.35} />

        {/* Goal line (inside crease) */}
        <line x1={goalSvgX - 1} y1={goalSvgY} x2={goalSvgX + 1} y2={goalSvgY}
              stroke="#0a2540" strokeWidth={0.35} strokeLinecap="round" />

        {/* Existing shot markers */}
        {shots.filter(s => s.shot_x !== null).map(s => {
          const pos = canonicalToSvg(s.shot_x, s.shot_y);
          const isActive = s.shot_id === activeShotId;
          const color = s.result === "GOAL" ? "#22c55e" : s.result === "SAVE" ? "#eab308" : "#ef4444";
          return (
            <g key={s.shot_id}
               onMouseEnter={() => onHoverShot(s)}
               onMouseLeave={() => onHoverShot(null)}
               style={{ cursor: "pointer" }}>
              <circle cx={pos.x} cy={pos.y} r={isActive ? 1.3 : 0.8}
                      fill={color}
                      stroke={isActive ? "#0a2540" : "#ffffff"}
                      strokeWidth={isActive ? 0.3 : 0.15}
                      opacity={isActive ? 1 : 0.85} />
            </g>
          );
        })}

        {/* Hover crosshair */}
        {hoverCoord && (
          <>
            <line x1={hoverCoord.x} y1={0} x2={hoverCoord.x} y2={FIELD_H}
                  stroke="#0a2540" strokeWidth={0.06} opacity={0.35} pointerEvents="none" />
            <line x1={0} y1={hoverCoord.y} x2={FIELD_W} y2={hoverCoord.y}
                  stroke="#0a2540" strokeWidth={0.06} opacity={0.35} pointerEvents="none" />
          </>
        )}
      </svg>
      {hoverCoord && (
        <div className="absolute top-2 right-2 bg-zinc-900/90 text-amber-400 text-[10px] font-mono px-2 py-1 rounded">
          {hoverCoord.canonical.shot_x.toFixed(1)}yd from goal ·{" "}
          {Math.abs(hoverCoord.canonical.shot_y - 30).toFixed(1)}yd{" "}
          {hoverCoord.canonical.shot_y > 30 ? "R" : "L"}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// NET — for tracking ball location on net
// ============================================================================
// 6ft × 6ft goal, stored as (x, y) in inches 0-72.

// Two modes:
//  - onGoal=true  → tight 72×72 inch grid, the goal IS the frame; ball must land inside
//  - onGoal=false → extended 144×108 frame (~2x wide, 1.5x tall); goal rendered in middle;
//                   stores the location where the ball crossed the goal plane while missing
// Coordinate storage: inches, bottom-left origin, (36, 36) = center of goal mouth.
// On-goal shots: x/y in 0-72. Misses: can be negative or >72 (extends left/right/above).
function GoalPlanePicker({ netX, netY, onGoalClick, onGoal }) {
  const svgRef = useRef(null);

  // View bounds — different for on-goal vs miss
  const VB = onGoal
    ? { w: 72, h: 72, goalX: 0, goalY: 0 }      // goal fills view
    : { w: 144, h: 108, goalX: 36, goalY: 18 }; // goal in middle-upper area

  const handleClick = (e) => {
    const pt = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - pt.left) / pt.width) * VB.w;
    const svgY = ((e.clientY - pt.top) / pt.height) * VB.h;
    // convert to goal-relative coords (bottom-left of goal mouth = origin)
    const goalRelX = svgX - VB.goalX;
    const goalRelY = (VB.h - svgY) - VB.goalY;
    onGoalClick({ net_x: +goalRelX.toFixed(1), net_y: +goalRelY.toFixed(1) });
  };

  // Convert stored coords → SVG coords for rendering the dot
  const dotSvgX = netX !== null ? netX + VB.goalX : null;
  const dotSvgY = netX !== null ? VB.h - (netY + VB.goalY) : null;

  // Determine if miss shot is still inside the goal (shouldn't be — warn if so)
  const missInsideGoal = !onGoal && netX !== null &&
    netX >= 0 && netX <= 72 && netY >= 0 && netY <= 72;

  return (
    <div className="w-full" style={{ aspectRatio: `${VB.w}/${VB.h}` }}>
      <svg ref={svgRef} viewBox={`0 0 ${VB.w} ${VB.h}`} className="w-full h-full rounded"
           style={{ background: onGoal ? "#1a1a1a" : "#0a0a0a", cursor: "crosshair" }}
           onClick={handleClick}>
        <defs>
          <pattern id="mesh" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M 0 0 L 4 0 M 0 0 L 0 4" stroke="#3a3a3a" strokeWidth="0.3" />
          </pattern>
        </defs>

        {/* Net mesh — only inside the goal */}
        <rect x={VB.goalX + 2} y={VB.goalY + 2} width={68} height={68} fill="url(#mesh)" />

        {/* Reference hash marks around the goal (miss mode only) — help gauge distance */}
        {!onGoal && (
          <g opacity="0.25">
            {/* Tick marks every 12 inches (1ft) around the outer frame */}
            {[...Array(13)].map((_, i) => (
              <g key={i}>
                <line x1={i * 12} y1={VB.h - VB.goalY} x2={i * 12} y2={VB.h - VB.goalY - 2} stroke="#fff" strokeWidth="0.2" />
              </g>
            ))}
          </g>
        )}

        {/* Goal frame */}
        <rect x={VB.goalX + 2} y={VB.goalY + 2} width={68} height={68} fill="none"
              stroke="#ff4d4d" strokeWidth="1.5" />

        {/* 9-zone grid inside goal (very subtle) */}
        {[1, 2].map(i => (
          <g key={i} opacity="0.15">
            <line x1={VB.goalX + 2 + (68/3)*i} y1={VB.goalY + 2}
                  x2={VB.goalX + 2 + (68/3)*i} y2={VB.goalY + 70}
                  stroke="#fff" strokeWidth="0.2" />
            <line x1={VB.goalX + 2} y1={VB.goalY + 2 + (68/3)*i}
                  x2={VB.goalX + 70} y2={VB.goalY + 2 + (68/3)*i}
                  stroke="#fff" strokeWidth="0.2" />
          </g>
        ))}

        {/* Ball marker */}
        {netX !== null && (
          <g>
            <circle cx={dotSvgX} cy={dotSvgY} r={onGoal ? 2.5 : 3}
                    fill={onGoal ? "#22ff88" : "#ff4d4d"}
                    stroke="#fff" strokeWidth="0.5" />
          </g>
        )}
      </svg>
      {missInsideGoal && (
        <div className="mt-1 text-[10px] font-mono text-amber-500 flex items-center gap-1">
          <AlertCircle size={10} /> marked inside goal but result is miss — re-click outside frame
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ARM ANGLE — circle pivot with stick extending outward
// ============================================================================
// Viewed from behind the shooter. Stick pivots at the center of a circle.
// Default state: stick horizontal, pointing toward dominant side.
//   - RH shooter: stick points RIGHT (angle 90° in our system)
//   - LH shooter: stick points LEFT (mirrored)
//
// Internal angle convention (hand-agnostic, stored in degrees):
//   0°   = stick pointing toward the ground (underhand)
//   90°  = stick horizontal on dominant side (sidearm)
//   180° = stick pointing up (overhand)
//
// The visual simply flips horizontally for LH shooters so the stick extends
// from the left. Storage stays consistent regardless of hand.
//
// Buckets:
//   0–25°    underhand
//   25–55°   quarter
//   55–90°   sidearm
//   90–130°  three_quarter
//   130–180° overhand

const ARM_ANGLE_BUCKETS = [
  { v: "underhand",     l: "UNDER",  min: 0,   max: 25  },
  { v: "quarter",       l: "1/4",    min: 25,  max: 55  },
  { v: "sidearm",       l: "SIDE",   min: 55,  max: 90  },
  { v: "three_quarter", l: "3/4",    min: 90,  max: 130 },
  { v: "overhand",      l: "OVER",   min: 130, max: 180 },
];

function bucketFromDegrees(deg) {
  const b = ARM_ANGLE_BUCKETS.find(b => deg >= b.min && deg < b.max);
  return b || ARM_ANGLE_BUCKETS[ARM_ANGLE_BUCKETS.length - 1];
}

function ArmAnglePicker({ degrees, hand, onChange }) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const isLefty = hand === "L";

  // Pivot at the center of the circle
  const PIVOT = { x: 100, y: 100 };
  const CIRCLE_R = 42;      // radius of the pivot circle
  const STICK_LEN = 80;     // stick length from pivot

  // Default display: 90° (sidearm) if not yet set
  const currentDeg = degrees ?? 90;

  // Convert internal angle → screen angle, accounting for handedness.
  // For RH: 0° = down (y+), 90° = right (x+), 180° = up (y-)
  // For LH: mirror across vertical axis: 90° = left (x-), everything else flipped horizontally
  const angleToPoint = useCallback((deg) => {
    const rad = (deg - 90) * Math.PI / 180;
    const xDir = isLefty ? -1 : 1;
    return {
      x: PIVOT.x + Math.cos(rad) * STICK_LEN * xDir,
      y: PIVOT.y - Math.sin(rad) * STICK_LEN,
    };
  }, [isLefty]);

  // Same for points on the circle edge (for dashes)
  const circleAngleToPoint = useCallback((deg, r = CIRCLE_R) => {
    const rad = (deg - 90) * Math.PI / 180;
    const xDir = isLefty ? -1 : 1;
    return {
      x: PIVOT.x + Math.cos(rad) * r * xDir,
      y: PIVOT.y - Math.sin(rad) * r,
    };
  }, [isLefty]);

  const updateFromPointer = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * 200;
    const svgY = ((clientY - rect.top) / rect.height) * 200;
    const dxRaw = svgX - PIVOT.x;
    const dy = PIVOT.y - svgY;
    // For LH, flip horizontal so internal degrees stay 0–180 with 90 = sidearm
    const dx = isLefty ? -dxRaw : dxRaw;
    let deg = (Math.atan2(dy, dx) + Math.PI / 2) * 180 / Math.PI;
    deg = Math.max(0, Math.min(180, deg));
    onChange(Math.round(deg));
  }, [onChange, isLefty]);

  const handlePointerDown = (e) => {
    setDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => updateFromPointer(e.clientX, e.clientY);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, updateFromPointer]);

  const tip = angleToPoint(currentDeg);

  // Stick head geometry — build in stick-local coords then project to screen.
  // Local +y = along stick (away from pivot), +x = perpendicular (ccw from stick)
  const xDir = isLefty ? -1 : 1;
  const radFromAxis = (currentDeg - 90) * Math.PI / 180;
  const stickDX = Math.cos(radFromAxis) * xDir;
  const stickDY = -Math.sin(radFromAxis);
  const perpDX = -stickDY * xDir;
  const perpDY = stickDX * xDir;

  const rotate = (lx, ly) => ({
    x: tip.x + lx * perpDX + ly * stickDX,
    y: tip.y + lx * perpDY + ly * stickDY,
  });

  const headPoints = [
    rotate(-2.5, 0),
    rotate(-5.5, 7),
    rotate(-4, 16),
    rotate(0, 19),
    rotate(4, 16),
    rotate(5.5, 7),
    rotate(2.5, 0),
  ].map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  const pocketPoints = [
    rotate(-3, 3),
    rotate(-3, 13),
    rotate(0, 15),
    rotate(3, 13),
    rotate(3, 3),
  ].map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  const activeBucket = degrees !== null && degrees !== undefined ? bucketFromDegrees(degrees).v : null;

  // Build the dashed bucket arcs around the stick's side of the circle.
  // Each bucket gets its own arc segment; the active one is highlighted.
  // For RH shooter: arcs trace right semicircle (bottom→right→top) using ccw sweep.
  // For LH shooter: arcs trace left semicircle (bottom→left→top) using cw sweep.
  const dashArcForBucket = (b) => {
    const start = circleAngleToPoint(b.min);
    const end = circleAngleToPoint(b.max);
    const sweep = isLefty ? 1 : 0;
    return `M ${start.x} ${start.y} A ${CIRCLE_R} ${CIRCLE_R} 0 0 ${sweep} ${end.x} ${end.y}`;
  };

  return (
    <div className="flex gap-3 items-center">
      {/* Stick visual — takes most of the width */}
      <div className="flex-[3] relative">
        <svg
          ref={svgRef}
          viewBox="0 0 200 200"
          className="w-full h-auto select-none"
          style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab", maxHeight: "220px" }}
          onPointerDown={handlePointerDown}
        >
          {/* Main pivot circle (solid, faint) */}
          <circle cx={PIVOT.x} cy={PIVOT.y} r={CIRCLE_R}
                  fill="none" stroke="#27272a" strokeWidth="1.2" />

          {/* Dashed bucket arcs on the STICK SIDE only */}
          {ARM_ANGLE_BUCKETS.map(b => {
            const isActive = activeBucket === b.v;
            return (
              <path
                key={b.v}
                d={dashArcForBucket(b)}
                fill="none"
                stroke={isActive ? "#f59e0b" : "#52525b"}
                strokeWidth={isActive ? 3 : 1.5}
                strokeDasharray={isActive ? "none" : "2.5,2.5"}
                opacity={isActive ? 1 : 0.6}
              />
            );
          })}

          {/* Bucket boundary tick marks extending outward slightly */}
          {[0, 25, 55, 90, 130, 180].map(deg => {
            const inner = circleAngleToPoint(deg, CIRCLE_R);
            const outer = circleAngleToPoint(deg, CIRCLE_R + 4);
            return (
              <line key={deg} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                    stroke="#71717a" strokeWidth="1" />
            );
          })}

          {/* Bucket labels around the arc */}
          {ARM_ANGLE_BUCKETS.map(b => {
            const midDeg = (b.min + b.max) / 2;
            const p = circleAngleToPoint(midDeg, CIRCLE_R + 12);
            const isActive = activeBucket === b.v;
            return (
              <text
                key={b.v}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="7"
                fontFamily="ui-monospace, monospace"
                fontWeight="700"
                fill={isActive ? "#f59e0b" : "#52525b"}
              >
                {b.l}
              </text>
            );
          })}

          {/* Stick shaft — from pivot to tip */}
          <line
            x1={PIVOT.x}
            y1={PIVOT.y}
            x2={tip.x}
            y2={tip.y}
            stroke={degrees === null ? "#71717a" : "#e4e4e7"}
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Stick head */}
          <polygon
            points={headPoints}
            fill={degrees === null ? "#52525b" : "#f59e0b"}
            stroke={degrees === null ? "#71717a" : "#fbbf24"}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon
            points={pocketPoints}
            fill={degrees === null ? "#3f3f46" : "#78350f"}
            opacity="0.7"
          />

          {/* Pivot center dot */}
          <circle cx={PIVOT.x} cy={PIVOT.y} r="2.5" fill="#e4e4e7" />
        </svg>
      </div>

      {/* Compact readout chip — much smaller than the stick */}
      <div className="flex-[1] flex flex-col justify-center items-start min-w-0 gap-1">
        <div className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded font-bold"
             style={{ background: isLefty ? "#7c3aed" : "#0284c7", color: "#fff" }}>
          {isLefty ? "LH" : "RH"}
        </div>
        {degrees !== null && degrees !== undefined ? (
          <>
            <div className="text-xl font-black text-amber-500 font-mono leading-none">
              {degrees}°
            </div>
            <div className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">
              {bucketFromDegrees(degrees).l}
            </div>
            <button
              onClick={() => onChange(null)}
              className="text-[9px] font-mono text-zinc-500 hover:text-zinc-300 text-left"
            >
              clear
            </button>
          </>
        ) : (
          <div className="text-[10px] text-zinc-500 leading-snug">
            drag to set
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PLAYER SELECTOR — big readable cards
// ============================================================================

function PlayerPicker({ label, roster, selectedId, onSelect, icon: Icon, accentColor }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return roster.slice(0, 6);
    const q = query.toLowerCase();
    return roster.filter(p =>
      p.name.toLowerCase().includes(q) ||
      String(p.number).startsWith(query)
    ).slice(0, 8);
  }, [query, roster]);

  const selected = roster.find(p => p.id === selectedId);

  return (
    <div className="relative">
      <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1 flex items-center gap-1">
        <Icon size={10} /> {label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded px-2 py-2 flex items-center gap-2 text-left transition-colors"
      >
        {selected ? (
          <>
            <div className="flex items-center justify-center w-10 h-10 rounded font-bold text-xl"
                 style={{ background: accentColor, color: "#000" }}>
              {selected.number}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-zinc-100 truncate">{selected.name}</div>
              <div className="text-[10px] text-zinc-500 font-mono">{selected.position} · {selected.team}</div>
            </div>
          </>
        ) : (
          <div className="text-zinc-500 text-sm py-2">Select player…</div>
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 bg-zinc-900 border border-zinc-700 rounded shadow-2xl p-2">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Name or #"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-100 font-mono mb-2"
          />
          <div className="max-h-64 overflow-y-auto">
            {selectedId && (
              <button
                onClick={() => { onSelect(null); setOpen(false); setQuery(""); }}
                className="w-full px-2 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-800 rounded"
              >
                × Clear
              </button>
            )}
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); setOpen(false); setQuery(""); }}
                className="w-full px-2 py-1.5 flex items-center gap-2 hover:bg-zinc-800 rounded text-left"
              >
                <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-sm"
                     style={{ background: accentColor, color: "#000" }}>
                  {p.number}
                </div>
                <div>
                  <div className="text-sm text-zinc-100">{p.name}</div>
                  <div className="text-[9px] text-zinc-500 font-mono">{p.position}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function ShotTracker() {
  const [gameId, setGameId] = useState("");
  const [rosters, setRosters] = useState({});
  const [shots, setShots] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [hoverShot, setHoverShot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Load from persistent storage when a game is selected
  useEffect(() => {
    if (!gameId) return;
    setLoading(true);
    (async () => {
      try {
        const saved = await window.storage.get(`game:${gameId}`);
        const game = GAMES.find(g => g.id === gameId);
        const homeRoster = makeRoster(game.home, gameId.charCodeAt(gameId.length - 1));
        const awayRoster = makeRoster(game.away, gameId.charCodeAt(gameId.length - 2));
        setRosters({ [game.home]: homeRoster, [game.away]: awayRoster });

        if (saved && saved.value) {
          const parsed = JSON.parse(saved.value);
          setShots(parsed.shots);
          setActiveIdx(parsed.activeIdx || 0);
        } else {
          setShots(makeSampleShots(homeRoster, awayRoster));
          setActiveIdx(0);
        }
      } catch (err) {
        // No saved data → fresh load
        const game = GAMES.find(g => g.id === gameId);
        const homeRoster = makeRoster(game.home, gameId.charCodeAt(gameId.length - 1));
        const awayRoster = makeRoster(game.away, gameId.charCodeAt(gameId.length - 2));
        setRosters({ [game.home]: homeRoster, [game.away]: awayRoster });
        setShots(makeSampleShots(homeRoster, awayRoster));
        setActiveIdx(0);
      } finally {
        setLoading(false);
      }
    })();
  }, [gameId]);

  // Auto-save on every change
  useEffect(() => {
    if (!gameId || shots.length === 0) return;
    const t = setTimeout(async () => {
      try {
        await window.storage.set(`game:${gameId}`, JSON.stringify({ shots, activeIdx }));
        setLastSaved(new Date());
      } catch (e) { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [shots, activeIdx, gameId]);

  const activeShot = shots[activeIdx];
  const game = GAMES.find(g => g.id === gameId);

  // Derived rosters for pickers
  const defensiveRoster = useMemo(() => {
    if (!activeShot) return [];
    return rosters[activeShot.defensive_team] || [];
  }, [activeShot, rosters]);

  const offensiveRoster = useMemo(() => {
    if (!activeShot) return [];
    return (rosters[activeShot.offensive_team] || []).filter(p => p.id !== activeShot.shooter_id);
  }, [activeShot, rosters]);

  const updateShot = useCallback((patch) => {
    setShots(prev => prev.map((s, i) => i === activeIdx ? { ...s, ...patch } : s));
  }, [activeIdx]);

  const goPrev = useCallback(() => setActiveIdx(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setActiveIdx(i => Math.min(shots.length - 1, i + 1)), [shots.length]);
  const goNextUnmarked = useCallback(() => {
    const next = shots.findIndex((s, i) => i > activeIdx && s.shot_x === null);
    if (next >= 0) setActiveIdx(next);
  }, [shots, activeIdx]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "n" || e.key === "N") goNextUnmarked();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, goNextUnmarked]);

  // Completion stats
  const completion = useMemo(() => {
    const total = shots.length;
    const marked = shots.filter(s => s.shot_x !== null).length;
    const fullyTracked = shots.filter(s =>
      s.shot_x !== null && s.closest_defender_id && s.shot_clock !== null && s.shot_clock !== ""
    ).length;
    return { total, marked, fullyTracked };
  }, [shots]);

  const exportCSV = () => {
    const headers = [
      "game_id","shot_id","quarter","game_clock","shot_clock",
      "offensive_team","defensive_team",
      "shooter_id","shooter_name","shooter_number","hand",
      "assister_id","assister_name",
      "second_assist_id","second_assist_name",
      "closest_defender_id","closest_defender_name",
      "shot_x","shot_y","result","bounce_shot","arm_angle","arm_angle_degrees",
      "net_x","net_y"
    ];
    const lookupName = (id) => {
      for (const team in rosters) {
        const p = rosters[team].find(pp => pp.id === id);
        if (p) return p.name;
      }
      return "";
    };
    const rows = shots.map(s => [
      s.game_id, s.shot_id, s.quarter, s.game_clock, s.shot_clock ?? "",
      s.offensive_team, s.defensive_team,
      s.shooter_id, s.shooter_name, s.shooter_number, s.hand ?? "",
      s.assister_id ?? "", s.assister_name ?? "",
      s.second_assist_id ?? "", lookupName(s.second_assist_id),
      s.closest_defender_id ?? "", lookupName(s.closest_defender_id),
      s.shot_x ?? "", s.shot_y ?? "", s.result,
      s.bounce_shot === null ? "" : (s.bounce_shot ? 1 : 0), s.arm_angle ?? "", s.arm_angle_degrees ?? "",
      s.net_x ?? "", s.net_y ?? "",
    ]);
    const csv = [headers, ...rows].map(r =>
      r.map(c => {
        const str = String(c);
        return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shots_${gameId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // GAME PICKER SCREEN
  // =========================================================================
  if (!gameId) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#e4e4e7" }}>
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="mb-10">
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500 font-mono mb-3">PLL Advanced Stats</div>
            <h1 className="text-4xl font-black tracking-tight">Shot Tracker</h1>
            <p className="text-zinc-500 mt-2 text-sm">Select a game to begin tracking. Shot metadata loads automatically from Champion Data.</p>
          </div>
          <div className="space-y-2">
            {GAMES.map(g => (
              <button
                key={g.id}
                onClick={() => setGameId(g.id)}
                className="w-full text-left bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 rounded-md px-4 py-3 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-zinc-500">{g.date} · Match {g.id}</div>
                    <div className="text-sm font-semibold mt-0.5">{g.label}</div>
                  </div>
                  <ChevronRight size={16} className="text-zinc-600 group-hover:text-amber-500" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // LOADING
  // =========================================================================
  if (loading || !activeShot) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e4e4e7" }} className="flex items-center justify-center font-mono text-xs">
        Loading game data from Champion Data…
      </div>
    );
  }

  // =========================================================================
  // TRACKER
  // =========================================================================
  const offTeamColor = TEAM_COLORS[activeShot.offensive_team];
  const defTeamColor = TEAM_COLORS[activeShot.defensive_team];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e4e4e7", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* Header */}
      <div className="border-b border-zinc-900 px-4 py-2 flex items-center justify-between bg-zinc-950/50">
        <div className="flex items-center gap-4">
          <button onClick={() => setGameId("")} className="text-xs text-zinc-500 hover:text-zinc-300 font-mono">← GAMES</button>
          <div className="text-xs font-mono text-zinc-400">{game.label}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[10px] font-mono text-zinc-500">
            {completion.marked}/{completion.total} marked · {completion.fullyTracked}/{completion.total} complete
          </div>
          <div className="w-48 h-1 bg-zinc-900 rounded overflow-hidden">
            <div className="h-full bg-amber-500" style={{ width: `${(completion.fullyTracked / completion.total) * 100}%` }} />
          </div>
          {lastSaved && (
            <div className="text-[10px] font-mono text-zinc-600">
              saved {lastSaved.toLocaleTimeString()}
            </div>
          )}
          <button
            onClick={exportCSV}
            className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold px-3 py-1.5 rounded flex items-center gap-1.5"
          >
            <Download size={12} /> EXPORT CSV
          </button>
        </div>
      </div>

      {/* Shot Info Bar */}
      <div className="border-b border-zinc-900 bg-gradient-to-r"
           style={{
             backgroundImage: `linear-gradient(90deg, ${offTeamColor.primary}40 0%, transparent 40%, transparent 60%, ${defTeamColor.primary}40 100%)`
           }}>
        <div className="px-4 py-3 flex items-center gap-6">
          <button onClick={goPrev} disabled={activeIdx === 0}
                  className="p-2 bg-zinc-900 rounded hover:bg-zinc-800 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>

          <div className="flex-1 flex items-center gap-6">
            <div className="text-[10px] font-mono text-zinc-500">
              SHOT {activeIdx + 1} / {shots.length}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-mono px-2 py-0.5 bg-zinc-900 rounded text-zinc-300">
                {activeShot.quarter} · {activeShot.game_clock}
              </div>
              <ResultBadge result={activeShot.result} />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded font-black text-lg"
                   style={{ background: offTeamColor.accent, color: "#000" }}>
                {activeShot.shooter_number}
              </div>
              <div>
                <div className="text-sm font-bold">{activeShot.shooter_name}</div>
                <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1.5">
                  <span>{activeShot.offensive_team} · SHOOTER</span>
                  <span className="px-1 py-0.5 rounded font-bold"
                        style={{ background: activeShot.hand === "L" ? "#7c3aed" : "#0284c7", color: "#fff" }}>
                    {activeShot.hand}H
                  </span>
                </div>
              </div>
            </div>

            {activeShot.assister_name && (
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded font-bold text-sm"
                     style={{ background: offTeamColor.accent, color: "#000", opacity: 0.7 }}>
                  {activeShot.assister_number}
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-300">{activeShot.assister_name}</div>
                  <div className="text-[9px] font-mono text-zinc-500">PRIMARY ASSIST</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={goNextUnmarked}
                    className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-400 rounded">
              NEXT UNMARKED (N)
            </button>
            <button onClick={goNext} disabled={activeIdx === shots.length - 1}
                    className="p-2 bg-zinc-900 rounded hover:bg-zinc-800 disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid — three rows, no vertical scroll */}
      <div className="p-3 space-y-3">

        {/* ROW 1 — Field (left) + Core Tracking (right) */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-7">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1.5 flex items-center justify-between">
              <span>FIELD · {activeShot.offensive_team} attacking</span>
              <span>click to mark shot location</span>
            </div>
            <div style={{ maxHeight: "46vh" }} className="overflow-hidden">
              <Field
                shots={shots}
                activeShotId={activeShot.shot_id}
                onFieldClick={(c) => updateShot({ shot_x: c.shot_x, shot_y: c.shot_y })}
                onHoverShot={setHoverShot}
              />
            </div>
          </div>

          <div className="col-span-5">
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 space-y-3 h-full">
              <div className="text-[10px] uppercase tracking-widest text-amber-500 font-mono">
                CORE TRACKING
              </div>

              <PlayerPicker
                label="Closest Defender"
                roster={defensiveRoster}
                selectedId={activeShot.closest_defender_id}
                onSelect={(id) => updateShot({ closest_defender_id: id })}
                icon={Target}
                accentColor={defTeamColor.accent}
              />

              <PlayerPicker
                label="Second Assist"
                roster={offensiveRoster}
                selectedId={activeShot.second_assist_id}
                onSelect={(id) => updateShot({ second_assist_id: id })}
                icon={Users}
                accentColor={offTeamColor.accent}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1 flex items-center gap-1">
                    <Clock size={10} /> Shot Clock (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={activeShot.shot_clock ?? ""}
                    onChange={(e) => updateShot({ shot_clock: e.target.value === "" ? null : +e.target.value })}
                    placeholder="seconds"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1 block">
                    Bounce Shot
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      onClick={() => updateShot({ bounce_shot: activeShot.bounce_shot === true ? null : true })}
                      className={`py-2 text-xs font-mono font-bold rounded ${
                        activeShot.bounce_shot === true
                          ? "bg-amber-500 text-black"
                          : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      YES
                    </button>
                    <button
                      onClick={() => updateShot({ bounce_shot: activeShot.bounce_shot === false ? null : false })}
                      className={`py-2 text-xs font-mono font-bold rounded ${
                        activeShot.bounce_shot === false
                          ? "bg-amber-500 text-black"
                          : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      NO
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 2 — Arm Angle (left) + Net/Miss Location (right) */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-7">
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 h-full">
              <div className="text-[10px] uppercase tracking-widest text-amber-500 font-mono mb-2">
                ARM ANGLE
              </div>
              <ArmAnglePicker
                degrees={activeShot.arm_angle_degrees}
                hand={activeShot.hand}
                onChange={(deg) => updateShot({
                  arm_angle_degrees: deg,
                  arm_angle: deg === null ? null : bucketFromDegrees(deg).v,
                })}
              />
            </div>
          </div>

          <div className="col-span-5">
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 h-full">
              <div className="text-[10px] uppercase tracking-widest text-amber-500 font-mono mb-2 flex items-center justify-between">
                <span>{activeShot.result === "MISS" ? "MISS LOCATION" : "NET LOCATION"}</span>
                <span className="text-zinc-600 text-[9px]">
                  {activeShot.result === "MISS" ? "where it crossed the plane" : "where ball met net"}
                </span>
              </div>
              <div style={{ maxWidth: "280px", margin: "0 auto" }}>
                <GoalPlanePicker
                  onGoal={activeShot.result !== "MISS"}
                  netX={activeShot.net_x}
                  netY={activeShot.net_y}
                  onGoalClick={({ net_x, net_y }) => updateShot({ net_x, net_y })}
                />
              </div>
              {activeShot.net_x !== null && (
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-[10px] font-mono text-zinc-500">
                    ({activeShot.net_x}, {activeShot.net_y}) in
                  </div>
                  <button
                    onClick={() => updateShot({ net_x: null, net_y: null })}
                    className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300"
                  >
                    clear
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ROW 3 — Hover preview (if any) + Timeline + Status */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-9">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1.5">
              TIMELINE
            </div>
            <div className="flex gap-0.5 h-6">
              {shots.map((s, i) => {
                const complete = s.shot_x !== null && s.closest_defender_id && s.shot_clock !== null && s.shot_clock !== "";
                const partial = s.shot_x !== null;
                return (
                  <button
                    key={s.shot_id}
                    onClick={() => setActiveIdx(i)}
                    className="flex-1 rounded-sm transition-all hover:opacity-100"
                    style={{
                      background: complete ? "#22c55e" : partial ? "#eab308" : "#3f3f46",
                      opacity: i === activeIdx ? 1 : 0.6,
                      outline: i === activeIdx ? "2px solid #fbbf24" : "none",
                    }}
                    title={`Shot ${i+1}: ${s.shooter_name}`}
                  />
                );
              })}
            </div>
            {hoverShot && hoverShot.shot_id !== activeShot.shot_id && (
              <div className="mt-2 text-[11px] font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5">
                <span className="text-amber-400">{hoverShot.result}</span> ·{" "}
                #{hoverShot.shooter_number} {hoverShot.shooter_name} ·{" "}
                {hoverShot.quarter} {hoverShot.game_clock}
                {hoverShot.assister_name && <> · from #{hoverShot.assister_number} {hoverShot.assister_name}</>}
              </div>
            )}
          </div>

          <div className="col-span-3">
            <ShotChecklist shot={activeShot} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultBadge({ result }) {
  const colors = {
    GOAL: { bg: "#22c55e", text: "#000" },
    SAVE: { bg: "#eab308", text: "#000" },
    MISS: { bg: "#ef4444", text: "#fff" },
  }[result] || { bg: "#52525b", text: "#fff" };
  return (
    <div className="text-[10px] font-black font-mono px-2 py-0.5 rounded tracking-widest"
         style={{ background: colors.bg, color: colors.text }}>
      {result}
    </div>
  );
}

function ShotChecklist({ shot }) {
  const items = [
    { label: "Location", done: shot.shot_x !== null },
    { label: "Defender", done: !!shot.closest_defender_id },
    { label: "Clock", done: shot.shot_clock !== null && shot.shot_clock !== "" },
    { label: "Bounce", done: shot.bounce_shot !== null && shot.bounce_shot !== undefined },
    { label: "Arm Angle", done: !!shot.arm_angle },
    { label: shot.result === "MISS" ? "Miss Loc" : "Net Loc", done: shot.net_x !== null },
  ];
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded p-2 h-full">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono mb-1.5">
        STATUS
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {items.map(it => (
          <div key={it.label} className="flex items-center gap-1 text-[10px]">
            {it.done
              ? <Check size={10} className="text-green-500 shrink-0" />
              : <Circle size={10} className="text-zinc-700 shrink-0" />}
            <span className={it.done ? "text-zinc-300" : "text-zinc-500"}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
