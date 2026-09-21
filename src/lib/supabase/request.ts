import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Returns a Supabase client carrying the caller's authenticated context.
 * Browser requests use the cookie-backed SSR client; Expo/API requests use
 * their bearer token. RLS remains authoritative in both cases.
 */
export async function supabaseForRequest(req: NextRequest): Promise<SupabaseClient> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return supabaseServer();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase request client is not configured.");
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
