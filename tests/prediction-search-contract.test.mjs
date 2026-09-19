// Contract: unified instrument search surfaces prediction markets alongside
// stocks/crypto, keeping the flattened { results: [...] } shape (Task 13).
import assert from "node:assert/strict";
import test from "node:test";
import { searchInstruments, scorePredictionMarket, CATALOG } from "@/lib/instrument-catalog";

const fakeDb = (rows) => ({
  from: () => ({
    select: () => ({
      eq: async () => ({ data: rows, error: null }),
    }),
  }),
});

test("scorePredictionMarket ranks question-prefix above substring above fuzzy", () => {
  const row = { id: "0x1", question: "Will the Fed cut rates in March?", category: "Economics", yes_price: 0.5, no_price: 0.5, image: null, url: null, status: "active" };
  const prefix = scorePredictionMarket(row, "will the fed");
  const substring = scorePredictionMarket(row, "cut rates");
  assert.ok(prefix > substring, `expected prefix score ${prefix} > substring score ${substring}`);
  assert.equal(scorePredictionMarket(row, "zzz nonsense"), 0);
});

test("'fed' ranks an injected Fed prediction above lower-scoring stock provider matches", async () => {
  const rows = [
    { id: "0xfed", question: "Will the Fed cut rates in March?", category: "Economics", yes_price: 0.62, no_price: 0.38, image: null, url: "https://polymarket.com/x", status: "active" },
  ];
  const providerResults = [
    { symbol: "FDE1", displayName: "Faded One", name: "faded one", aliases: ["faded"], assetClass: "stock", exchange: "NYSE", market: "us-equities", tradable: true, displaySymbol: "FDE1", displayMarket: "NYSE" },
    { symbol: "FDE2", displayName: "Faded Two", name: "faded two", aliases: ["faded"], assetClass: "stock", exchange: "NYSE", market: "us-equities", tradable: true, displaySymbol: "FDE2", displayMarket: "NYSE" },
  ];
  const results = await searchInstruments("fed", { limit: 5, predictionDb: fakeDb(rows), providerResults });
  const hit = results.find((r) => r.assetClass === "prediction");
  assert.ok(hit, `expected a prediction hit, got ${JSON.stringify(results.map((r) => [r.symbol, r.assetClass]))}`);
  assert.equal(results[0]?.assetClass, "prediction");
  assert.equal(hit.marketId, "0xfed");
  assert.equal(hit.url, "https://polymarket.com/x");
  assert.equal(hit.tradable, true);
});

test("'aapl' still returns AAPL first with predictions present in the pool", async () => {
  const rows = [{ id: "0xother", question: "Will AAPL stock hit a new high?", category: "Markets", yes_price: 0.4, no_price: 0.6, image: null, url: null, status: "active" }];
  const results = await searchInstruments("aapl", { limit: 5, predictionDb: fakeDb(rows) });
  assert.equal(results[0]?.symbol, "AAPL");
  assert.equal(results[0]?.assetClass, "stock");
});

test("resolved/inactive prediction markets are excluded from search", async () => {
  const rows = [{ id: "0xclosed", question: "Will the Fed cut rates?", category: "Economics", yes_price: 1, no_price: 0, image: null, url: null, status: "resolved" }];
  // status filter happens server-side (.eq("status","active")) — a fake DB that only
  // returns active rows never sees the resolved one; assert the query filters by status.
  let filteredStatus = null;
  const trackingDb = {
    from: () => ({
      select: () => ({
        eq: async (col, val) => {
          filteredStatus = [col, val];
          return { data: [], error: null };
        },
      }),
    }),
  };
  await searchInstruments("fed", { limit: 5, predictionDb: trackingDb });
  assert.deepEqual(filteredStatus, ["status", "active"]);
  void rows; // rows unused: this test asserts the filter contract, not row content
});

test("CATALOG entries never carry assetClass:'prediction' (predictions are DB-sourced only)", () => {
  assert.ok(CATALOG.every((i) => i.assetClass !== "prediction"));
});
