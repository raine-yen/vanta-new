import { NextRequest, NextResponse } from "next/server";
import { settlePredictionMarkets } from "@/lib/prediction-settle";
import { resolveAccount } from "../../auth-utils";

// Settles only the authenticated trader's resolved prediction positions. Supports session or API key auth.
export async function POST(req: NextRequest) {
  const context = await resolveAccount(req);
  if (!("account" in context)) return context as NextResponse;
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
