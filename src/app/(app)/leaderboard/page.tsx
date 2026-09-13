"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Award, Eye, Loader2, Medal, Shield, Trophy } from "lucide-react";
import { cn, formatPct, formatUSD } from "@/lib/utils";

interface Entry {
  account_id: string;
  display_name: string;
  equity: number;
  starting_cash: number;
  cost_basis: number;
  gain_amount: number;
  return_pct: number;
  score: number;
  invested_growth_pct?: number;
  position?: number;
}

interface RankDetail {
  account_id: string;
  display_name: string;
  tier: number;
  tier_name: string;
  division: number;
  rank_points: number;
  return_pct: number;
  movement: "up" | "down" | "new" | "same";
  movement_amount: number;
}

const TIER_STYLES: Record<string, string> = {
  Iron: "text-gray-400 border-gray-500/40 bg-gray-500/10",
  Bronze: "text-amber-600 border-amber-600/40 bg-amber-600/10",
  Silver: "text-gray-200 border-gray-300/40 bg-gray-300/10",
  Gold: "text-accent-yellow border-accent-yellow/40 bg-accent-yellow/10",
  Diamond: "text-accent-blue border-accent-blue/50 bg-accent-blue/10",
};

function tierGlyph(tierName?: string) {
  return tierName === "Diamond" ? "◆" : tierName === "Gold" ? "●" : tierName === "Silver" ? "◐" : "▲";
}

/** Small tap-to-open rank icon. Leaderboard rows never show tier/division
 * inline — tapping this fetches and reveals the detail in a popover so the
 * board itself stays uncluttered. */
function RankIcon({ accountId, onOpen }: { accountId: string; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(accountId)}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-bg-border text-gray-400 transition hover:border-accent-blue/50 hover:text-accent-blue"
      title="View rank"
      aria-label="View rank"
    >
      <Shield className="h-3.5 w-3.5" />
    </button>
  );
}

function RankPopover({ detail, loading, error, onClose }: { detail: RankDetail | null; loading: boolean; error: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-xs p-5" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="py-6 text-center text-sm text-gray-500">Loading rank...</div>
        ) : error ? (
          <div className="py-6 text-center text-sm text-accent-red">{error}</div>
        ) : detail ? (
          <>
            <div className="text-xs uppercase tracking-wider text-gray-500">{detail.display_name}</div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-black uppercase tracking-wider",
                  TIER_STYLES[detail.tier_name] ?? "text-gray-400 border-bg-border",
                )}
              >
                {tierGlyph(detail.tier_name)} {detail.tier_name}
                {detail.tier_name === "Diamond" && detail.division > 1 ? ` D${detail.division}` : ""}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Return" value={formatPct(detail.return_pct)} tone={detail.return_pct >= 0 ? "text-accent-green" : "text-accent-red"} />
              <Metric
                label="Movement"
                value={
                  detail.movement === "new" || detail.movement === "same"
                    ? detail.movement === "new" ? "New" : "—"
                    : `${detail.movement === "up" ? "▲" : "▼"} ${detail.movement_amount}`
                }
                tone={detail.movement === "up" ? "text-accent-green" : detail.movement === "down" ? "text-accent-red" : undefined}
              />
              <Metric label="Rank points" value={String(detail.rank_points)} />
              <Metric label="Division" value={`${detail.tier_name} ${detail.division}`} />
            </div>
            <section className="mt-4 border-t border-bg-border pt-4" aria-label="Division ladder">
              <div className="flex items-center justify-between"><strong className="text-xs uppercase tracking-[0.14em] text-gray-400">Division ladder</strong><span className="text-[10px] text-gray-500">Return thresholds</span></div>
              <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[9px] font-bold"><span className="border border-bg-border py-2 text-gray-400">Iron<br />0%</span><span className="border border-amber-600/40 py-2 text-amber-600">Bronze<br />5%</span><span className="border border-gray-300/40 py-2 text-gray-200">Silver<br />15%</span><span className="border border-accent-yellow/40 py-2 text-accent-yellow">Gold<br />25%</span><span className="border border-accent-blue/50 py-2 text-accent-blue">Diamond<br />40%</span></div>
              <p className="mt-3 text-[11px] leading-4 text-gray-500">Diamond begins at 40% return. Your current return and rank points update through the same competition calculation as the board.</p>
            </section>
          </>
        ) : null}
        <button type="button" onClick={onClose} className="btn-ghost mt-4 w-full border border-bg-border py-2 text-xs">
          Close
        </button>
      </div>
    </div>
  );
}

