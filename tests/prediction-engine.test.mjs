// Unit + integration tests for the prediction engine (run: node --experimental-strip-types tests/prediction-engine.test.mjs)
import assert from "node:assert/strict";
import test from "node:test";
import {
  quoteBuy,
  quoteSell,
  settlePayout,
  positionValue,
} from "../src/lib/prediction-math.ts";

// ---- pure math ----

test("quoteBuy floors whole shares and exact cost", () => {
  assert.deepEqual(quoteBuy(10, 0.5), { ok: true, shares: 20, cost: 10 });
  assert.equal(quoteBuy(10, 0.33).shares, 30.3); // floored to 2dp
  assert.equal(quoteBuy(0, 0.5).ok, false);
  assert.equal(quoteBuy(20_000, 0.5).ok, false); // > MAX_TICKET_USD
  assert.equal(quoteBuy(10, 0).ok, false);
  assert.equal(quoteBuy(10, 1).ok, false);
});

test("quoteSell computes proceeds and realized pnl", () => {
  assert.deepEqual(quoteSell(10, 0.5, 0.7, 10), { ok: true, proceeds: 7, realizedPnl: 2 });
  assert.deepEqual(quoteSell(10, 0.5, 0.3, 10), { ok: true, proceeds: 3, realizedPnl: -2 });
  assert.equal(quoteSell(11, 0.5, 0.7, 10).ok, false); // more than held
  assert.equal(quoteSell(0, 0.5, 0.7, 10).ok, false);
});

test("settlement and mark-to-market", () => {
  assert.equal(settlePayout(20, true), 20); // $1 per winning share
  assert.equal(settlePayout(20, false), 0);
  assert.equal(positionValue(20, 0.75), 15);
});

// ---- fake db ----

class FakeQ {
  constructor(table, state, pendingUpdate = null) {
    this.t = table;
    this.state = state;
    this.filters = [];
    this._single = false;
    this._maybe = false;
    this._pendingUpdate = pendingUpdate;
  }
  select() { return this; }
  eq(field, value) { this.filters.push([field, value]); return this; }
  in(field, values) { this.filters.push(["in", field, values]); return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybe = true; return this; }
  _match(row) {
    return this.filters.every(([f, v]) => {
      if (f === "in") return true; // not used by engine paths under test
      return String(row[f]) === String(v);
    });
  }
  async _exec() {
    if (this._pendingUpdate) {
      const hits = (this.state[this.t] ?? []).filter((r) => this._match(r));
      if (hits.length === 0) return { error: { message: "no rows to update" } };
      hits.forEach((r) => Object.assign(r, this._pendingUpdate));
      return { error: null };
    }
    const rows = (this.state[this.t] ?? []).filter((r) => this._match(r));
    if (this._maybe) return { data: rows[0] ?? null, error: null };
    if (this._single) return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
    return { data: rows, error: null };
  }
  async then(res, rej) { return this._exec().then(res, rej); }
  update(values) { return new FakeQ(this.t, this.state, values); }
  insert(row) {
    this.state[this.t] = this.state[this.t] ?? [];
    this.state[this.t].push({ id: `${this.t}-${this.state[this.t].length + 1}`, ...row });
    return this;
  }
}

function makeDb(state) {
  return { from: (t) => new FakeQ(t, state) };
}

const fetchNoClob = async (url) => url.includes("gamma-api.polymarket.com/markets/slug/")
  ? new Response(JSON.stringify({ active: true, closed: false, acceptingOrders: true }))
  : new Response("nope", { status: 500 });

function baseState() {
  return {
    accounts: [{ id: "acct-1", cash: 1000 }],
    prediction_markets: [{
      id: "m1", question: "Fed cuts in September?", event_slug: "fed-cut",
      end_date: "2026-09-30T00:00:00Z", volume24h: 0, liquidity: 0,
      status: "active", resolved_outcome: null, settled_at: null,
      yes_token_id: "111", no_token_id: "222", yes_price: 0.5, no_price: 0.5,
    }],
    prediction_positions: [],
    prediction_fills: [],
  };
}

// Dynamic import AFTER defining fetch override fallback (engine uses deps.fetchImpl).
const { buyPredictionShares, sellPredictionShares } = await import("../src/lib/prediction-engine.ts");

test("buy deducts cash, floors shares, writes fill", async () => {
  const state = baseState();
  const r = await buyPredictionShares(
    { accountId: "acct-1", marketId: "m1", outcome: "yes", stakeUsd: 10 },
    { db: makeDb(state), fetchImpl: fetchNoClob },
  );
  assert.equal(r.ok, true);
  assert.equal(r.result.shares, 20); // $10 @ 0.50
  assert.equal(r.result.cost, 10);
  assert.equal(state.accounts[0].cash, 990);
  assert.equal(state.prediction_fills[0].side, "buy");
});

