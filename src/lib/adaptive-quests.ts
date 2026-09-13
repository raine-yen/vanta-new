export type QuestTier = "starter" | "active" | "advanced";

export type AdaptiveQuest = { id: string; title: string; description: string; progress: number; goal: number; reward: string };
export type DailyQuestStats = { lifetimeOrders: number; filledOrders: number; uniqueSymbols: number; buyOrders: number; sellOrders: number; limitOrders: number; predictionTrades: number };
export type DailyQuestCycle = { id: string; label: string; startsAt: string; endsAt: string };

const QUEST_TIME_ZONE = "America/Los_Angeles";
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: QUEST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: QUEST_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", second: "2-digit" });

function localDateKey(date: Date) {
  const values = Object.fromEntries(dateFormatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function pacificMidnight(date: string) {
  const candidate = new Date(`${date}T00:00:00.000Z`);
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(candidate).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const displayedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(candidate.getTime() - (displayedAsUtc - candidate.getTime()));
}

export function getDailyQuestCycle(now = new Date()) {
  const date = localDateKey(now);
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const startsAt = pacificMidnight(date).toISOString();
  const endsAt = pacificMidnight(nextDate.toISOString().slice(0, 10)).toISOString();
  return { id: `daily-${date}`, label: date, startsAt, endsAt } satisfies DailyQuestCycle;
}

export function getQuestTier(lifetimeOrders: number): QuestTier {
  if (lifetimeOrders >= 50) return "advanced";
  if (lifetimeOrders >= 10) return "active";
  return "starter";
}

export function getAdaptiveQuests(stats: DailyQuestStats): { tier: QuestTier; quests: AdaptiveQuest[] } {
  const tier = getQuestTier(stats.lifetimeOrders);
  const common: AdaptiveQuest[] = [
    { id: "prediction-desk", title: "Outcome Reader", description: "Place one prediction-market paper trade today.", progress: stats.predictionTrades, goal: 1, reward: "200 recognition points" },
    { id: "limit-plan", title: "Price Plan", description: "Submit one limit order today.", progress: stats.limitOrders, goal: 1, reward: "200 recognition points" },
  ];
  if (tier === "starter") return { tier, quests: [
    { id: "opening-trade", title: "Opening Trade", description: "Complete one stock or crypto paper trade today.", progress: stats.filledOrders, goal: 1, reward: "200 recognition points" },
    { id: "two-symbol-scan", title: "Market Scan", description: "Trade two different symbols today.", progress: stats.uniqueSymbols, goal: 2, reward: "200 recognition points" },
    ...common,
    { id: "two-trade-session", title: "Practice Session", description: "Complete two stock or crypto paper trades today.", progress: stats.filledOrders, goal: 2, reward: "200 recognition points" },
  ] };
  if (tier === "active") return { tier, quests: [
    { id: "active-session", title: "Active Session", description: "Complete three stock or crypto paper trades today.", progress: stats.filledOrders, goal: 3, reward: "200 recognition points" },
    { id: "three-symbol-scan", title: "Broad Scan", description: "Trade three different symbols today.", progress: stats.uniqueSymbols, goal: 3, reward: "200 recognition points" },
    ...common,
    { id: "two-sided-desk", title: "Two-Sided Desk", description: "Complete both a buy and a sell today.", progress: Math.min(stats.buyOrders, stats.sellOrders), goal: 1, reward: "200 recognition points" },
  ] };
  return { tier, quests: [
    { id: "advanced-session", title: "Advanced Session", description: "Complete four stock or crypto paper trades today.", progress: stats.filledOrders, goal: 4, reward: "200 recognition points" },
    { id: "four-symbol-scan", title: "Wide Scan", description: "Trade four different symbols today.", progress: stats.uniqueSymbols, goal: 4, reward: "200 recognition points" },
    ...common,
    { id: "two-sided-desk", title: "Two-Sided Desk", description: "Complete both a buy and a sell today.", progress: Math.min(stats.buyOrders, stats.sellOrders), goal: 1, reward: "200 recognition points" },
  ] };
}
