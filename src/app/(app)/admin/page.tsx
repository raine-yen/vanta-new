"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, TrendingUp, DollarSign, BarChart2,
  RotateCcw, BanIcon, CheckCircle, AlertTriangle, Timer, Trash2,
  Loader2, Pencil, Search,
  Eye,
} from "lucide-react";
import { formatUSD, formatPct, cn } from "@/lib/utils";

interface AdminAccount {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  cash: number;
  starting_cash: number;
  equity: number;
  status: string;
  return_pct: number;
  positions: Array<{
    symbol: string;
    qty: number;
    avg_entry_price: number;
    current_price: number;
    market_value: number;
  }>;
  position_count: number;
  order_count: number;
  created_at: string;
}

interface AdminStats {
  total_users: number;
  total_orders: number;
  total_equity: number;
  avg_return_pct: number;
  open_reports?: number;
}

interface AdminData {
  admin_user_id: string;
  accounts: AdminAccount[];
  stats: AdminStats;
  moderation?: {
    reports: Array<{ id: string; status: string; reason: string; message_id: string; created_at: string; direct_messages?: { body?: string; sender_account_id?: string; recipient_account_id?: string } }>;
    blocks: Array<{ id: string; blocker_account_id: string; blocked_account_id: string; created_at: string }>;
  };
}

