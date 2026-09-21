// Close-early sell endpoint — supports session or API key auth for agents
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sellPredictionShares } from "@/lib/prediction-engine";
import { resolveAccount } from "../../auth-utils";

const closeSchema = z
  .object({
    market_id: z.string().min(1),
    outcome: z.enum(["yes", "no"]),
    shares: z.union([z.number(), z.string()]).optional().transform((v) => (v == null ? undefined : Number(v))),
    close_all: z.boolean().optional(),
    client_order_id: z.string().min(8).max(128).optional(),
  })
  .refine((d) => d.close_all === true || (d.shares != null && d.shares > 0), {
    message: "provide shares > 0 or close_all: true",
  });

export async function POST(req: NextRequest) {
  const context = await resolveAccount(req);
  if (!("account" in context)) return context as NextResponse;

  const body = await req.json().catch(() => null);
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  const account = context.account;

  const r = await sellPredictionShares({
    accountId: account.id,
    marketId: parsed.data.market_id,
    outcome: parsed.data.outcome,
    shares: parsed.data.shares,
    closeAll: parsed.data.close_all,
    clientOrderId: parsed.data.client_order_id,
  });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json({
    ok: true,
    shares: r.result.shares,
    proceeds: r.result.proceeds,
    realized_pnl: r.result.realizedPnl,
    cash_after: r.result.cash_after,
    closed: r.result.closed,
    duplicate: r.result.duplicate,
  });
}
