// Trade endpoint — supports session or API key auth for agents
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { placeOrder } from "@/lib/engine";
import { toAlpacaOrder } from "@/lib/alpaca-format";
import { resolveAccount } from "../auth-utils";

const tradeSchema = z.object({
  symbol: z.string().min(1),
  qty: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit"]).default("market"),
  limit_price: z.union([z.number(), z.string()]).optional().transform((v) => (v == null ? undefined : Number(v))),
  scheduled_at: z.string().optional(),
  client_order_id: z.string().min(8).max(128).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const context = await resolveAccount(req);
    if (!("account" in context)) return context as NextResponse;

    const body = await req.json().catch(() => null);
    const parsed = tradeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
    }

    const account = context.account;
    if (context.competition && context.competition.status !== "active") {
      return NextResponse.json({ error: "Trading is unavailable while this competition is not in progress." }, { status: 403 });
    }
    if (context.competition && !context.competition.allow_crypto && parsed.data.symbol.toUpperCase().endsWith("-USD")) {
      return NextResponse.json({ error: "Crypto trading is disabled for this competition." }, { status: 403 });
    }

    const order = await placeOrder({
      account,
      symbol: parsed.data.symbol,
      qty: parsed.data.qty,
      side: parsed.data.side,
      type: parsed.data.type,
      limit_price: parsed.data.limit_price,
      client_order_id: parsed.data.client_order_id,
      scheduled_at: parsed.data.scheduled_at,
    });

    if (!order.ok) return NextResponse.json({ error: order.error }, { status: 422 });
    return NextResponse.json(toAlpacaOrder(order.order!));
  } catch (error) {
    console.error("paper trade submission failed", error);
    return NextResponse.json({ error: "Order service is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
