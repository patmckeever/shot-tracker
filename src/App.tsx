/**
 * PLL Shot Tracker — prototype UI merged with scaffold data layer.
 * Single-file layout per integration plan.
 */

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Check,
  Circle,
  AlertCircle,
  Target,
  Clock,
  Users,
} from "lucide-react";
import type { Game, Player, Shot, ShotResult, ArmAngleBucket } from "../lib/types";
import {
  TRACKER_NO_PLAYER_ID,
  isDefenderChoiceComplete,
  isSecondAssistChoiceComplete,
  isTrackerNoPlayerId,
} from "../lib/types";
import { API, type GameListLeague } from "./lib/api";
import { Storage } from "./lib/storage";
import { buildStatsMasterCsv, downloadCsv, incompleteShots } from "./lib/csv";
import { pllShotDistanceYards } from "../lib/shotGraphicDistance";
import { sortShotsChronologically } from "../lib/metricFlow";
import fieldGraphicUrl from "../field.png";

// ─────────────────────────────────────────────────────────────────────────────
// Team colors + Champion abbreviation aliases
// ─────────────────────────────────────────────────────────────────────────────

type TeamStyle = { primary: string; accent: string; name: string };

const TEAM_COLORS: Record<string, TeamStyle> = {
  MD: { primary: "#1a1a1a", accent: "#ffd100", name: "Whipsnakes" },
  BOS: { primary: "#0b5394", accent: "#e06666", name: "Cannons" },
  DEN: { primary: "#000000", accent: "#fbbc04", name: "Outlaws" },
  NY: { primary: "#1d1d5e", accent: "#d4af37", name: "Atlas" },
  PHI: { primary: "#1b1b1b", accent: "#ff6d00", name: "Waterdogs" },
  CAR: { primary: "#3d0066", accent: "#8e44ad", name: "Chaos" },
  CA: { primary: "#0b3d2e", accent: "#c0392b", name: "Redwoods" },
  UTA: { primary: "#6b1f3d", accent: "#ecf0f1", name: "Archers" },
};

const TEAM_CODE_ALIASES: Record<string, keyof typeof TEAM_COLORS | string> = {
  ATL: "NY",
  CHA: "CAR",
};

function teamStyle(code: string): TeamStyle {
  const mapped = TEAM_CODE_ALIASES[code] ?? code;
  const base = TEAM_COLORS[mapped as keyof typeof TEAM_COLORS];
  return base ?? { primary: "#27272a", accent: "#71717a", name: code };
}

// ─────────────────────────────────────────────────────────────────────────────
// Field graphic — full-bleed PLL shot-location image; tracker stores pixel (x, y).
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_PIXEL_W = 2000;
/** Cropped PLL field graphic (bottom trimmed); goal anchor still pll y=900 */
const FIELD_PIXEL_H = 2149;
/** Top raster inset of `field.png` before playable markings; shifts viewBox Y only (image size unchanged). */
const FIELD_Y_DISPLAY_OFFSET = 351;
/** Major gridlines every N px; light subdivisions half that when fine detail helps */
const FIELD_GRID_MAJOR = 100;
const FIELD_GRID_MINOR = 50;

/** 3×3 region from net / miss-plane coordinates (goal & save: 0–72 mouth; miss: 144×108 plane). Lower y → bottom. */
function netPickRegionLabel(
  netX: number | null,
  netY: number | null,
  result: ShotResult,
): string | null {
  if (netX == null || netY == null) return null;
  const isMiss = result === "MISS";
  const w = isMiss ? 144 : 72;
  const h = isMiss ? 108 : 72;
  const tw = w / 3;
  const th = h / 3;
  const horz = netX < tw ? "left" : netX < 2 * tw ? "middle" : "right";
  const vert = netY < th ? "bottom" : netY < 2 * th ? "middle" : "top";
  if (vert === "middle" && horz === "middle") return "Center";
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return `${cap(vert)} ${horz === "middle" ? "middle" : horz}`;
}

function clampShotPixel(n: number, max: number): number {
  return Math.min(max, Math.max(1, Math.round(n)));
}

/** Map screen pixels into SVG viewBox coords (2000×2149). Required when using preserveAspectRatio meet + letterboxing. */
function clientToViewBox(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    const r = svg.getBoundingClientRect();
    return {
      px: ((clientX - r.left) / r.width) * FIELD_PIXEL_W,
      py: ((clientY - r.top) / r.height) * FIELD_PIXEL_H,
    };
  }
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { px: p.x, py: p.y };
}

/**
 * Raw SVG viewBox Y grows downward (0 at top). PLL shot y matches the league graphic
 * (goal line y=900, etc.). The field raster has empty space above the markings; playable
 * Y is shifted by FIELD_Y_DISPLAY_OFFSET in viewBox space:
 * pllY = FIELD_PIXEL_H − viewBoxY + FIELD_Y_DISPLAY_OFFSET.
 */
function viewBoxYToPllY(viewBoxY: number): number {
  return clampShotPixel(
    FIELD_PIXEL_H - viewBoxY + FIELD_Y_DISPLAY_OFFSET,
    FIELD_PIXEL_H,
  );
}

function pllYToViewBoxY(pllY: number): number {
  return FIELD_PIXEL_H - pllY + FIELD_Y_DISPLAY_OFFSET;
}

type FieldClickCanonical = { x: number; y: number };

interface FieldProps {
  shots: Shot[];
  activeShotId: string;
  onFieldClick: (c: FieldClickCanonical) => void;
  onHoverShot: (shot: Shot | null) => void;
  /** Wider area beside a sidebar — drop width cap so the field fills the column */
  besideSidebar?: boolean;
}

const fieldGridLines = (() => {
  const lines: ReactNode[] = [];
  for (let gx = 0; gx <= FIELD_PIXEL_W; gx += FIELD_GRID_MINOR) {
    const major = gx % FIELD_GRID_MAJOR === 0;
    lines.push(
      <line
        key={`gv-${gx}`}
        x1={gx}
        y1={0}
        x2={gx}
        y2={FIELD_PIXEL_H}
        stroke={major ? "rgba(80,80,80,0.38)" : "rgba(120,120,120,0.18)"}
        strokeWidth={major ? 1.1 : 0.65}
        pointerEvents="none"
      />,
    );
  }
  for (let gy = 0; gy <= FIELD_PIXEL_H; gy += FIELD_GRID_MINOR) {
    const major = gy % FIELD_GRID_MAJOR === 0;
    lines.push(
      <line
        key={`gh-${gy}`}
        x1={0}
        y1={gy}
        x2={FIELD_PIXEL_W}
        y2={gy}
        stroke={major ? "rgba(80,80,80,0.38)" : "rgba(120,120,120,0.18)"}
        strokeWidth={major ? 1.1 : 0.65}
        pointerEvents="none"
      />,
    );
  }
  return lines;
})();

