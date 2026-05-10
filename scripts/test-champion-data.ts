/**
 * Smoke test for upstream APIs.
 *
 * Run with: npm run smoke
 *
 * Expected output:
 *   ✅ Champion Data schedule for season 2025 → N matches
 *   ✅ Champion Data match {id} → N shot transactions from /shots
 *   ✅ PLL Stats rosters for week W season 2025 → N home, N away
 *
 * If any of these fail, the issue is in lib/championData.ts or lib/pllStats.ts —
 * fix it there before touching the frontend or transform.
 */

import "dotenv/config";
import { getSchedule, getMatchShots, LEAGUE_IDS } from "../lib/championData";
import { getRostersForGame } from "../lib/pllStats";

async function main() {
  console.log("─── Champion Data smoke test ───");
  const schedule = await getSchedule({ season_id: 2025, league_id: LEAGUE_IDS.pll_regular });
  const matchCount = (schedule.matches ?? []).length;
  console.log(`✅ schedule loaded — ${matchCount} matches`);
  if (matchCount === 0) throw new Error("schedule returned no matches");

  const firstMatchId = String(schedule.matches[0].matchId);
  const shotsPayload = await getMatchShots(firstMatchId);
  const shotCount = (shotsPayload.shots ?? []).length;
  console.log(`✅ match ${firstMatchId} — ${shotCount} shots (MatchShots API)`);

  console.log("─── PLL Stats smoke test ───");
  try {
    const rosters = await getRostersForGame({
      season: 2025,
      week: schedule.matches[0].round ?? 1,
      match_external_id: firstMatchId,
    });
    console.log(`✅ rosters — ${rosters.home.length} home, ${rosters.away.length} away`);

    const sample = rosters.home[0];
    if (sample) {
      console.log(`   sample: #${sample.number} ${sample.name} (${sample.position}, ${sample.handedness ?? "?"}H)`);
      if (!sample.handedness) console.warn("   ⚠ handedness is null — confirm GraphQL field name");
    }
  } catch (err) {
    console.error("❌ PLL Stats roster fetch failed:", err);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
