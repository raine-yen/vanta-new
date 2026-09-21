// Helper: resolve account from session or API key auth
import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { getCurrentAccount, isMissingTableError } from "@/lib/app-data";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Account } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedAccount {
  user: unknown | null;
  account: Account;
  competition: { status: string; allow_crypto: boolean } | null;
  db: SupabaseClient;
}

export async function resolveAccount(req: NextRequest): Promise<ResolvedAccount | NextResponse> {
  // Try API key auth first (for agents)
  const apiAuth = await authenticateApiKey(req);
  if (apiAuth.ok) {
    const db = supabaseAdmin();
    const account = apiAuth.auth.account;
    const { data: competition } = await db
      .from("competitions")
      .select("status, allow_crypto")
      .eq("id", account.competition_id)
      .maybeSingle();
    return { user: null, account, competition: competition as { status: string; allow_crypto: boolean } | null, db };
  }
  // Fallback to session auth
  const context = await getCurrentAccount(req);
  // getCurrentAccount returns { response: NextResponse } on error, or { user, account, db, competition? } on success
  if ("account" in context && "db" in context) return context as ResolvedAccount;
  return (context as any).response;
}

export { isMissingTableError };