function Field({ shots, activeShotId, onFieldClick, onHoverShot, besideSidebar = false }: FieldProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{
    px: number;
    py: number;
    canonical: FieldClickCanonical;
  } | null>(null);

  const handleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    const { px, py } = clientToViewBox(el, e.clientX, e.clientY);
    onFieldClick({
      x: clampShotPixel(px, FIELD_PIXEL_W),
      y: viewBoxYToPllY(py),
    });
  };

  const handleMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    const { px, py } = clientToViewBox(el, e.clientX, e.clientY);
    setHoverCoord({
      px,
      py,
      canonical: {
        x: clampShotPixel(px, FIELD_PIXEL_W),
        y: viewBoxYToPllY(py),
      },
    });
  };

  const shotMarkerR = (active: boolean) => (active ? 14 : 9);

  return (
    <div className={`w-full max-w-full ${besideSidebar ? "" : "flex justify-center"}`}>
      <div className={`relative ${besideSidebar ? "w-full" : "w-full max-w-full"}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${FIELD_PIXEL_W} ${FIELD_PIXEL_H}`}
          preserveAspectRatio="xMidYMid meet"
          className={
            besideSidebar
              ? "block h-auto w-full max-h-[min(56vh,90dvh)] cursor-crosshair rounded-md"
              : "mx-auto block h-auto w-full max-h-[min(58vh,88dvh)] max-w-[min(100%,calc(min(58vh,88dvh)*2000/2149))] cursor-crosshair rounded-md"
          }
          onClick={handleClick}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverCoord(null)}
        >
        <image
          href={fieldGraphicUrl}
          x={0}
          y={0}
          width={FIELD_PIXEL_W}
          height={FIELD_PIXEL_H}
          preserveAspectRatio="none"
        />
        <g className="pointer-events-none">{fieldGridLines}</g>

        {shots
          .filter((s) => s.x !== null && s.y !== null)
          .map((s) => {
            const isActive = s.shot_id === activeShotId;
            const color =
              s.result === "GOAL" ? "#22c55e" : s.result === "SAVE" ? "#eab308" : "#ef4444";
            return (
              <g
                key={s.shot_id}
                onMouseEnter={() => onHoverShot(s)}
                onMouseLeave={() => onHoverShot(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={s.x!}
                  cy={pllYToViewBoxY(s.y!)}
                  r={shotMarkerR(isActive)}
                  fill={color}
                  stroke={isActive ? "#0a2540" : "#ffffff"}
                  strokeWidth={isActive ? 3 : 2}
                  opacity={isActive ? 1 : 0.88}
                />
              </g>
            );
          })}

        {hoverCoord && (
          <>
            <line
              x1={hoverCoord.px}
              y1={0}
              x2={hoverCoord.px}
              y2={FIELD_PIXEL_H}
              stroke="#0a2540"
              strokeWidth={1.25}
              opacity={0.45}
              pointerEvents="none"
            />
            <line
              x1={0}
              y1={hoverCoord.py}
              x2={FIELD_PIXEL_W}
              y2={hoverCoord.py}
              stroke="#0a2540"
              strokeWidth={1.25}
              opacity={0.45}
              pointerEvents="none"
            />
          </>
        )}
      </svg>
      {hoverCoord && (() => {
        const { x, y } = hoverCoord.canonical;
        return (
          <div className="pointer-events-none absolute top-1 right-1 z-10 whitespace-nowrap rounded-md bg-black px-2.5 py-1.5 font-mono text-[11px] leading-tight shadow-lg ring-1 ring-white/15">
            <span className="text-zinc-100">
              {x},{y}
            </span>{" "}
            <span className="text-zinc-500">·</span>{" "}
            <span className="text-amber-400">{pllShotDistanceYards(x, y).toFixed(1)}yd</span>
          </div>
        );
      })()}
    </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Goal plane
// ─────────────────────────────────────────────────────────────────────────────

interface GoalPlanePickerProps {
  netX: number | null;
  netY: number | null;
  onGoal: boolean;
  onGoalClick: (p: { net_x: number; net_y: number }) => void;
  /** When false, net/miss plane is display-only (e.g. net pick only on GOAL) */
  interactive?: boolean;
}

function GoalPlanePicker({
  netX,
  netY,
  onGoalClick,
  onGoal,
  interactive = true,
}: GoalPlanePickerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const VB = onGoal
    ? { w: 72, h: 72, goalX: 0, goalY: 0 }
    : { w: 144, h: 108, goalX: 36, goalY: 18 };

  const handleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const el = svgRef.current;
    if (!el) return;
    const pt = el.getBoundingClientRect();
    const svgX = ((e.clientX - pt.left) / pt.width) * VB.w;
    const svgY = ((e.clientY - pt.top) / pt.height) * VB.h;
    const goalRelX = svgX - VB.goalX;
    const goalRelY = VB.h - svgY - VB.goalY;
    onGoalClick({ net_x: +goalRelX.toFixed(1), net_y: +goalRelY.toFixed(1) });
  };

  const dotSvgX = netX !== null ? netX + VB.goalX : null;
  const dotSvgY = netX !== null ? VB.h - (netY! + VB.goalY) : null;

  const missInsideGoal =
    !onGoal &&
    netX !== null &&
    netY !== null &&
    netX >= 0 &&
    netX <= 72 &&
    netY >= 0 &&
    netY <= 72;

  return (
    <div
      className={`relative w-full ${!interactive ? "opacity-55" : ""}`}
      style={{ aspectRatio: `${VB.w}/${VB.h}` }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB.w} ${VB.h}`}
        className="w-full h-full rounded"
        style={{
          background: onGoal ? "#1a1a1a" : "#0a0a0a",
          cursor: interactive ? "crosshair" : "not-allowed",
        }}
        onClick={handleClick}
      >
        <defs>
          <pattern id="mesh" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M 0 0 L 4 0 M 0 0 L 0 4" stroke="#3a3a3a" strokeWidth="0.3" />
          </pattern>
        </defs>

        <rect x={VB.goalX + 2} y={VB.goalY + 2} width={68} height={68} fill="url(#mesh)" />

        {!onGoal && (
          <g opacity="0.25">
            {[...Array(13)].map((_, i) => (
              <g key={i}>
                <line
                  x1={i * 12}
                  y1={VB.h - VB.goalY}
                  x2={i * 12}
                  y2={VB.h - VB.goalY - 2}
                  stroke="#fff"
                  strokeWidth="0.2"
                />
              </g>
            ))}
          </g>
        )}

        <rect
          x={VB.goalX + 2}
          y={VB.goalY + 2}
          width={68}
          height={68}
          fill="none"
          stroke="#ff4d4d"
          strokeWidth="1.5"
        />

        {[1, 2].map((i) => (
          <g key={i} opacity="0.15">
            <line
              x1={VB.goalX + 2 + (68 / 3) * i}
              y1={VB.goalY + 2}
              x2={VB.goalX + 2 + (68 / 3) * i}
              y2={VB.goalY + 70}
              stroke="#fff"
              strokeWidth="0.2"
            />
            <line
              x1={VB.goalX + 2}
              y1={VB.goalY + 2 + (68 / 3) * i}
              x2={VB.goalX + 70}
              y2={VB.goalY + 2 + (68 / 3) * i}
              stroke="#fff"
              strokeWidth="0.2"
            />
          </g>
        ))}

        {netX !== null && dotSvgX !== null && dotSvgY !== null && (
          <g>
            <circle
              cx={dotSvgX}
              cy={dotSvgY}
              r={onGoal ? 2.5 : 3}
              fill={onGoal ? "#22ff88" : "#ff4d4d"}
              stroke="#fff"
              strokeWidth="0.5"
            />
          </g>
        )}
      </svg>
      {!interactive && onGoal && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-black/40">
          <span className="text-[8px] font-mono text-zinc-400 text-center px-1">Goals only</span>
        </div>
      )}
      {missInsideGoal && (
        <div className="mt-1 text-[10px] font-mono text-amber-500 flex items-center gap-1">
          <AlertCircle size={10} /> marked inside goal but result is miss — re-click outside frame
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Arm angle
// ─────────────────────────────────────────────────────────────────────────────

/** 60° bands: [0,60) under, [60,120) side, [120,180] over */
const ARM_ANGLE_BUCKETS: { v: ArmAngleBucket; l: string; min: number; max: number }[] = [
  { v: "underhand", l: "UNDER", min: 0, max: 60 },
  { v: "sidearm", l: "SIDE", min: 60, max: 120 },
  { v: "overhand", l: "OVER", min: 120, max: 181 },
];

function bucketFromDegrees(deg: number): (typeof ARM_ANGLE_BUCKETS)[number] {
  const d = Math.max(0, Math.min(180, deg));
  const b = ARM_ANGLE_BUCKETS.find((bk) => d >= bk.min && d < bk.max);
  return b ?? ARM_ANGLE_BUCKETS[ARM_ANGLE_BUCKETS.length - 1];
}

function computeNormalizedPoints(s: Shot, act: string): 0 | 1 | 2 {
  if (act === "TO" || !s.result || s.result !== "GOAL") return 0;
  const p = s.points;
  if (p === 1 || p === 2) return p;
  return 1;
}

/** Map removed buckets + strip net coords on misses (Saves/Goals keep net pick). */
function normalizeLoadedShot(s: Shot): Shot {
  const deg = s.arm_angle_degrees;
  let arm_angle: Shot["arm_angle"] = null;
  if (deg != null) arm_angle = bucketFromDegrees(deg).v;
  else {
    const a = s.arm_angle as string | null;
    if (a === "quarter") arm_angle = "sidearm";
    else if (a === "three_quarter") arm_angle = "overhand";
    else if (a === "underhand" || a === "sidearm" || a === "overhand") arm_angle = a;
  }
  const stripNet = (s.result ?? "MISS") === "MISS";
  const rawAct = s.act && s.act !== "" ? s.act : "SH";
  const act = rawAct === "Shot" ? "SH" : rawAct;
  const points: 0 | 1 | 2 = computeNormalizedPoints(s, act);
  return {
    ...s,
    act,
    points,
    result: s.result === undefined || s.result === null ? (act === "TO" ? null : "MISS") : s.result,
    arm_angle,
    net_x: stripNet ? null : s.net_x,
    net_y: stripNet ? null : s.net_y,
  };
}

interface ArmAnglePickerProps {
  degrees: number | null;
  hand: "L" | "R";
  onChange: (deg: number | null) => void;
  compact?: boolean;
  /** Narrow vertical stack beside the field */
  sidebar?: boolean;
}

function ArmAnglePicker({ degrees, hand, onChange, compact = false, sidebar = false }: ArmAnglePickerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Horizontal stick / touch mapping: L = +x, R = −x (swapped vs an earlier convention). */
  const armSideDir = hand === "L" ? 1 : -1;

  const PIVOT = { x: 100, y: 100 };
  const CIRCLE_R = 56;
  const STICK_LEN = 54;
  const LBL_R = CIRCLE_R + 8;

  const currentDeg = degrees ?? 90;

  const angleToPoint = useCallback(
    (deg: number) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return {
        x: PIVOT.x + Math.cos(rad) * STICK_LEN * armSideDir,
        y: PIVOT.y - Math.sin(rad) * STICK_LEN,
      };
    },
    [armSideDir],
  );

  const circleAngleToPoint = useCallback(
    (deg: number, r = CIRCLE_R) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return {
        x: PIVOT.x + Math.cos(rad) * r * armSideDir,
        y: PIVOT.y - Math.sin(rad) * r,
      };
    },
    [armSideDir],
  );

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = svgRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * 200;
      const svgY = ((clientY - rect.top) / rect.height) * 200;
      const dxRaw = svgX - PIVOT.x;
      const dy = PIVOT.y - svgY;
      const dx = armSideDir * dxRaw;
      let deg = (Math.atan2(dy, dx) + Math.PI / 2) * (180 / Math.PI);
      deg = Math.max(0, Math.min(180, deg));
      onChange(Math.round(deg));
    },
    [onChange, armSideDir],
  );

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    setDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => updateFromPointer(e.clientX, e.clientY);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, updateFromPointer]);

  const tip = angleToPoint(currentDeg);

  const xDir = armSideDir;
  const radFromAxis = ((currentDeg - 90) * Math.PI) / 180;
  const stickDX = Math.cos(radFromAxis) * xDir;
  const stickDY = -Math.sin(radFromAxis);
  const perpDX = -stickDY * xDir;
  const perpDY = stickDX * xDir;

  const rotate = (lx: number, ly: number) => ({
    x: tip.x + lx * perpDX + ly * stickDX,
    y: tip.y + lx * perpDY + ly * stickDY,
  });

  const hs = 0.78;
  const headPoints = [
    rotate(-2.5 * hs, 0),
    rotate(-5.5 * hs, 7 * hs),
    rotate(-4 * hs, 16 * hs),
    rotate(0, 19 * hs),
    rotate(4 * hs, 16 * hs),
    rotate(5.5 * hs, 7 * hs),
    rotate(2.5 * hs, 0),
  ]
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  const pocketPoints = [
    rotate(-3 * hs, 3 * hs),
    rotate(-3 * hs, 13 * hs),
    rotate(0, 15 * hs),
    rotate(3 * hs, 13 * hs),
    rotate(3 * hs, 3 * hs),
  ]
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  const activeBucket =
    degrees !== null && degrees !== undefined ? bucketFromDegrees(degrees).v : null;

  const dashArcForBucket = (b: (typeof ARM_ANGLE_BUCKETS)[number]) => {
    const start = circleAngleToPoint(b.min);
    const end = circleAngleToPoint(b.max);
    const sweep = hand === "L" ? 0 : 1;
    return `M ${start.x} ${start.y} A ${CIRCLE_R} ${CIRCLE_R} 0 0 ${sweep} ${end.x} ${end.y}`;
  };

  const isSidebar = sidebar;
  const svgMaxH = isSidebar ? 168 : compact ? 118 : 220;

  return (
    <div
      className={
        isSidebar
          ? "flex flex-col items-center gap-0.5 w-full min-w-0"
          : `flex items-center ${compact ? "gap-2" : "gap-3"}`
      }
    >
      <div
        className={
          isSidebar
            ? "w-full relative shrink-0"
            : `relative ${compact ? "flex-[2] max-w-[7.5rem]" : "flex-[3]"}`
        }
      >
        <svg
          ref={svgRef}
          viewBox="0 0 200 200"
          className="w-full h-auto select-none"
          style={{
            touchAction: "none",
            cursor: dragging ? "grabbing" : "grab",
            maxHeight: svgMaxH,
          }}
          onPointerDown={handlePointerDown}
        >
          <circle cx={PIVOT.x} cy={PIVOT.y} r={CIRCLE_R} fill="none" stroke="#27272a" strokeWidth="1.2" />

          {ARM_ANGLE_BUCKETS.map((b) => {
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

          {[0, 60, 120, 180].map((deg) => {
            const inner = circleAngleToPoint(deg, CIRCLE_R);
            const outer = circleAngleToPoint(deg, CIRCLE_R + 3);
            return (
              <line
                key={deg}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#71717a"
                strokeWidth="1"
              />
            );
          })}

          {ARM_ANGLE_BUCKETS.map((b) => {
            const midDeg = b.v === "underhand" ? 30 : b.v === "sidearm" ? 90 : 150;
            const p = circleAngleToPoint(midDeg, LBL_R);
            const isActive = activeBucket === b.v;
            return (
              <text
                key={b.v}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="5"
                fontFamily="ui-monospace, monospace"
                fontWeight="700"
                fill={isActive ? "#f59e0b" : "#52525b"}
              >
                {b.l}
              </text>
            );
          })}

          <line
            x1={PIVOT.x}
            y1={PIVOT.y}
            x2={tip.x}
            y2={tip.y}
            stroke={degrees === null ? "#71717a" : "#e4e4e7"}
            strokeWidth="2.6"
            strokeLinecap="round"
          />

          <polygon
            points={headPoints}
            fill={degrees === null ? "#52525b" : "#f59e0b"}
            stroke={degrees === null ? "#71717a" : "#fbbf24"}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon points={pocketPoints} fill={degrees === null ? "#3f3f46" : "#78350f"} opacity="0.7" />

          <circle cx={PIVOT.x} cy={PIVOT.y} r={2.2} fill="#e4e4e7" />
        </svg>
      </div>

      <div
        className={
          isSidebar
            ? "flex flex-col items-center text-center w-full min-w-0 gap-px"
            : "flex-[1] flex flex-col justify-center items-start min-w-0 gap-0.5"
        }
      >
        {degrees !== null && degrees !== undefined ? (
          <>
            <div
              className={`font-black text-amber-500 font-mono leading-none ${
                isSidebar ? "text-[10px]" : compact ? "text-sm" : "text-base"
              }`}
            >
              {degrees}°
            </div>
            <div
              className={`text-zinc-500 font-mono uppercase tracking-wide ${
                isSidebar ? "text-[6px] leading-none" : compact ? "text-[7px] leading-tight" : "text-[9px]"
              }`}
            >
              {bucketFromDegrees(degrees).l}
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              className={`font-mono text-zinc-500 hover:text-zinc-300 ${isSidebar ? "text-center text-[6px]" : "text-left"} ${
                compact ? "text-[7px]" : "text-[9px]"
              }`}
            >
              clr
            </button>
          </>
        ) : (
          <div
            className={`text-zinc-500 leading-tight ${isSidebar ? "text-[6px]" : compact ? "text-[8px]" : "text-[10px]"}`}
          >
            drag
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Player picker — position sort orders (PLL-style abbreviations)
// ─────────────────────────────────────────────────────────────────────────────

const DEFENDER_POSITION_ORDER = ["D", "LSM", "SSDM", "M", "FO", "G", "A"] as const;
const SECOND_ASSIST_POSITION_ORDER = ["A", "M", "SSDM", "FO", "LSM", "D", "G"] as const;

function canonicalPositionCode(raw: string): string {
  const p = raw.trim().toUpperCase();
  if (!p) return "";
  if (p === "GK" || p.startsWith("GK")) return "G";
  if (p.includes("LSM")) return "LSM";
  if (p.includes("SSDM") || p === "SSD") return "SSDM";
  if (p.includes("FO") || p.includes("FACE")) return "FO";
  if (p === "G" || p.includes("GOALKEEP")) return "G";
  if (p === "D" || p.includes("DEFEN")) return "D";
  if (p === "M" || p.includes("MID")) return "M";
  if (p === "A" || p.includes("ATT")) return "A";
  return p;
}

function positionRankForOrder(canonical: string, order: readonly string[]): number {
  const idx = (order as readonly string[]).indexOf(canonical);
  if (idx >= 0) return idx;
  return 100 + canonical.charCodeAt(0);
}

function sortPlayersByPositionOrder(players: Player[], order: readonly string[]): Player[] {
  return [...players].sort((a, b) => {
    const ra = positionRankForOrder(canonicalPositionCode(a.position), order);
    const rb = positionRankForOrder(canonicalPositionCode(b.position), order);
    if (ra !== rb) return ra - rb;
    return a.number - b.number || a.name.localeCompare(b.name);
  });
}

interface PlayerPickerProps {
  label: string;
  roster: Player[];
  /** Controls roster sort order in the dropdown */
  positionOrder: readonly string[];
  noneLabel: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  icon: LucideIcon;
  accentColor: string;
  disabled?: boolean;
  disabledHint?: string;
  /** Tighter trigger for half-tab / small viewports */
  compact?: boolean;
  /** Minimal trigger + narrow list (single tracker row) */
  micro?: boolean;
}

function PlayerThumb({
  p,
  accentColor,
  sizeClass,
  textClass = "text-xl",
}: {
  p: Player;
  accentColor: string;
  sizeClass: string;
  /** Jersey fallback glyph size inside the circle */
  textClass?: string;
}) {
  return p.headshot_url ? (
    <img src={p.headshot_url} alt="" className={`${sizeClass} shrink-0 rounded object-cover`} />
  ) : (
    <div
      className={`${sizeClass} shrink-0 rounded flex items-center justify-center font-bold ${textClass}`}
      style={{ background: accentColor, color: "#000" }}
    >
      {p.number}
    </div>
  );
}

function PlayerAvatarNameBlock({
  player,
  fallbackName,
  accentColor,
  avatarClass,
  avatarTextClass,
  nameClassName,
  subLine,
  dense = false,
}: {
  player: Player | null;
  fallbackName: string;
  accentColor: string;
  avatarClass: string;
  avatarTextClass?: string;
  nameClassName: string;
  subLine?: ReactNode;
  dense?: boolean;
}) {
  const name = player?.name?.trim() || fallbackName;
  const num =
    player != null && typeof player.number === "number" && player.number > 0 ? player.number : null;

  return (
    <div className={`flex items-center min-w-0 ${dense ? "gap-1" : "gap-3"}`}>
      {player ? (
        <PlayerThumb
          p={player}
          accentColor={accentColor}
          sizeClass={avatarClass}
          textClass={avatarTextClass ?? "text-xl"}
        />
      ) : (
        <div
          className={`${avatarClass} shrink-0 rounded bg-zinc-800 flex items-center justify-center font-mono font-bold text-zinc-500`}
        >
          —
        </div>
      )}
      <div className="min-w-0">
        <div className={`flex items-baseline gap-2 min-w-0 ${nameClassName}`}>
          <span className="font-mono text-zinc-400 shrink-0">#{num ?? "—"}</span>
          <span className="truncate">{name}</span>
        </div>
        {subLine}
      </div>
    </div>
  );
}

function PlayerPicker({
  label,
  roster,
  positionOrder,
  noneLabel,
  selectedId,
  onSelect,
  icon: Icon,
  accentColor,
  disabled = false,
  disabledHint = "",
  compact = false,
  micro = false,
}: PlayerPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const sortedRoster = useMemo(() => sortPlayersByPositionOrder(roster, positionOrder), [roster, positionOrder]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedRoster;
    return sortedRoster.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.number).includes(query.trim()) ||
        p.position.toLowerCase().includes(q),
    );
  }, [query, sortedRoster]);

  const selectedPlayer =
    selectedId && !isTrackerNoPlayerId(selectedId) ? roster.find((p) => p.player_id === selectedId) : undefined;
  const selectedNone = isTrackerNoPlayerId(selectedId);

  const triggerBody = () => {
    if (selectedPlayer) {
      return (
        <PlayerAvatarNameBlock
          dense={micro}
          player={selectedPlayer}
          fallbackName=""
          accentColor={accentColor}
          avatarClass={micro ? "w-6 h-6" : compact ? "w-9 h-9" : "w-14 h-14"}
          avatarTextClass={micro ? "text-[10px]" : compact ? "text-sm" : "text-2xl"}
          nameClassName={
            micro
              ? "text-[9px] font-semibold text-zinc-100 leading-tight"
              : compact
                ? "text-[11px] font-semibold text-zinc-100"
                : "text-sm font-semibold text-zinc-100"
          }
          subLine={
            micro ? undefined : (
            <div
              className={`${compact ? "text-[8px] mt-0" : "text-[10px] mt-0.5"} text-zinc-500 font-mono truncate`}
            >
              {selectedPlayer.position} · {selectedPlayer.team}
              {selectedPlayer.handedness ? ` · ${selectedPlayer.handedness}H` : ""}
            </div>
            )
          }
        />
      );
    }
    if (selectedNone) {
      return (
        <div className={`flex items-center ${micro ? "gap-1" : compact ? "gap-2" : "gap-3"} py-0.5`}>
          <div
            className={`${micro ? "w-6 h-6 text-[7px]" : compact ? "w-9 h-9 text-[8px]" : "w-14 h-14 text-[10px]"} shrink-0 rounded border-2 border-dashed border-zinc-600 bg-zinc-950 flex items-center justify-center font-mono font-bold text-zinc-500 uppercase tracking-wider text-center px-0.5 leading-tight`}
          >
            —
          </div>
          <div className="min-w-0">
            <div
              className={
                micro
                  ? "text-[8px] font-semibold text-zinc-200 truncate leading-tight"
                  : compact
                    ? "text-[11px] font-semibold text-zinc-200 truncate"
                    : "text-sm font-semibold text-zinc-200"
              }
            >
              {noneLabel}
            </div>
            {!micro && (
              <div className={`${compact ? "text-[8px]" : "text-[10px]"} text-zinc-500 font-mono mt-0.5`}>
                No player
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <div
        className={`text-amber-500/95 ${micro ? "text-[8px] py-0.5 leading-tight" : compact ? "text-[11px] py-1" : "text-sm py-2"} px-0.5 font-medium`}
      >
        {micro ? "Pick…" : (
          <>Tap to choose… <span className="text-zinc-400 font-normal">“{noneLabel}”</span></>
        )}
      </div>
    );
  };

  return (
    <div className={`relative min-w-0 ${disabled ? "opacity-60" : ""}`}>
      <label
        className={`${micro ? "text-[7px] mb-px leading-none" : compact ? "text-[8px] mb-0.5" : "text-[10px] mb-1"} uppercase tracking-wide text-zinc-500 font-mono flex items-center gap-0.5`}
      >
        <Icon size={micro ? 7 : compact ? 8 : 10} /> {label}
      </label>
      {disabled && disabledHint ? (
        <div className={`${micro ? "text-[6px] leading-tight" : compact ? "text-[8px]" : "text-[10px]"} text-zinc-600 font-mono mb-0.5 line-clamp-2`}>
          {disabledHint}
        </div>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={`w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 disabled:hover:border-zinc-800 rounded flex items-center text-left transition-colors ${
          micro ? "px-1 py-0.5 gap-1" : compact ? "px-1.5 py-1 gap-2" : "px-2 py-2 gap-3"
        }`}
      >
        {triggerBody()}
      </button>

      {!disabled && open && (
        <div
          className={`absolute z-30 mt-0.5 ${micro ? "w-[min(13.5rem,calc(100vw-0.5rem))]" : "w-[22rem] max-w-[calc(100vw-2rem)]"} bg-zinc-900 border border-zinc-700 rounded shadow-2xl p-1.5 ${micro ? "left-0 right-auto" : ""}`}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className={`w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-zinc-100 font-mono mb-1.5 ${micro ? "text-[11px]" : "text-sm"}`}
          />
          <button
            type="button"
            onClick={() => {
              onSelect(TRACKER_NO_PLAYER_ID);
              setOpen(false);
              setQuery("");
            }}
            className={`w-full mb-1.5 text-left rounded-md bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-medium ${micro ? "px-2 py-1.5 text-[11px]" : "px-3 py-2.5 text-sm"}`}
          >
            {noneLabel}
          </button>
          <div className="max-h-[min(55vh,22rem)] overflow-y-auto pr-0.5 border-t border-zinc-800 pt-1.5">
            {selectedId !== null && selectedId !== undefined && selectedId !== "" && (
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full text-left text-zinc-500 hover:bg-zinc-800 rounded border-b border-zinc-800 mb-1 ${micro ? "px-1.5 py-1 text-[10px]" : "px-2 py-2 text-xs"}`}
              >
                × Clear
              </button>
            )}
            {filtered.map((p) => (
              <button
                type="button"
                key={p.player_id}
                onClick={() => {
                  onSelect(p.player_id);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full flex items-center hover:bg-zinc-800 rounded text-left border-b border-zinc-800/80 last:border-0 ${micro ? "px-1 py-1 gap-2" : "px-2 py-2 gap-3"}`}
              >
                <PlayerThumb
                  p={p}
                  accentColor={accentColor}
                  sizeClass={micro ? "w-9 h-9" : "w-16 h-16"}
                  textClass={micro ? "text-sm" : "text-2xl"}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={`font-semibold text-zinc-100 leading-tight flex items-baseline gap-1.5 ${micro ? "text-[11px]" : "text-base"}`}
                  >
                    <span className="font-mono text-amber-500/90 shrink-0">#{p.number}</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                  <div className={`text-zinc-500 font-mono ${micro ? "text-[9px] mt-0.5" : "text-[11px] mt-1"}`}>
                    {p.position}
                  </div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className={`text-zinc-600 font-mono py-4 text-center ${micro ? "text-[10px]" : "text-xs"}`}>
                No match
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultBadge({ result, compact = false }: { result: ShotResult; compact?: boolean }) {
  const colors =
    (
      {
        GOAL: { bg: "#22c55e", text: "#000" },
        SAVE: { bg: "#eab308", text: "#000" },
        MISS: { bg: "#ef4444", text: "#fff" },
      } as const
    )[result] ?? { bg: "#52525b", text: "#fff" };
  return (
    <div
      className={`font-black font-mono rounded tracking-widest ${
        compact ? "text-[8px] px-1.5 py-0" : "text-[10px] px-2 py-0.5"
      }`}
      style={{ background: colors.bg, color: colors.text }}
    >
      {result}
    </div>
  );
}

function ShotChecklist({ shot, compact = false }: { shot: Shot; compact?: boolean }) {
  const items = [
    { label: "Location", done: shot.x !== null },
    { label: "Defender", done: isDefenderChoiceComplete(shot) },
    ...(shot.first_assist
      ? [{ label: "2nd ast", done: isSecondAssistChoiceComplete(shot) }]
      : []),
    { label: "Clock", done: shot.shot_clock !== null },
    { label: "Bounce", done: shot.bounce_shot !== null },
    { label: "Arm", done: shot.arm_angle !== null },
    { label: (shot.result ?? "MISS") === "MISS" ? "Miss" : "Net Location", done: shot.net_x !== null },
  ];
  return (
    <div className={`bg-zinc-950 border border-zinc-800 rounded h-full ${compact ? "p-1.5" : "p-2"}`}>
      <div className={`uppercase tracking-wider text-zinc-500 font-mono mb-1 ${compact ? "text-[8px]" : "text-[10px]"}`}>
        STATUS
      </div>
      <div className={`grid grid-cols-2 ${compact ? "gap-x-1 gap-y-0.5" : "gap-x-2 gap-y-1"}`}>
        {items.map((it) => (
          <div key={it.label} className={`flex items-center gap-0.5 ${compact ? "text-[8px]" : "text-[10px]"}`}>
            {it.done ? (
              <Check size={compact ? 8 : 10} className="text-green-500 shrink-0" />
            ) : (
              <Circle size={compact ? 8 : 10} className="text-zinc-700 shrink-0" />
            )}
            <span className={it.done ? "text-zinc-300" : "text-zinc-500"}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main app
// ─────────────────────────────────────────────────────────────────────────────

function formatQtr(qtr: Shot["qtr"]): string {
  return `Q${qtr}`;
}

/** PLL regulation quarter length; feed `game_clock` is time remaining. */
const REGULATION_QUARTER_SECONDS = 12 * 60;

function parseGameClockToSeconds(clock: string): number | null {
  const t = clock.trim();
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length !== 2) return null;
  const m = Number(parts[0]);
  const s = Number(parts[1]);
  if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || s >= 60) return null;
  return Math.floor(m * 60 + s);
}

/**
 * Show elapsed time in the quarter (0:00–12:00): 12:00 − time remaining from feed.
 * OT (Q5) is left as-is (period length varies).
 */
function displayGameClockElapsedFrom12(clock: string, qtr: Shot["qtr"]): string {
  if (qtr === 5) return clock;
  const remaining = parseGameClockToSeconds(clock);
  if (remaining === null) return clock;
  const elapsed = REGULATION_QUARTER_SECONDS - remaining;
  if (elapsed < 0 || elapsed > REGULATION_QUARTER_SECONDS) return clock;
  const em = Math.floor(elapsed / 60);
  const es = elapsed % 60;
  return `${em}:${String(es).padStart(2, "0")}`;
}

interface ApiMatchRow {
  match_id: string;
  game_number: number;
  week: number | null;
  date: string | null;
  home: string | null;
  away: string | null;
  market: string | null;
}

const MIN_PICKER_SEASON = 2019;

function pickerSeasonYears(): number[] {
  const maxY = new Date().getFullYear();
  const years: number[] = [];
  for (let y = maxY; y >= MIN_PICKER_SEASON; y--) years.push(y);
  return years;
}

export default function App() {
  const { matchId } = useParams<{ matchId?: string }>();
  const navigate = useNavigate();
  const gameId = matchId ?? "";

  const [game, setGame] = useState<Game | null>(null);
  const [rosters, setRosters] = useState<Record<string, Player[]>>({});
  const [shots, setShots] = useState<Shot[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [hoverShot, setHoverShot] = useState<Shot | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [metricFlow, setMetricFlow] = useState<unknown | null>(null);
  const [pickerGames, setPickerGames] = useState<ApiMatchRow[]>([]);
  const [pickerSeason, setPickerSeason] = useState(() => new Date().getFullYear());
  const [pickerLeague, setPickerLeague] = useState<GameListLeague>("pll_regular");
  const [pickerLoading, setPickerLoading] = useState(false);

  const seasonYearOptions = useMemo(() => pickerSeasonYears(), []);

  useEffect(() => {
    setPickerLoading(true);
    setPickerGames([]);
    API.listGames(pickerSeason, pickerLeague)
      .then((res) => setPickerGames(res.matches as ApiMatchRow[]))
      .catch(console.error)
      .finally(() => setPickerLoading(false));
  }, [pickerSeason, pickerLeague]);

  useEffect(() => {
    if (!gameId) {
      setGame(null);
      setShots([]);
      setRosters({});
      setActiveIdx(0);
      setHoverShot(null);
      setLoading(false);
      setLastSaved(null);
      setMetricFlow(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await API.loadGame(gameId);
        if (cancelled) return;
        setGame(data.game);
        setMetricFlow(data.metric_flow ?? null);
        setRosters({
          [data.rosters.home.team]: data.rosters.home.players,
          [data.rosters.away.team]: data.rosters.away.players,
        });
        const cached = Storage.loadShots(gameId);
        const cachedState = Storage.loadState(gameId);
        const freshByShotId = new Map(data.shots.map((s) => [s.shot_id, s]));
        const rawList = cached ?? data.shots;
        const gn = data.game.game_number;
        const list = rawList.map((s) => {
          const fresh = freshByShotId.get(s.shot_id);
          const merged = fresh ? { ...s, shooter_dominant_hand: fresh.shooter_dominant_hand } : s;
          return { ...merged, game_number: gn };
        });
        const normalized = list.map(normalizeLoadedShot);
        const prevActiveId =
          cachedState != null &&
          cachedState.active_idx >= 0 &&
          cachedState.active_idx < normalized.length
            ? normalized[cachedState.active_idx]?.shot_id
            : null;
        const sorted = sortShotsChronologically(normalized);
        setShots(sorted);
        if (prevActiveId) {
          const ni = sorted.findIndex((x) => x.shot_id === prevActiveId);
          setActiveIdx(ni >= 0 ? ni : 0);
        } else {
          setActiveIdx(0);
        }
      } catch (err) {
        console.error("Failed to load game:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId || shots.length === 0) return;
    const t = setTimeout(() => {
      Storage.saveShots(gameId, shots);
      Storage.saveState(gameId, { active_idx: activeIdx, last_modified: Date.now() });
      setLastSaved(new Date());
    }, 400);
    return () => clearTimeout(t);
  }, [shots, activeIdx, gameId]);

  useEffect(() => {
    setActiveIdx((i) => {
      if (shots.length === 0) return 0;
      return Math.min(i, shots.length - 1);
    });
  }, [shots.length]);

  const getPlayerByName = useCallback(
    (name: string | null): Player | null => {
      if (!name) return null;
      for (const teamKey of Object.keys(rosters)) {
        const found = rosters[teamKey]?.find((p) => p.name === name);
        if (found) return found;
      }
      return null;
    },
    [rosters],
  );

  const getPlayerById = useCallback(
    (id: string | null | undefined): Player | null => {
      if (!id || isTrackerNoPlayerId(id)) return null;
      const flat = Object.values(rosters).flat() as Player[];
      return flat.find((p) => p.player_id === id) ?? null;
    },
    [rosters],
  );

  const setShotPlayerField = useCallback(
    (
      idField: "closest_defender_id" | "second_assist_id",
      nameField: "closest_defender" | "second_assist",
      playerId: string | null,
    ) => {
      const flat = Object.values(rosters).flat() as Player[];
      const player =
        playerId && !isTrackerNoPlayerId(playerId) ? flat.find((p) => p.player_id === playerId) : null;
      setShots((prev) =>
        prev.map((s, i) =>
          i === activeIdx
            ? {
                ...s,
                [idField]: playerId,
                [nameField]: isTrackerNoPlayerId(playerId) ? null : player?.name ?? null,
              }
            : s,
        ),
      );
    },
    [rosters, activeIdx],
  );

  const activeShot = shots[activeIdx];
  const activeResult: ShotResult = activeShot?.result ?? "MISS";

  useEffect(() => {
    setShots((prev) => {
      const row = prev[activeIdx];
      if (!row?.first_assist && (row?.second_assist_id != null || row?.second_assist != null)) {
        return prev.map((s, i) =>
          i === activeIdx ? { ...s, second_assist_id: null, second_assist: null } : s,
        );
      }
      return prev;
    });
  }, [activeIdx, activeShot?.shot_id, activeShot?.first_assist]);

  const defensiveRoster = useMemo(() => {
    if (!activeShot) return [];
    return rosters[activeShot.opposing_team] ?? [];
  }, [activeShot, rosters]);

  const offensiveRoster = useMemo(() => {
    if (!activeShot) return [];
    return (rosters[activeShot.team] ?? []).filter((p) => p.player_id !== activeShot.shooter_id);
  }, [activeShot, rosters]);

  const updateShot = useCallback(
    (patch: Partial<Shot>) => {
      setShots((prev) => prev.map((s, i) => (i === activeIdx ? { ...s, ...patch } : s)));
    },
    [activeIdx],
  );

  const goPrev = useCallback(() => setActiveIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setActiveIdx((i) => Math.min(shots.length - 1, i + 1)), [shots.length]);
  const goNextUnmarked = useCallback(() => {
    const next = shots.findIndex((s, i) => i > activeIdx && s.x === null);
    if (next >= 0) setActiveIdx(next);
  }, [shots, activeIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "n" || e.key === "N") goNextUnmarked();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, goNextUnmarked]);

  const completion = useMemo(() => {
    const total = shots.length;
    const marked = shots.filter((s) => s.x !== null).length;
    const fullyTracked = shots.filter(
      (s) =>
        s.x !== null &&
        isDefenderChoiceComplete(s) &&
        isSecondAssistChoiceComplete(s) &&
        s.shot_clock !== null,
    ).length;
    return { total, marked, fullyTracked };
  }, [shots]);

  const exportCSV = () => {
    const issues = incompleteShots(shots);
    if (issues.length > 0) {
      const proceed = confirm(
        `${issues.length} shot${issues.length === 1 ? " is" : "s are"} incomplete. Export anyway?`,
      );
      if (!proceed) return;
    }
    if (!game) return;
    downloadCsv(`shots_${gameId}.csv`, buildStatsMasterCsv(game, shots, rosters, metricFlow));
  };

  const gameTitle =
    game != null
      ? `Week ${game.week} · Game ${game.game_number} — ${game.away_team} @ ${game.home_team}`
      : gameId
        ? `Match ${gameId}`
        : "";

  // ── Game picker ─────────────────────────────────────────────────────────
  if (!gameId) {
    const roundLabel = pickerLeague === "champ_series" ? "Round" : "Week";

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0a0a0a",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          color: "#e4e4e7",
        }}
      >
        <div className="fixed top-4 right-4 z-20 flex flex-col items-end gap-2 sm:top-6 sm:right-6">
          <label className="flex flex-col items-end gap-1">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono">Season</span>
            <select
              value={pickerSeason}
              onChange={(e) => setPickerSeason(Number(e.target.value))}
              aria-label="Season year"
              className="bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-100 cursor-pointer hover:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            >
              {seasonYearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono">Competition</span>
            <div
              className="flex rounded-lg border border-zinc-700 overflow-hidden text-[11px] font-medium"
              role="group"
              aria-label="Regular season or Champ Series"
            >
              <button
                type="button"
                onClick={() => setPickerLeague("pll_regular")}
                className={`px-3 py-1.5 transition-colors ${
                  pickerLeague === "pll_regular"
                    ? "bg-amber-600/25 text-amber-400 border-r border-zinc-700"
                    : "bg-zinc-950 text-zinc-400 hover:text-zinc-200 border-r border-zinc-700"
                }`}
              >
                Regular
              </button>
              <button
                type="button"
                onClick={() => setPickerLeague("champ_series")}
                className={`px-3 py-1.5 transition-colors ${
                  pickerLeague === "champ_series"
                    ? "bg-amber-600/25 text-amber-400"
                    : "bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Champ series
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="mb-10 pr-36 sm:pr-44">
            <div className="text-[10px] uppercase tracking-[0.3em] text-amber-500 font-mono mb-3">
              PLL Advanced Stats
            </div>
            <h1 className="text-4xl font-black tracking-tight">Shot Tracker</h1>
            <p className="text-zinc-500 mt-2 text-sm">
              Select a game to begin tracking. Shot metadata loads automatically from Champion Data.
            </p>
            <p className="text-zinc-600 mt-1 text-xs font-mono">
              {pickerSeason} · {pickerLeague === "champ_series" ? "Champ Series" : "Regular season"}
            </p>
          </div>
          <div className="space-y-2">
            {pickerLoading ? (
              <p className="text-sm text-zinc-500 font-mono py-8 text-center border border-dashed border-zinc-800 rounded-md animate-pulse">
                Loading schedule…
              </p>
            ) : pickerGames.length === 0 ? (
              <p className="text-sm text-zinc-500 font-mono py-8 text-center border border-dashed border-zinc-800 rounded-md">
                No matches in Champion Data for this season and competition.
              </p>
            ) : (
              pickerGames.map((g) => (
                <button
                  key={g.match_id}
                  type="button"
                  onClick={() => navigate(`/game/${g.match_id}`)}
                  className="w-full text-left bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 rounded-md px-4 py-3 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-mono text-zinc-500">
                        #{g.game_number} · {g.date ?? "—"} · {roundLabel} {g.week ?? "?"}
                      </div>
                      <div className="text-sm font-semibold mt-0.5">
                        {roundLabel} {g.week ?? "?"} — {g.away ?? "?"} @ {g.home ?? "?"}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-zinc-600 group-hover:text-amber-500 shrink-0" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e4e4e7" }}
        className="flex items-center justify-center font-mono text-xs"
      >
        Loading game data from Champion Data…
      </div>
    );
  }

  if (!loading && shots.length === 0) {
    return (
      <div
        style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e4e4e7" }}
        className="flex flex-col items-center justify-center gap-4 font-mono text-sm px-6 text-center"
      >
        <p>No shot events for this match.</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-xs text-amber-500 hover:text-amber-400"
        >
          ← Back to games
        </button>
      </div>
    );
  }

  if (!activeShot) {
    return (
      <div
        style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e4e4e7" }}
        className="flex items-center justify-center font-mono text-xs"
      >
        No active shot.
      </div>
    );
  }

  const offTeamColor = teamStyle(activeShot.team);
  const defTeamColor = teamStyle(activeShot.opposing_team);
  const shooterPlayer = getPlayerById(activeShot.shooter_id) ?? getPlayerByName(activeShot.player);
  const assistPlayer =
    activeShot.first_assist_id != null && activeShot.first_assist_id !== ""
      ? getPlayerById(activeShot.first_assist_id)
      : activeShot.first_assist
        ? getPlayerByName(activeShot.first_assist)
        : null;
  /** Play-by-play shot hand only (never roster). Arc defaults to R when unknown. */
  const shotHand = activeShot.shooter_dominant_hand;
  const handForArmArc: "L" | "R" = shotHand ?? "R";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e4e4e7",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="border-b border-zinc-900 pl-0 pr-2 py-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 bg-zinc-950/50">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-[9px] text-zinc-500 hover:text-zinc-300 font-mono shrink-0"
          >
            ← GAMES
          </button>
          <div className="text-[9px] font-mono text-zinc-400 truncate">{gameTitle}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="text-[8px] font-mono text-zinc-500 whitespace-nowrap">
            {completion.marked}/{completion.total} · {completion.fullyTracked}/{completion.total} done
          </div>
          <div className="w-24 sm:w-32 h-0.5 bg-zinc-900 rounded overflow-hidden shrink-0">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${(completion.fullyTracked / completion.total) * 100}%` }}
            />
          </div>
          {lastSaved && (
            <div className="text-[8px] font-mono text-zinc-600 whitespace-nowrap">
              {lastSaved.toLocaleTimeString()}
            </div>
          )}
          <button
            type="button"
            onClick={exportCSV}
            className="text-[9px] bg-amber-500 hover:bg-amber-400 text-black font-semibold px-2 py-1 rounded flex items-center gap-1 shrink-0"
          >
            <Download size={10} /> CSV
          </button>
        </div>
      </div>

      <div
        className="border-b border-zinc-900 bg-gradient-to-r"
        style={{
          backgroundImage: `linear-gradient(90deg, ${offTeamColor.primary}40 0%, transparent 40%, transparent 60%, ${defTeamColor.primary}40 100%)`,
        }}
      >
        <div className="pl-0 pr-2 py-1.5 flex items-center gap-1.5 min-h-0">
          <button
            type="button"
            onClick={goPrev}
            disabled={activeIdx === 0}
            className="p-1 bg-zinc-900 rounded hover:bg-zinc-800 disabled:opacity-30 shrink-0"
          >
            <ChevronLeft size={14} />
          </button>

          <div className="flex-1 flex items-center gap-2 min-w-0 overflow-x-auto">
            <div className="text-[8px] font-mono text-zinc-500 shrink-0">
              {activeIdx + 1}/{shots.length}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <div className="text-[9px] font-mono px-1 py-0.5 bg-zinc-900 rounded text-zinc-300 whitespace-nowrap">
                {formatQtr(activeShot.qtr)} {displayGameClockElapsedFrom12(activeShot.game_clock, activeShot.qtr)}
              </div>
              <ResultBadge result={activeResult} compact />
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <PlayerAvatarNameBlock
                player={shooterPlayer}
                fallbackName={activeShot.player}
                accentColor={offTeamColor.accent}
                avatarClass="w-7 h-7"
                avatarTextClass="text-xs"
                nameClassName="text-[11px] font-bold text-zinc-100 leading-tight"
                subLine={
                  <div className="text-[8px] font-mono text-zinc-500 flex items-center gap-1 flex-wrap mt-px">
                    <span>
                      {activeShot.team} · {activeShot.act} ·{" "}
                      {shotHand ? (
                        <span
                          className="font-bold px-0.5 rounded"
                          style={{
                            background: shotHand === "L" ? "#7c3aed" : "#0284c7",
                            color: "#fff",
                          }}
                        >
                          {shotHand}H
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-mono">—</span>
                      )}
                    </span>
                  </div>
                }
              />
            </div>

            {activeShot.first_assist && (
              <PlayerAvatarNameBlock
                player={assistPlayer}
                fallbackName={activeShot.first_assist}
                accentColor={offTeamColor.accent}
                avatarClass="w-6 h-6"
                avatarTextClass="text-[10px]"
                nameClassName="text-[10px] font-semibold text-zinc-300 leading-tight"
                subLine={<div className="text-[7px] font-mono text-zinc-500 mt-px">1ST AST</div>}
              />
            )}
          </div>

          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={goNextUnmarked}
              className="px-1.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-[8px] font-mono text-zinc-400 rounded whitespace-nowrap"
            >
              NXT (N)
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={activeIdx === shots.length - 1}
              className="p-1 bg-zinc-900 rounded hover:bg-zinc-800 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="pt-2 pb-2 pl-0 pr-2 space-y-2">
        <div className="grid w-full min-w-0 grid-cols-[37.5%_37.5%_25%] gap-x-0.5 gap-y-0 items-end">
          <PlayerPicker
            micro
            label="Closest Defender"
            roster={defensiveRoster}
            positionOrder={DEFENDER_POSITION_ORDER}
            noneLabel="None"
            selectedId={activeShot.closest_defender_id}
            onSelect={(id) => setShotPlayerField("closest_defender_id", "closest_defender", id)}
            icon={Target}
            accentColor={defTeamColor.accent}
          />

          <PlayerPicker
            micro
            label="2nd Assist"
            roster={offensiveRoster}
            positionOrder={SECOND_ASSIST_POSITION_ORDER}
            noneLabel="None"
            selectedId={activeShot.second_assist_id}
            onSelect={(id) => setShotPlayerField("second_assist_id", "second_assist", id)}
            icon={Users}
            accentColor={offTeamColor.accent}
            disabled={!activeShot.first_assist}
            disabledHint="No 1st ast"
          />

          <div className="min-w-0 flex flex-row gap-px h-full">
            <div className="min-w-0 basis-1/2 flex flex-col justify-end">
              <label className="text-[6px] uppercase tracking-wide text-zinc-500 font-mono mb-0 leading-none">
                Shot Clock
              </label>
              <input
                type="number"
                min={0}
                max={60}
                value={activeShot.shot_clock ?? ""}
                onChange={(e) =>
                  updateShot({
                    shot_clock: e.target.value === "" ? null : +e.target.value,
                  })
                }
                placeholder="s"
                className="w-full h-[1.35rem] mt-0.5 bg-zinc-900 border border-zinc-800 rounded px-0.5 text-[10px] font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="min-w-0 basis-1/2 flex flex-col justify-end">
              <label className="text-[6px] uppercase tracking-wide text-zinc-500 font-mono mb-0 leading-none">
                Bounce Shot?
              </label>
              <div className="flex gap-px mt-0.5 h-[1.35rem]">
                <button
                  type="button"
                  onClick={() =>
                    updateShot({ bounce_shot: activeShot.bounce_shot === true ? null : true })
                  }
                  className={`flex-1 min-w-0 text-[9px] font-mono font-bold rounded-sm ${
                    activeShot.bounce_shot === true
                      ? "bg-amber-500 text-black"
                      : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
                  }`}
                >
                  Y
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateShot({ bounce_shot: activeShot.bounce_shot === false ? null : false })
                  }
                  className={`flex-1 min-w-0 text-[9px] font-mono font-bold rounded-sm ${
                    activeShot.bounce_shot === false
                      ? "bg-amber-500 text-black"
                      : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
                  }`}
                >
                  N
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-0.5 w-full min-w-0 items-start">
          <div className="min-w-0 flex-1 flex flex-col">
            <div className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5 flex items-center justify-between gap-2 pr-0.5">
              <span>Field Location</span>
            </div>
            <Field
              besideSidebar
              shots={shots}
              activeShotId={activeShot.shot_id}
              onFieldClick={(c) => updateShot({ x: c.x, y: c.y })}
              onHoverShot={setHoverShot}
            />
          </div>
          <div className="shrink-0 w-[13rem] sm:w-[14.5rem] flex flex-col gap-0.5 min-w-0">
            <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-0.5 min-w-0">
              <div className="text-[8px] uppercase tracking-wider text-amber-500 font-mono mb-0 leading-none px-0.5 pt-0.5">
                Arm Angle
              </div>
              <ArmAnglePicker
                sidebar
                degrees={activeShot.arm_angle_degrees}
                hand={handForArmArc}
                onChange={(deg) =>
                  updateShot({
                    arm_angle_degrees: deg,
                    arm_angle: deg === null ? null : bucketFromDegrees(deg).v,
                  })
                }
              />
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-sm p-0.5 min-w-0 flex flex-col">
              <div className="text-[8px] uppercase tracking-wider text-amber-500 font-mono mb-0 leading-none flex items-start justify-between gap-1 px-0.5 pt-0.5">
                <span className="shrink-0">{activeResult === "MISS" ? "MISS" : "NET LOCATION"}</span>
                <span className="text-[7px] text-zinc-500 font-mono text-right leading-tight line-clamp-2 break-words min-w-0 max-w-[62%]">
                  {netPickRegionLabel(activeShot.net_x, activeShot.net_y, activeResult) ?? "—"}
                </span>
              </div>
              <div className="w-full min-w-0">
                <GoalPlanePicker
                  onGoal={activeResult !== "MISS"}
                  interactive={activeResult !== "MISS"}
                  netX={activeShot.net_x}
                  netY={activeShot.net_y}
                  onGoalClick={({ net_x, net_y }) => updateShot({ net_x, net_y })}
                />
              </div>
              {activeShot.net_x !== null && (
                <div className="mt-0.5 flex items-center justify-between gap-0.5">
                  <div className="text-[7px] font-mono text-zinc-500 truncate">
                    {activeShot.net_x},{activeShot.net_y}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateShot({ net_x: null, net_y: null })}
                    className="text-[7px] font-mono text-zinc-500 hover:text-zinc-300 shrink-0"
                  >
                    clr
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-9 min-w-0">
            <div className="text-[8px] uppercase tracking-wider text-zinc-500 font-mono mb-0.5">TIMELINE</div>
            <div className="flex gap-px h-4">
              {shots.map((s, i) => {
                const complete =
                  s.x !== null &&
                  isDefenderChoiceComplete(s) &&
                  isSecondAssistChoiceComplete(s) &&
                  s.shot_clock !== null;
                const partial = s.x !== null;
                return (
                  <button
                    type="button"
                    key={s.shot_id}
                    onClick={() => setActiveIdx(i)}
                    className="flex-1 min-w-[3px] rounded-sm transition-all hover:opacity-100"
                    style={{
                      background: complete ? "#22c55e" : partial ? "#eab308" : "#3f3f46",
                      opacity: i === activeIdx ? 1 : 0.65,
                      outline: i === activeIdx ? "1px solid #fbbf24" : "none",
                    }}
                    title={`Shot ${i + 1}: #${getPlayerById(s.shooter_id)?.number ?? getPlayerByName(s.player)?.number ?? "—"} ${s.player}`}
                  />
                );
              })}
            </div>
            {hoverShot && hoverShot.shot_id !== activeShot.shot_id && (
              <div className="mt-1.5 text-[9px] font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-amber-400 font-bold shrink-0">{hoverShot.result}</span>
                  <PlayerAvatarNameBlock
                    player={getPlayerById(hoverShot.shooter_id) ?? getPlayerByName(hoverShot.player)}
                    fallbackName={hoverShot.player}
                    accentColor={teamStyle(hoverShot.team).accent}
                    avatarClass="w-7 h-7"
                    avatarTextClass="text-[10px]"
                    nameClassName="text-[10px] font-mono text-zinc-300"
                    subLine={
                      <span className="text-zinc-500">
                        {formatQtr(hoverShot.qtr)} {displayGameClockElapsedFrom12(hoverShot.game_clock, hoverShot.qtr)}
                      </span>
                    }
                  />
                </div>
                {hoverShot.first_assist && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-zinc-500 uppercase shrink-0">From</span>
                    <PlayerAvatarNameBlock
                      player={
                        hoverShot.first_assist_id != null && hoverShot.first_assist_id !== ""
                          ? getPlayerById(hoverShot.first_assist_id)
                          : getPlayerByName(hoverShot.first_assist)
                      }
                      fallbackName={hoverShot.first_assist}
                      accentColor={teamStyle(hoverShot.team).accent}
                      avatarClass="w-6 h-6"
                      avatarTextClass="text-[9px]"
                      nameClassName="text-[10px] font-mono text-zinc-300"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sm:col-span-3 min-w-0">
            <ShotChecklist shot={activeShot} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
