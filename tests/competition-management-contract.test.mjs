import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("competition migration supports a bounded paper-only lifecycle", async () => {
  const migration = await read("supabase/20260913_competition_management.sql");
  assert.match(migration, /scoring_method text not null default 'return_pct'/);
  assert.match(migration, /max_entrants between 2 and 10000/);
  assert.match(migration, /status in \('draft', 'open', 'active', 'locked', 'settled', 'ended'\)/);
  assert.match(migration, /drop policy if exists "anyone sees competitions"/);
  assert.match(migration, /to authenticated using \(true\)/);
  assert.doesNotMatch(migration, /payment_intents|transfer_reversals|payout_transactions/i);
});

test("competition selection scopes accounts, messages, and market access", async () => {
  const [appData, messages, trades, predictions, competitions, navigation] = await Promise.all([
    read("src/lib/app-data.ts"),
    read("src/app/api/messages/route.ts"),
    read("src/app/api/trade/route.ts"),
    read("src/app/api/predictions/trade/route.ts"),
    read("src/app/(app)/competitions/page.tsx"),
    read("src/components/nav.tsx"),
  ]);
  assert.match(appData, /vanta_competition/);
  assert.match(messages, /eq\("competition_id", ctx\.account\.competition_id\)/);
  assert.match(trades, /competition\.status !== "active"/);
  assert.match(predictions, /competition\.status !== "active"/);
  assert.match(competitions, /href="\/messages"/);
  assert.match(competitions, /href="\/leaderboard"/);
  assert.match(navigation, /href: "\/leaderboard", label: "Leaderboard"/);
  assert.match(navigation, /href: "\/messages", label: "Messages"/);
});