interface RevealedAsset {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [revealed, setRevealed] = useState<Record<string, RevealedAsset[]>>({});
  const [peekLoading, setPeekLoading] = useState<string | null>(null);
  const [peekError, setPeekError] = useState("");
  const [rankOpenFor, setRankOpenFor] = useState<string | null>(null);
  const [rankDetail, setRankDetail] = useState<RankDetail | null>(null);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState("");
  const [myRank, setMyRank] = useState<RankDetail | null>(null);
  const [myRankLoading, setMyRankLoading] = useState(true);
  const [scoringMethod, setScoringMethod] = useState<"return_pct" | "net_profit">("return_pct");

  useEffect(() => {
    let active = true;
    async function loadMyRank() {
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) { if (active) setMyRankLoading(false); return; }
        const me = await meRes.json();
        const accountId = me.account?.id;
        if (!accountId) { if (active) setMyRankLoading(false); return; }
        const rankRes = await fetch(`/api/rank?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" });
        if (rankRes.ok && active) setMyRank(await rankRes.json());
      } finally {
        if (active) setMyRankLoading(false);
      }
    }
    loadMyRank();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const r = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (active) {
        setEntries(j.entries ?? []);
        setScoringMethod(j.scoring_method === "net_profit" ? "net_profit" : "return_pct");
        setLoading(false);
        setLastUpdated(new Date());
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const podium = entries.slice(0, 3);
  const avgScore = useMemo(() => entries.length ? entries.reduce((sum, e) => sum + Number(e.score), 0) / entries.length : 0, [entries]);
  const scoreLabel = scoringMethod === "net_profit" ? "Net P/L" : "Return";
  const formatScore = (value: number) => scoringMethod === "net_profit" ? formatUSD(value) : formatPct(value);

  async function revealAssets(accountId: string) {
    if (revealed[accountId]) return;
    setPeekLoading(accountId);
    setPeekError("");
    const r = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId }),
    });
    const j = await r.json();
    if (r.ok) {
      setRevealed((prev) => ({ ...prev, [accountId]: j.assets ?? [] }));
    } else {
      setPeekError(j.error ?? "Could not reveal assets");
    }
    setPeekLoading(null);
  }

  async function openRank(accountId: string) {
    setRankOpenFor(accountId);
    setRankDetail(null);
    setRankError("");
    setRankLoading(true);
    try {
      const r = await fetch(`/api/rank?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) setRankDetail(j);
      else setRankError(j.error ?? "Could not load rank");
    } catch {
      setRankError("Could not load rank");
    }
    setRankLoading(false);
  }

