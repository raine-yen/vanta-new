// Watchlists — supports session or API key auth for agents
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cleanSymbol } from "@/lib/app-data";
import { fetchYahooPrices } from "@/lib/prices";
import { resolveAccount, isMissingTableError } from "../auth-utils";

export async function GET(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const { data, error } = await ctx.db
    .from("watchlists")
    .select("id, symbol, note, created_at")
    .eq("account_id", ctx.account.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ items: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ id: string; symbol: string; note: string | null; created_at: string }>;
  const prices = rows.length ? await fetchYahooPrices(rows.map((r) => r.symbol)) : new Map<string, { price: number; prevClose?: number | null }>();
  return NextResponse.json({
    items: rows.map((row) => {
      const price = prices.get(row.symbol);
      const prevClose = price?.prevClose ?? null;
      const changePct = price && prevClose ? ((price.price - prevClose) / prevClose) * 100 : null;
      return { ...row, price: price?.price ?? null, prevClose, changePct };
    }),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const body = await req.json().catch(() => ({}));
  const symbol = cleanSymbol(body.symbol);
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const { data, error } = await ctx.db
    .from("watchlists")
    .upsert({ account_id: ctx.account.id, symbol, note: String(body.note ?? "").slice(0, 160) || null }, { onConflict: "account_id,symbol" })
    .select("id, symbol, note, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: isMissingTableError(error) ? 501 : 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const symbol = cleanSymbol(new URL(req.url).searchParams.get("symbol"));
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const { error } = await ctx.db.from("watchlists").delete().eq("account_id", ctx.account.id).eq("symbol", symbol);
  if (error) return NextResponse.json({ error: error.message }, { status: isMissingTableError(error) ? 501 : 500 });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
