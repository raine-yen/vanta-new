import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cleanSymbol } from "@/lib/app-data";
import { resolveAccount, isMissingTableError } from "../auth-utils";

const alertSchema = z.object({
  symbol: z.string().min(1),
  direction: z.enum(["above", "below", "move"]),
  target_price: z.union([z.number(), z.string()]).optional(),
  move_pct: z.union([z.number(), z.string()]).optional(),
});

export async function GET(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const { data, error } = await ctx.db
    .from("price_alerts")
    .select("*")
    .eq("account_id", ctx.account.id)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ alerts: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alerts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const body = await req.json().catch(() => null);
  const parsed = alertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });

  const symbol = cleanSymbol(parsed.data.symbol);
  const targetPrice = parsed.data.target_price == null ? null : Number(parsed.data.target_price);
  const movePct = parsed.data.move_pct == null ? null : Number(parsed.data.move_pct);
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  if (parsed.data.direction === "move" ? !movePct : !targetPrice) {
    return NextResponse.json({ error: "target price or move percent required" }, { status: 400 });
  }

  const { data, error } = await ctx.db
    .from("price_alerts")
    .insert({
      account_id: ctx.account.id,
      symbol,
      direction: parsed.data.direction,
      target_price: targetPrice,
      move_pct: movePct,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: isMissingTableError(error) ? 501 : 500 });
  return NextResponse.json({ alert: data });
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  if (!id || !["active", "paused", "deleted"].includes(status)) {
    return NextResponse.json({ error: "valid id and status required" }, { status: 400 });
  }

  const { error } = await ctx.db
    .from("price_alerts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", ctx.account.id);

  if (error) return NextResponse.json({ error: error.message }, { status: isMissingTableError(error) ? 501 : 500 });
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
