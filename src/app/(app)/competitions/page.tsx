"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2, Lock, Medal, MessageCircle, Trophy, Users } from "lucide-react";
import { formatUSD } from "@/lib/utils";

type Competition = {
  id: string; name: string; description: string | null; starting_cash: number; start_date: string; end_date: string | null; status: string;
  scoring_method: "return_pct" | "net_profit"; max_entrants: number | null; allow_crypto: boolean; prize_description: string | null; rules: string | null; entrants: number; joined: boolean;
};

function statusText(status: string) {
  return status === "open" ? "Enrollment open" : status === "active" ? "In progress" : status === "draft" ? "Coming soon" : status === "locked" ? "Locked" : status === "settled" ? "Final results" : "Ended";
}

export default function CompetitionsPage() {
  const [items, setItems] = useState<Competition[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/competitions", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) { setItems(payload.items ?? []); setActiveId(payload.active_competition_id ?? null); setMessage(""); }
    else setMessage(payload.error ?? "Competitions are temporarily unavailable.");
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function selectCompetition(id: string) {
    setJoining(id); setMessage("");
    const response = await fetch("/api/competitions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competition_id: id }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) { setActiveId(id); await load(); setMessage("Competition selected. Your paper portfolio is now isolated to this event."); }
    else setMessage(payload.error ?? "Could not join competition.");
    setJoining(null);
  }

  return <section className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-10" aria-labelledby="competitions-heading">
    <header className="border-b border-bg-border pb-5"><p className="text-xs font-bold tracking-[0.16em] text-accent-green">CLUB COMPETITIONS</p><div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 id="competitions-heading" className="text-3xl font-black tracking-tight">Choose your next paper challenge.</h1><p className="mt-2 max-w-2xl text-sm text-gray-500">Every competition has its own simulated starting balance, trades, and standings. Prize details are managed by the club outside Vanta.</p></div><div className="grid grid-cols-2 gap-2 sm:min-w-[280px]"><Link href="/leaderboard" className="flex min-h-11 items-center justify-center gap-2 border border-bg-border px-3 text-sm font-bold transition-colors hover:border-accent-green hover:text-accent-green"><Medal className="h-4 w-4" /> Leaderboard</Link><Link href="/messages" className="flex min-h-11 items-center justify-center gap-2 border border-bg-border px-3 text-sm font-bold transition-colors hover:border-accent-green hover:text-accent-green"><MessageCircle className="h-4 w-4" /> Messages</Link></div></div></header>
    {message ? <p role="status" className="mt-4 border border-accent-green/40 bg-accent-green/10 p-3 text-sm text-accent-green">{message}</p> : null}
    {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading competitions</div> : items.length ? <div className="mt-6 grid gap-4 md:grid-cols-2">{items.map((competition) => {
      const selectable = competition.status === "open" || competition.status === "active";
      const full = competition.max_entrants != null && competition.entrants >= competition.max_entrants && !competition.joined;
      const active = activeId === competition.id;
      return <article key={competition.id} className={`border p-5 ${active ? "border-accent-green bg-accent-green/5" : "border-bg-border bg-bg-soft"}`}>
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">{statusText(competition.status)}</p><h2 className="mt-1 text-lg font-bold">{competition.name}</h2></div>{active ? <span className="rounded-full bg-accent-green px-2 py-1 text-[10px] font-black text-black">SELECTED</span> : <Trophy className="h-5 w-5 text-accent-green" />}</div>
        {competition.description ? <p className="mt-3 text-sm text-gray-400">{competition.description}</p> : null}
        <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-bg-border py-3 text-xs"><div><dt className="text-gray-500">Score</dt><dd className="mt-1 font-bold">{competition.scoring_method === "net_profit" ? "Net P/L" : "Return %"}</dd></div><div><dt className="text-gray-500">Starting cash</dt><dd className="mt-1 font-bold tabular-nums">{formatUSD(Number(competition.starting_cash))}</dd></div><div><dt className="text-gray-500">Entrants</dt><dd className="mt-1 flex items-center gap-1 font-bold"><Users className="h-3.5 w-3.5" /> {competition.entrants}{competition.max_entrants ? ` / ${competition.max_entrants}` : ""}</dd></div><div><dt className="text-gray-500">Starts</dt><dd className="mt-1 flex items-center gap-1 font-bold"><CalendarDays className="h-3.5 w-3.5" /> {new Date(competition.start_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</dd></div></dl>
        {competition.prize_description ? <p className="mt-3 text-xs text-gray-400"><strong className="text-gray-200">Club prize:</strong> {competition.prize_description}</p> : null}
        {competition.rules ? <p className="mt-2 text-xs leading-5 text-gray-500">{competition.rules}</p> : null}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" disabled={active || !selectable || full || joining === competition.id} onClick={() => void selectCompetition(competition.id)} className="flex min-h-11 w-full items-center justify-center gap-2 bg-accent-green px-4 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-bg-elevated disabled:text-gray-500">{joining === competition.id ? <><Loader2 className="h-4 w-4 animate-spin" /> Joining</> : active ? "Current competition" : full ? <><Lock className="h-4 w-4" /> Competition full</> : selectable ? competition.joined ? "Switch to competition" : "Join competition" : <><Lock className="h-4 w-4" /> Enrollment closed</>}</button>{active ? <Link href="/messages" className="flex min-h-11 items-center justify-center border border-bg-border px-4 text-sm font-bold text-gray-100 transition-colors hover:border-accent-green hover:text-accent-green">Message members</Link> : null}</div>
      </article>;
    })}</div> : <div className="mt-6 border border-bg-border py-16 text-center"><Trophy className="mx-auto h-7 w-7 text-gray-600" /><h2 className="mt-3 font-bold">No competitions published yet</h2><p className="mt-1 text-sm text-gray-500">Your club organizer can publish the next paper challenge from Admin.</p></div>}
  </section>;
}
