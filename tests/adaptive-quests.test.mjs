import assert from "node:assert/strict";
import test from "node:test";
import { getAdaptiveQuests, getDailyQuestCycle } from "../src/lib/adaptive-quests.ts";

const emptyStats = { lifetimeOrders: 0, filledOrders: 0, uniqueSymbols: 0, buyOrders: 0, sellOrders: 0, limitOrders: 0, predictionTrades: 0 };

test("daily quest cycle resets at Pacific local midnight", () => {
  const beforeMidnight = getDailyQuestCycle(new Date("2026-09-13T06:59:59Z"));
  const afterMidnight = getDailyQuestCycle(new Date("2026-09-13T07:00:00Z"));
  assert.equal(beforeMidnight.id, "daily-2026-09-12");
  assert.equal(afterMidnight.id, "daily-2026-09-13");
  assert.equal(afterMidnight.startsAt, "2026-09-13T07:00:00.000Z");
  assert.equal(afterMidnight.endsAt, "2026-09-14T07:00:00.000Z");
});

test("quest difficulty rises with completed-order experience while progress stays daily", () => {
  const starter = getAdaptiveQuests({ ...emptyStats, lifetimeOrders: 9 });
  const active = getAdaptiveQuests({ ...emptyStats, lifetimeOrders: 10 });
  const advanced = getAdaptiveQuests({ ...emptyStats, lifetimeOrders: 50 });
  assert.equal(starter.tier, "starter");
  assert.equal(active.tier, "active");
  assert.equal(advanced.tier, "advanced");
  assert.equal(advanced.quests.find((quest) => quest.id === "advanced-session")?.goal, 4);
  assert.equal(advanced.quests.find((quest) => quest.id === "advanced-session")?.progress, 0);
});
