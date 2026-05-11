/**
 * Build tracker rosters from Champion match persons + optional PLL Stats enrichment.
 */

import type { Player } from "./types.js";

export interface ChampionPersonRaw {
  personId?: number;
  fullname?: string;
  displayName?: string;
  jerseyNumber?: number;
  positions?: {
    selected?: { code?: string; name?: string };
  };
}

interface ChampionPersonsSide {
  code?: string;
  players?: ChampionPersonRaw[];
}

export interface ChampionMatchPersonsResponse {
  matchId?: number;
  squads?: {
    home?: ChampionPersonsSide;
    away?: ChampionPersonsSide;
  };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

export function championPersonToPlayer(p: ChampionPersonRaw, teamCode: string): Player | null {
  const id = p.personId != null ? String(p.personId) : "";
  const name = (p.fullname ?? p.displayName ?? "").trim();
  if (!id || !name) return null;
  const pos = p.positions?.selected?.code ?? p.positions?.selected?.name ?? "";
  return {
    player_id: id,
    name,
    number: typeof p.jerseyNumber === "number" ? p.jerseyNumber : 0,
    team: teamCode,
    position: typeof pos === "string" ? pos : "",
    handedness: null,
    country: null,
    headshot_url: null,
  };
}

/**
 * Authoritative game rosters keyed like shot `team` / `opposing_team` (Champion squad codes).
 */
export function rosterPlayersFromChampionPersons(
  persons: ChampionMatchPersonsResponse,
  fallbackHomeCode: string,
  fallbackAwayCode: string,
): { home: Player[]; away: Player[] } {
  const hCode = (persons.squads?.home?.code ?? fallbackHomeCode).toUpperCase();
  const aCode = (persons.squads?.away?.code ?? fallbackAwayCode).toUpperCase();

  const home = (persons.squads?.home?.players ?? [])
    .map((p) => championPersonToPlayer(p, hCode))
    .filter((x): x is Player => x !== null);

  const away = (persons.squads?.away?.players ?? [])
    .map((p) => championPersonToPlayer(p, aCode))
    .filter((x): x is Player => x !== null);

  return { home, away };
}

/**
 * Overlay PLL `handedness`, `country`, headshots, etc. onto Champion rows for one side.
 * Keeps Champion `player_id` so it matches `Shot.shooter_id` / pickers.
 */
export function enrichChampionRosterWithPllSide(championSide: Player[], pllSide: Player[]): Player[] {
  const pllByName = new Map<string, Player>();
  for (const pl of pllSide) {
    pllByName.set(normalizeName(pl.name), pl);
  }

  return championSide.map((cp) => {
    const hit = pllByName.get(normalizeName(cp.name));
    if (!hit) return cp;
    return {
      ...cp,
      handedness: hit.handedness ?? cp.handedness,
      country: hit.country ?? cp.country,
      headshot_url: hit.headshot_url ?? cp.headshot_url,
      position: hit.position || cp.position,
      number: cp.number || hit.number,
    };
  });
}
