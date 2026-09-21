// On-demand catalog + settlement refresh — supports session or API key auth
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncPredictionCatalog } from "@/lib/prediction-sync";
import { settlePredictionMarkets } from "@/lib/prediction-settle";
import { getSessionUser } from "@/lib/session-user";
import { authenticateApiKey } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // API key auth for agents
  const apiAuth = await authenticateApiKey(req);
  if (apiAuth.ok) {
    const db = supabaseAdmin();
    try {
      const synced = await syncPredictionCatalog(db);
      const settled = await settlePredictionMarkets({ db: db as any });
      return NextResponse.json({ ok: true, synced, settled });
    } catch (e) {
      console.error("on-demand prediction refresh failed", e);
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
  }

  // Fallback to session auth
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const db = supabaseAdmin();
    const synced = await syncPredictionCatalog(db);
    const settled = await settlePredictionMarkets({ db: db as any });
    return NextResponse.json({ ok: true, synced, settled });
  } catch (e) {
    console.error("on-demand prediction refresh failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
