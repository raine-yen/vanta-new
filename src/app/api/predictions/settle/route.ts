import { NextRequest, NextResponse } from "next/server";
import { settlePredictionMarkets } from "@/lib/prediction-settle";
import { getCurrentAccount } from "@/lib/app-data";

// Settles only the signed-in trader's resolved prediction positions. This
// short path lets a user receive a paper payout immediately rather than
// waiting for the once-daily cron settlement pass.
export async function POST(req: NextRequest) {
  const context = await getCurrentAccount(req);
  if ("response" in context) return context.response;
  const { db, account } = context;

  try {
    const settled = await settlePredictionMarkets({ db: db as any, accountId: account.id });
    return NextResponse.json({ ok: true, settled });
  } catch (error) {
    console.error("prediction settlement failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "settlement failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