type ActionState = { accountId?: string; accountIds?: string[]; type: string; symbol?: string } | null;

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [pendingAction, setPendingAction] = useState<ActionState>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{ id: string; name: string; cash: number } | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedAssets, setExpandedAssets] = useState<Record<string, boolean>>({});
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  async function fetchData() {
    const r = await fetch("/api/admin", { cache: "no-store" });
    if (r.status === 403) {
      setError("Access denied. Admin only.");
      setLoading(false);
      return;
    }
    if (!r.ok) {
      setError("Failed to load admin data.");
      setLoading(false);
      return;
    }
    const j = await r.json();
    setData(j);
    setSelectedAccountIds((selected) => selected.filter((id) => j.accounts.some((account: AdminAccount) => account.id === id)));
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function runAction(accountId: string | undefined, action: string, extra?: Record<string, unknown>) {
    setActionLoading(true);
    setActionResult(null);
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, account_id: accountId, ...extra }),
    });
    const j = await r.json();
    if (r.ok && j.ok) {
      setActionResult({ ok: true, msg: j.message ?? "Done" });
      await fetchData();
    } else {
      setActionResult({ ok: false, msg: j.error ?? "Action failed" });
    }
    setActionLoading(false);
    setPendingAction(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-20 card p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-accent-red mx-auto mb-4" />
        <h2 className="font-semibold text-lg mb-2">Access Denied</h2>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { stats, accounts } = data;
  const filtered = accounts.filter(
    (a) =>
      !search ||
      a.display_name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );
  const selectableFiltered = filtered.filter((account) => account.user_id !== data.admin_user_id);
  const selectedCount = selectedAccountIds.length;
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((account) => selectedAccountIds.includes(account.id));

  function toggleAccount(id: string) {
    setSelectedAccountIds((selected) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function toggleAllFiltered() {
    setSelectedAccountIds((selected) => allFilteredSelected
      ? selected.filter((id) => !selectableFiltered.some((account) => account.id === id))
      : Array.from(new Set([...selected, ...selectableFiltered.map((account) => account.id)])));
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3"><p className="text-sm text-gray-400">Manage all accounts and competitions</p><Link href="/admin/competitions" className="text-xs font-bold text-accent-green hover:text-white">Competition studio</Link></div>
      </div>

      {/* Action result banner */}
      {actionResult && (
        <div
          className={cn(
            "p-4 rounded-xl text-sm font-medium flex items-center gap-3",
            actionResult.ok
              ? "bg-accent-green/10 text-accent-green"
              : "bg-accent-red/10 text-accent-red"
          )}
        >
          {actionResult.ok ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          {actionResult.msg}
          <button className="ml-auto text-xs underline" onClick={() => setActionResult(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Traders"
          value={stats.total_users.toString()}
          icon={Users}
        />
        <StatCard
          label="Total Orders"
          value={stats.total_orders.toLocaleString()}
          icon={BarChart2}
        />
        <StatCard
          label="Total AUM"
          value={formatUSD(stats.total_equity)}
          icon={DollarSign}
        />
        <StatCard
          label="Avg Return"
          value={formatPct(stats.avg_return_pct)}
          icon={TrendingUp}
          valueColor={stats.avg_return_pct >= 0 ? "text-accent-green" : "text-accent-red"}
        />
        <StatCard
          label="Open Reports"
          value={String(stats.open_reports ?? 0)}
          icon={AlertTriangle}
          valueColor={(stats.open_reports ?? 0) > 0 ? "text-accent-red" : "text-accent-green"}
        />

      </div>

      {/* Accounts table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-bg-border flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-semibold">All Accounts</h2>
          <div className="flex flex-wrap items-center justify-end gap-2"><div className="flex items-center gap-2 bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 w-64">
            <Search className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <input
              className="bg-transparent text-sm outline-none placeholder-gray-500 flex-1"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>{selectedCount > 0 ? <><span className="text-xs font-semibold text-gray-400">{selectedCount} selected</span><button type="button" onClick={() => setPendingAction({ type: "delete_users", accountIds: selectedAccountIds })} className="min-h-11 rounded-lg bg-accent-red px-3 text-xs font-bold text-white hover:bg-red-500">Delete selected</button><button type="button" onClick={() => setSelectedAccountIds([])} className="min-h-11 px-2 text-xs font-semibold text-gray-400 hover:text-white">Clear</button></> : null}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase tracking-wider bg-bg-elevated/60">
              <tr>
                <th className="py-3 px-3"><input type="checkbox" aria-label="Select all removable users shown" checked={allFilteredSelected} onChange={toggleAllFiltered} className="h-4 w-4 accent-accent-red" /></th>
                <th className="text-left py-3 px-4 font-medium">#</th>
                <th className="text-left py-3 px-4 font-medium">Trader</th>
                <th className="text-left py-3 px-4 font-medium">Email</th>
                <th className="text-right py-3 px-4 font-medium">Equity</th>
                <th className="text-right py-3 px-4 font-medium">Cash</th>
                <th className="text-right py-3 px-4 font-medium">Return</th>
                <th className="text-right py-3 px-4 font-medium">Pos</th>
                <th className="text-right py-3 px-4 font-medium">Orders</th>
                <th className="text-right py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {filtered.map((a, i) => {
                const up = a.return_pct >= 0;
                const isDisabled = a.status === "disabled";
                return (
                  <Fragment key={a.id}>
                    <tr
                      className={cn(
                        "hover:bg-bg-elevated/40 transition-colors",
                        isDisabled && "opacity-50"
                      )}
                    >
                      <td className="py-3 px-3"><input type="checkbox" aria-label={`Select ${a.display_name} for permanent deletion`} checked={selectedAccountIds.includes(a.id)} onChange={() => toggleAccount(a.id)} disabled={a.user_id === data.admin_user_id} className="h-4 w-4 accent-accent-red disabled:cursor-not-allowed disabled:opacity-30" /></td>
                      <td className="py-3 px-4 text-gray-500 tabular-nums">{i + 1}</td>
                      <td className="py-3 px-4 font-medium">{a.display_name}</td>
                      <td className="py-3 px-4 text-gray-400 text-xs">{a.email}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium">
                        {formatUSD(Number(a.equity))}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-400">
                        {formatUSD(Number(a.cash))}
                      </td>
                      <td className={cn("py-3 px-4 text-right tabular-nums font-semibold", up ? "text-accent-green" : "text-accent-red")}>
                        {formatPct(a.return_pct)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-400">{a.position_count}</td>
                      <td className="py-3 px-4 text-right text-gray-400">{a.order_count}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={cn(
                          "badge",
                          isDisabled
                            ? "bg-gray-500/20 text-gray-400"
                            : "bg-accent-green/20 text-accent-green"
                        )}>
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            title="View assets"
                            onClick={() => setExpandedAssets((prev) => ({ ...prev, [a.id]: !prev[a.id] }))}
                            className="p-1.5 rounded-lg hover:bg-accent-blue/20 text-gray-500 hover:text-accent-blue transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Rename */}
                          <button
                            title="Change username"
                            onClick={() => {
                              setRenameTarget({ id: a.id, name: a.display_name });
                              setRenameValue(a.display_name);
                            }}
                            className="p-1.5 rounded-lg hover:bg-accent-green/20 text-gray-500 hover:text-accent-green transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Adjust cash */}
                          <button
                            title="Adjust cash"
                            onClick={() => {
                              setAdjustTarget({ id: a.id, name: a.display_name, cash: Number(a.cash) });
                              setAdjustAmount(Number(a.cash).toFixed(2));
                            }}
                            className="p-1.5 rounded-lg hover:bg-accent/20 text-gray-500 hover:text-accent transition-colors"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>

                          {/* Reset */}
                          <button
                            title="Reset portfolio"
                            onClick={() => setPendingAction({ accountId: a.id, type: "reset" })}
                            className="p-1.5 rounded-lg hover:bg-yellow-500/20 text-gray-500 hover:text-yellow-400 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          {!isDisabled && (
                            <button
                              title="Timeout account for 24 hours"
                              onClick={() => setPendingAction({ accountId: a.id, type: "timeout" })}
                              className="p-1.5 rounded-lg hover:bg-yellow-500/20 text-gray-500 hover:text-yellow-400 transition-colors"
                            >
                              <Timer className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            title="Permanently delete user"
                            onClick={() => setPendingAction({ accountId: a.id, type: "delete_user" })}
                            className="p-1.5 rounded-lg hover:bg-accent-red/20 text-gray-500 hover:text-accent-red transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {isDisabled ? (
                            <button
                              title="Enable account"
                              onClick={() => setPendingAction({ accountId: a.id, type: "enable" })}
                              className="p-1.5 rounded-lg hover:bg-accent-green/20 text-gray-500 hover:text-accent-green transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              title="Disable account"
                              onClick={() => setPendingAction({ accountId: a.id, type: "disable" })}
                              className="p-1.5 rounded-lg hover:bg-accent-red/20 text-gray-500 hover:text-accent-red transition-colors"
                            >
                              <BanIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedAssets[a.id] && (
                      <tr className="bg-bg-elevated/35">
                        <td colSpan={11} className="px-4 py-4">
                          {a.positions.length === 0 ? (
                            <div className="text-sm text-gray-500">{a.display_name} has no open assets.</div>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-4">
                              {a.positions.map((p) => (
                                <div key={p.symbol} className="rounded-lg border border-bg-border bg-bg-card p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="font-mono font-bold">{p.symbol}</div>
                                    <div className="flex items-center gap-2"><div className="text-sm font-semibold tabular-nums">{formatUSD(p.market_value)}</div><button type="button" title={`Close ${p.symbol} position`} onClick={() => setPendingAction({ accountId: a.id, type: "close_position", symbol: p.symbol })} className="rounded p-1 text-gray-500 transition hover:bg-accent-red/20 hover:text-accent-red"><Trash2 className="h-3.5 w-3.5" /></button></div>
                                  </div>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-500">
                                    <div>{p.qty.toFixed(4)} shares</div>
                                    <div className="text-right">{formatUSD(p.current_price)}</div>
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

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-500">No accounts found.</div>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-bg-border p-5">
            <h2 className="font-semibold">Message Reports</h2>
            <p className="mt-1 text-xs text-gray-500">Hide unsafe direct messages or dismiss reviewed reports.</p>
          </div>
          <div className="divide-y divide-bg-border">
            {(data.moderation?.reports ?? []).length === 0 ? (
              <div className="p-8 text-sm text-gray-500">No reports yet.</div>
            ) : (
              data.moderation!.reports.slice(0, 8).map((report) => (
                <div key={report.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{report.reason}</div>
                      <p className="mt-1 text-sm text-gray-400">{report.direct_messages?.body ?? "Message unavailable"}</p>
                      <div className="mt-1 text-xs text-gray-500">{report.status}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-sell px-3 py-1.5 text-xs" onClick={() => runAction("", "hide_message", { message_id: report.message_id })}>Hide</button>
                      <button className="btn-ghost border border-bg-border px-3 py-1.5 text-xs" onClick={() => runAction("", "dismiss_report", { report_id: report.id })}>Dismiss</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

              </div>

      {/* Confirm action modal */}
      {pendingAction && (
        <ConfirmModal
          title={pendingAction.type === "reset" ? "Reset Portfolio?" : pendingAction.type === "close_position" ? `Close ${pendingAction.symbol} position?` : pendingAction.type === "delete_users" ? `Permanently Delete ${pendingAction.accountIds?.length ?? 0} Users?` : pendingAction.type === "disable" ? "Disable Account?" : pendingAction.type === "timeout" ? "Timeout Account for 24 Hours?" : pendingAction.type === "delete_user" ? "Permanently Delete User?" : "Enable Account?"}
          description={
            pendingAction.type === "reset"
              ? "This will delete all positions, cancel open orders, and restore the account to its starting cash. This cannot be undone."
              : pendingAction.type === "close_position"
              ? "This removes the holding and credits the account with the current quoted value."
              : pendingAction.type === "disable"
              ? "This account will be hidden from the leaderboard and cannot trade."
              : pendingAction.type === "timeout"
              ? "The account cannot trade for 24 hours and is restored automatically when the timeout expires."
              : pendingAction.type === "delete_users"
              ? `This permanently removes ${pendingAction.accountIds?.length ?? 0} users, their accounts, assets, prediction positions, fills, and orders. This cannot be undone.`
              : pendingAction.type === "delete_user"
              ? "This permanently removes the auth user, account, stock positions, prediction positions, fills, and orders. This cannot be undone."
              : "This account will be re-enabled and appear on the leaderboard."
          }
          confirmLabel={pendingAction.type === "reset" ? "Yes, Reset" : pendingAction.type === "close_position" ? "Close position" : pendingAction.type === "delete_users" ? "Delete users" : pendingAction.type === "disable" ? "Disable" : pendingAction.type === "timeout" ? "Timeout 24h" : pendingAction.type === "delete_user" ? "Delete permanently" : "Enable"}
          danger={pendingAction.type !== "enable"}
          loading={actionLoading}
          onConfirm={() => runAction(pendingAction.accountId, pendingAction.type, pendingAction.type === "timeout" ? { duration_minutes: 1440 } : pendingAction.type === "close_position" ? { symbol: pendingAction.symbol } : pendingAction.type === "delete_users" ? { account_ids: pendingAction.accountIds } : undefined)}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {/* Rename modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-card border border-bg-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-semibold mb-1">Change Username</h3>
            <p className="text-sm text-gray-400 mb-4">Rename {renameTarget.name}. This updates leaderboard and account display text.</p>
            <input
              className="input mb-4"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              minLength={2}
              maxLength={40}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 rounded-xl border border-bg-border text-sm font-medium hover:bg-bg-elevated transition-colors"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                disabled={actionLoading || renameValue.trim().length < 2 || renameValue.trim().length > 40}
                className="flex-1 py-2.5 rounded-xl bg-accent-green text-black font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                onClick={async () => {
                  await runAction(renameTarget.id, "update_display_name", { display_name: renameValue.trim() });
                  setRenameTarget(null);
                }}
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust cash modal */}
      {adjustTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-card border border-bg-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-semibold mb-1">Adjust Cash — {adjustTarget.name}</h3>
            <p className="text-sm text-gray-400 mb-4">Set the new cash balance. Positions are unchanged; equity will update on next cron tick.</p>
            <div className="flex items-center bg-bg-elevated rounded-xl border border-bg-border focus-within:border-accent transition-colors mb-4">
              <span className="pl-4 text-gray-500 font-semibold">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="bg-transparent flex-1 px-3 py-3 outline-none font-semibold tabular-nums"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 rounded-xl border border-bg-border text-sm font-medium hover:bg-bg-elevated transition-colors"
                onClick={() => setAdjustTarget(null)}
              >
                Cancel
              </button>
              <button
                disabled={actionLoading || !adjustAmount || Number(adjustAmount) < 0}
                className="flex-1 py-2.5 rounded-xl bg-accent text-black font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                onClick={async () => {
                  await runAction(adjustTarget.id, "adjust_cash", { amount: Number(adjustAmount) });
                  setAdjustTarget(null);
                }}
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  valueColor?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="stat-label">{label}</span>
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div className={cn("stat", valueColor)}>{value}</div>
    </div>
  );
}

// ── Confirm modal ──────────────────────────────────────────────────────────

function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-bg-card border border-bg-border rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className={cn("w-5 h-5 mt-0.5 shrink-0", danger ? "text-accent-red" : "text-yellow-400")} />
          <div>
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-gray-400">{description}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-bg-border text-sm font-medium hover:bg-bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40",
              danger ? "bg-accent-red text-white hover:bg-red-500" : "bg-accent text-black hover:opacity-90"
            )}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