test("buy rejects over-stake", async () => {
  const state = baseState();
  state.accounts[0].cash = 5;
  const r = await buyPredictionShares(
    { accountId: "acct-1", marketId: "m1", outcome: "yes", stakeUsd: 10 },
    { db: makeDb(state), fetchImpl: fetchNoClob },
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /insufficient/);
  assert.equal(state.accounts[0].cash, 5);
});

test("buy rejects a market that Polymarket has closed even when the catalog is stale", async () => {
  const state = baseState();
  const closedUpstream = async (url) => url.includes("gamma-api.polymarket.com/markets/slug/")
    ? new Response(JSON.stringify({ active: true, closed: true, acceptingOrders: false, umaResolutionStatus: "resolved", outcomePrices: '["0", "1"]' }))
    : new Response("nope", { status: 500 });
  const r = await buyPredictionShares(
    { accountId: "acct-1", marketId: "m1", outcome: "no", stakeUsd: 10 },
    { db: makeDb(state), fetchImpl: closedUpstream },
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /resolved/);
  assert.equal(state.accounts[0].cash, 1000);
  assert.equal(state.prediction_markets[0].status, "resolved");
});

test("repeat buy merges at weighted avg cost", async () => {
  const state = baseState();
  await buyPredictionShares({ accountId: "acct-1", marketId: "m1", outcome: "yes", stakeUsd: 10 }, { db: makeDb(state), fetchImpl: fetchNoClob });
  const r = await buyPredictionShares({ accountId: "acct-1", marketId: "m1", outcome: "yes", stakeUsd: 10 }, { db: makeDb(state), fetchImpl: fetchNoClob });
  assert.equal(r.ok, true);
  const pos = state.prediction_positions[0];
  assert.equal(pos.shares, 40);
  assert.equal(pos.avg_cost, 0.5);
});

test("idempotent replay returns original without double debit", async () => {
  const state = baseState();
  const first = await buyPredictionShares(
    { accountId: "acct-1", marketId: "m1", outcome: "yes", stakeUsd: 10, clientOrderId: "c1" },
    { db: makeDb(state), fetchImpl: fetchNoClob },
  );
  const replay = await buyPredictionShares(
    { accountId: "acct-1", marketId: "m1", outcome: "yes", stakeUsd: 10, clientOrderId: "c1" },
    { db: makeDb(state), fetchImpl: fetchNoClob },
  );
  assert.equal(first.result.duplicate, false);
  assert.equal(replay.result.duplicate, true);
  assert.equal(state.accounts[0].cash, 990);
  assert.equal(state.prediction_fills.length, 1);
});

test("partial sell credits proceeds and computes realized pnl", async () => {
  const state = baseState();
  await buyPredictionShares({ accountId: "acct-1", marketId: "m1", outcome: "yes", stakeUsd: 10 }, { db: makeDb(state), fetchImpl: fetchNoClob });
  const clob = async (url) => url.includes("gamma-api.polymarket.com/markets/slug/")
    ? new Response(JSON.stringify({ active: true, closed: false, acceptingOrders: true }))
    : new Response(JSON.stringify({ midpoint: "0.6" }));
  const r = await sellPredictionShares(
    { accountId: "acct-1", marketId: "m1", outcome: "yes", shares: 10, clientOrderId: "s1" },
    { db: makeDb(state), fetchImpl: clob },
  );
  assert.equal(r.ok, true);
  assert.equal(r.result.proceeds, 6); // 10 shares @ 0.60
  assert.equal(r.result.realizedPnl, 1); // vs 0.50 cost
  assert.equal(r.result.closed, false);
  assert.equal(state.prediction_positions[0].shares, 10);
  assert.equal(state.accounts[0].cash, 996);
});

test("closeAll empties position and credits full proceeds", async () => {
  const state = baseState();
  await buyPredictionShares({ accountId: "acct-1", marketId: "m1", outcome: "no", stakeUsd: 10 }, { db: makeDb(state), fetchImpl: fetchNoClob });
  const r = await sellPredictionShares(
    { accountId: "acct-1", marketId: "m1", outcome: "no", closeAll: true },
    { db: makeDb(state), fetchImpl: fetchNoClob },
  );
  assert.equal(r.ok, true);
  assert.equal(r.result.closed, true);
  assert.equal(state.prediction_positions[0].shares, 0);
  // bought no @0.5 ($10→20 shares), sold @0.5 → +$10 → cash back to 1000
  assert.equal(state.accounts[0].cash, 1000);
});

test("sell with no position is rejected", async () => {
  const state = baseState();
  const r = await sellPredictionShares(
    { accountId: "acct-1", marketId: "m1", outcome: "yes", shares: 5 },
    { db: makeDb(state), fetchImpl: fetchNoClob },
  );
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /no open position/);
});
