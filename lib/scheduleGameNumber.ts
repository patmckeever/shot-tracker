import type { ChampionScheduleMatchRow } from "./championData";

function parseStartTime(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/** Earliest scheduled match first (same season + competition). */
export function sortMatchesChronologically(matches: ChampionScheduleMatchRow[]): ChampionScheduleMatchRow[] {
  return [...matches].sort((a, b) => {
    const ta = parseStartTime(a.localStartTime);
    const tb = parseStartTime(b.localStartTime);
    if (ta !== tb) return ta - tb;
    return String(a.matchId).localeCompare(String(b.matchId), undefined, { numeric: true });
  });
}

/** 1-based index after chronological sort, or 0 if not found. */
export function gameNumberForMatch(sortedMatches: ChampionScheduleMatchRow[], matchId: string): number {
  const idx = sortedMatches.findIndex((m) => String(m.matchId) === String(matchId));
  return idx >= 0 ? idx + 1 : 0;
}
