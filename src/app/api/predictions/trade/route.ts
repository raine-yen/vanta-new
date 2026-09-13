// Browser-facing prediction buy endpoint — session auth, shared paper cash.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buyPredictionShares } from "@/lib/prediction-engine";
import { getCurrentAccount } from "@/lib/app-data";

const buySchema = z.object({
  market_id: z.string().min(1),
  outcome: z.enum(["yes", "no"]),
  stake_usd: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  client_order_id: z.string().min(8).max(128).optional(),
});

export async function POST(req: NextRequest) {
  const context = await getCurrentAccount(req);
  if ("response" in context) return context.response;

  const body = await req.json().catch(() => null);
  const parsed = buySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  const account = context.account;
  if (context.competition && context.competition.status !== "active") {
    return NextResponse.json({ error: "Prediction trading is unavailable while this competition is not in progress." }, { status: 403 });
  }

  const r = await buyPredictionShares({
    accountId: account.id,
    marketId: parsed.data.market_id,
    outcome: parsed.data.outcome,
    stakeUsd: parsed.data.stake_usd,
    clientOrderId: parsed.data.client_order_id,
  });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json({
    ok: true,
    shares: r.result.shares,
    cost: r.result.cost,
    price: r.result.price,
    cash_after: r.result.cash_after,
    duplicate: r.result.duplicate,
  });
}
