// Contract: leaderboard rows must never carry tier/division/movement (keeps
// the board lean per product decision); that detail lives only behind the
// dedicated GET /api/rank endpoint, revealed by tapping a rank icon.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { RANK_TIERS, tierForReturnPct } from "@/lib/ranks";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Diamond tier threshold is 40% return", () => {
  const diamond = RANK_TIERS.find((t) => t.name === "Diamond");
  assert.equal(diamond.minPct, 40);
  assert.equal(tierForReturnPct(39.99).name, "Gold");
  assert.equal(tierForReturnPct(40).name, "Diamond");
});

test("GET /api/leaderboard response never includes tier/division/movement keys", async () => {
  const route = await source("src/app/api/leaderboard/route.ts");
  // The response object literal actually sent to the client must strip these.
  assert.match(route, /const entries = standings\.map\(/);
  assert.match(route, /_tier, _tier_name, _division, _rank_points, _movement, _movement_amount/);
  assert.match(route, /NextResponse\.json\(\{ entries, scoring_method: scoringMethod \}\)/);
  // scoring_method is public configuration; internal rank fields stay prefixed so a future edit can't leak them by accident.
  assert.doesNotMatch(route, /NextResponse\.json\(\{\s*entries:\s*standings\s*\}\)/);
});

test("leaderboard page never renders tier/division/movement inline in the table", async () => {
  const page = await source("src/app/(app)/leaderboard/page.tsx");
  assert.doesNotMatch(page, /entry\.tier_name/);
  assert.doesNotMatch(page, /entry\.division/);
  assert.doesNotMatch(page, /entry\.movement/);
  // Rank detail is opt-in via a tap-to-open icon backed by /api/rank.
  assert.match(page, /RankIcon/);
  assert.match(page, /\/api\/rank\?account_id=/);
  assert.match(page, /Rank points/);
  assert.match(page, /Division ladder/);
  assert.match(page, /Diamond begins at 40% return/);
});

test("Compete surfaces the signed-in trader's own rank standing inline", async () => {
  const page = await source("src/app/(app)/leaderboard/page.tsx");
  // A "Your standing" hero shows the viewer's own tier/division without needing
  // to tap another trader's icon: it bootstraps from /api/me then /api/rank.
  assert.match(page, /Your standing/);
  assert.match(page, /YourRankHero/);
  assert.match(page, /\/api\/me/);
});

test("GET /api/rank exposes tier/division/movement for the drill-in view", async () => {
  const route = await source("src/app/api/rank/route.ts");
  assert.match(route, /tier_name: rank\.tierName/);
  assert.match(route, /division: rank\.division/);
  assert.match(route, /movement: mv\.movement/);
  // Scoped to the viewer's own competition — not an open account lookup.
  assert.match(route, /eq\("competition_id", viewerAccount\.competition_id\)/);
});