  return (
    <div className="animate-fade-in space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
            <span className="h-2 w-2 rounded-full bg-accent-green" />
            Reactive leaderboard
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Club rankings</h1>
          <p className="mt-2 text-sm text-gray-400">Sorted by this competition&apos;s live {scoringMethod === "net_profit" ? "net paper profit" : "percentage return"}. Refreshes every 30 seconds.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
          <Metric label="Traders" value={String(entries.length)} />
          <Metric label={`Avg ${scoreLabel}`} value={formatScore(avgScore)} tone={avgScore >= 0 ? "text-accent-green" : "text-accent-red"} caption={lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : undefined} />
        </div>
      </header>

      <YourRankHero detail={myRank} loading={myRankLoading} />

      {podium.length > 0 && (
        <section className="grid gap-4 md:grid-cols-3">
          {podium.map((entry, index) => (
            <PodiumCard key={entry.account_id} entry={entry} rank={index + 1} onOpenRank={openRank} scoreLabel={scoreLabel} scoreText={formatScore(Number(entry.score))} />
          ))}
        </section>
      )}

      <section className="card overflow-hidden">
        {peekError && (
          <div className="border-b border-bg-border bg-accent-red/10 px-5 py-3 text-sm font-semibold text-accent-red">{peekError}</div>
        )}
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Loading rankings...</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No accounts yet. Sign up to be first.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-bg-soft text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="w-20 px-4 py-3 text-left font-semibold">Rank</th>
                  <th className="px-4 py-3 text-left font-semibold">Trader</th>
                  <th className="px-4 py-3 text-right font-semibold">Portfolio</th>
                  <th className="px-4 py-3 text-right font-semibold">{scoreLabel}</th>
                  <th className="px-4 py-3 text-right font-semibold">P/L</th>
                  <th className="px-4 py-3 text-right font-semibold">Progress</th>
                  <th className="px-4 py-3 text-right font-semibold">Assets</th>
                  <th className="w-12 px-4 py-3 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  const pl = Number(entry.gain_amount);
                  const up = Number(entry.return_pct) >= 0;
                  const width = Math.max(4, Math.min(100, Math.abs(Number(entry.return_pct)) * 3));
                  return (
                    <Fragment key={entry.account_id}>
                      <tr className="ticker-row">
                        <td className="px-4 py-4"><RankBadge rank={index + 1} /></td>
                        <td className="px-4 py-4">
                          <div className="font-semibold">{entry.display_name}</div>
                          <div className="text-xs text-gray-500">
                            Invested basis {formatUSD(Number(entry.cost_basis))}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold tabular-nums">{formatUSD(Number(entry.equity))}</td>
                        <td className={cn("px-4 py-4 text-right font-black tabular-nums", Number(entry.score) >= 0 ? "text-accent-green" : "text-accent-red")}>{formatScore(Number(entry.score))}</td>
                        <td className={cn("px-4 py-4 text-right font-semibold tabular-nums", up ? "text-accent-green" : "text-accent-red")}>{formatUSD(pl)}</td>
                        <td className="px-4 py-4 text-right">
                          <div className="ml-auto h-2 w-32 rounded-full bg-bg-elevated">
                            <div className={cn("h-2 rounded-full", up ? "bg-accent-green" : "bg-accent-red")} style={{ width: `${width}%` }} />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => revealAssets(entry.account_id)}
                            disabled={peekLoading === entry.account_id}
                            className="btn-ghost border border-bg-border px-3 py-1.5 text-xs"
                            title="Spend $10,000 to reveal this trader's assets"
                          >
                            {peekLoading === entry.account_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                            {revealed[entry.account_id] ? "Viewed" : "$10,000"}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <RankIcon accountId={entry.account_id} onOpen={openRank} />
                        </td>
                      </tr>
                      {revealed[entry.account_id] && (
                        <tr className="border-b border-bg-border bg-bg-elevated/35">
                          <td colSpan={8} className="px-4 py-4">
                            {revealed[entry.account_id].length === 0 ? (
                              <div className="text-sm text-gray-500">{entry.display_name} has no open assets.</div>
                            ) : (
                              <div className="grid gap-3 md:grid-cols-3">
                                {revealed[entry.account_id].map((asset) => (
                                  <div key={asset.symbol} className="rounded-lg border border-bg-border bg-bg-card p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="font-mono font-bold">{asset.symbol}</div>
                                      <div className="text-sm font-semibold tabular-nums">{formatUSD(asset.market_value)}</div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                                      <div>{asset.qty.toFixed(4)} shares</div>
                                      <div className="text-right">Avg {formatUSD(asset.avg_entry_price)}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {rankOpenFor && (
        <RankPopover
          detail={rankDetail}
          loading={rankLoading}
          error={rankError}
          onClose={() => setRankOpenFor(null)}
        />
      )}
    </div>
  );
}

function YourRankHero({ detail, loading }: { detail: RankDetail | null; loading: boolean }) {
  const TIERS = [
    { name: "Iron", pct: "0%", cls: "text-gray-400 border-gray-500/40" },
    { name: "Bronze", pct: "5%", cls: "text-amber-600 border-amber-600/40" },
    { name: "Silver", pct: "15%", cls: "text-gray-200 border-gray-300/40" },
    { name: "Gold", pct: "25%", cls: "text-accent-yellow border-accent-yellow/40" },
    { name: "Diamond", pct: "40%", cls: "text-accent-blue border-accent-blue/50" },
  ];
  return (
    <section className="card overflow-hidden border-accent-green/40 bg-accent-green/[0.04] p-5" aria-label="Your standing">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-green">
          <Shield className="h-3.5 w-3.5" /> Your standing
        </div>
        {detail && <span className="text-xs text-gray-500">{formatPct(detail.return_pct)} return</span>}
      </div>
      {loading ? (
        <div className="py-6 text-center text-sm text-gray-500"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
      ) : detail ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-base font-black uppercase tracking-wider", TIER_STYLES[detail.tier_name] ?? "text-gray-400 border-bg-border")}>
              {tierGlyph(detail.tier_name)} {detail.tier_name}
              {detail.tier_name === "Diamond" && detail.division > 1 ? ` D${detail.division}` : ""}
            </span>
            <div className="text-sm text-gray-400">
              <span className="font-bold text-white tabular-nums">{detail.rank_points}</span> rank points · Division <span className="font-bold text-white">{detail.division}</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-1 text-center text-[10px] font-bold" aria-label="Division ladder">
            {TIERS.map((t) => (
              <span key={t.name} className={cn("border py-2.5", t.cls, detail.tier_name === t.name ? "bg-accent-green/15 ring-1 ring-accent-green" : "opacity-60")}>
                {t.name}<br />{t.pct}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-4 text-gray-500">Diamond begins at 40% return. Climb the ladder by growing your invested capital faster than the field.</p>
        </>
      ) : (
        <p className="py-4 text-sm text-gray-500">Start trading to earn your first rank. Your tier and division will appear here.</p>
      )}
    </section>
  );
}

function PodiumCard({ entry, rank, onOpenRank, scoreLabel, scoreText }: { entry: Entry; rank: number; onOpenRank: (id: string) => void; scoreLabel: string; scoreText: string }) {
  const pl = Number(entry.gain_amount);
  const up = Number(entry.return_pct) >= 0;
  const Icon = rank === 1 ? Trophy : rank === 2 ? Medal : Award;
  return (
    <div className={cn("card p-5", rank === 1 && "border-accent-green/50 bg-accent-green/5")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", rank === 1 ? "bg-accent-green text-black" : rank === 2 ? "bg-gray-300 text-black" : "bg-accent-yellow text-black")}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500">Rank {rank}</div>
            <div className="font-semibold">{entry.display_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("text-right font-black tabular-nums", Number(entry.score) >= 0 ? "text-accent-green" : "text-accent-red")}>{scoreText}</div>
          <RankIcon accountId={entry.account_id} onOpen={onOpenRank} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label="Equity" value={formatUSD(Number(entry.equity))} />
        <Metric label={scoreLabel} value={scoreText} tone={Number(entry.score) >= 0 ? "text-accent-green" : "text-accent-red"} />
      </div>
    </div>
  );
}

function Metric({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: string }) {
  return (
    <div className="surface p-4">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-2 text-xl font-bold tabular-nums", tone)}>{value}</div>
      {caption && <div className="mt-1 text-[11px] text-gray-500">{caption}</div>}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="flex items-center gap-1.5 font-bold text-accent-green"><Trophy className="h-4 w-4" /> 1</span>;
  if (rank === 2) return <span className="flex items-center gap-1.5 font-bold text-gray-300"><Medal className="h-4 w-4" /> 2</span>;
  if (rank === 3) return <span className="flex items-center gap-1.5 font-bold text-accent-yellow"><Award className="h-4 w-4" /> 3</span>;
  return <span className="font-mono text-gray-500">#{rank}</span>;
}
