import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Predictions is a first-class in-app workspace with a real paper trade and close path", async () => {
  const [nav, page, workspace] = await Promise.all([
    source("src/components/nav.tsx"),
    source("src/app/(app)/predictions/page.tsx"),
    source("src/components/prediction-workspace.tsx"),
  ]);

  assert.match(nav, /href: "\/predictions"/, "Predictions must be a primary destination");
  assert.match(page, /PredictionWorkspace/, "The route must render the dedicated workspace");

  // The UI exposes named outcome choices, not a stock-like generic ticket.
  assert.match(workspace, /predictionOutcomeLabels/);
  assert.match(workspace, /const yesLabel = outcomeLabel\(market, "yes"\), noLabel = outcomeLabel\(market, "no"\)/);
  assert.match(workspace, /Buy \$\{yesLabel\}/);
  assert.match(workspace, /Buy \$\{noLabel\}/);
  assert.match(workspace, /Payout if correct/);
  assert.match(workspace, /Potential profit/);
  assert.match(workspace, /\/api\/prediction-markets/);
  assert.match(workspace, /\/api\/prediction-markets\/\$\{[^}]+\}\/history/);

  // Side selectors configure; one clearly named final action submits the live API.
  assert.match(workspace, /\/api\/predictions\/trade/);
  assert.match(workspace, /client_order_id/);
  assert.match(workspace, /Confirm buy/);
  assert.match(workspace, /Place paper buy/);

  // Early close follows the approved partial-or-Max paper trading model.
  assert.match(workspace, /\/api\/predictions\/close/);
  assert.match(workspace, /close_all/);
  assert.match(workspace, />Max</);
  assert.match(workspace, /Confirm sell/);
});

test("the app shell keeps the five-destination Vanta navigation visible on phones", async () => {
  const [nav, css] = await Promise.all([
    source("src/components/nav.tsx"),
    source("src/app/globals.css"),
  ]);

  assert.match(nav, /vanta-mobile-topbar/);
  assert.match(nav, /vanta-mobile-bottom/);
  assert.match(nav, /Mobile navigation/);
  assert.match(nav, /label: "Predictions"/);
  assert.doesNotMatch(nav, /vanta-mobile-drawer/);
  assert.match(css, /\.vanta-mobile-bottom/);
  assert.match(css, /padding-bottom:.*5\.5rem/s);
});

test("Discover owns the paper-account watchlist as a selectable market list", async () => {
  const [layout, market] = await Promise.all([
    source("src/app/(app)/layout.tsx"),
    source("src/app/(app)/market/page.tsx"),
  ]);

  assert.doesNotMatch(layout, /WatchlistRail/, "Watchlist must not compete with the Discover information hierarchy as a global rail");
  assert.match(market, /\["Owned", "Watchlist"/, "Discover filters must include owned assets and watchlist");
  assert.match(market, /Nothing pinned yet/, "The Watchlist filter needs an explicit empty state");
});

test("prediction positions outside the discovery top list remain sellable", async () => {
  const [workspace, route] = await Promise.all([
    source("src/components/prediction-workspace.tsx"),
    source("src/app/api/prediction-markets/route.ts"),
  ]);
  assert.match(workspace, /params\.set\("ids", heldIds\.join\(","\)\)/);
  assert.match(route, /searchParams\.get\("ids"\)/);
  assert.match(route, /\.in\("id", requestedIds\)/);
});
