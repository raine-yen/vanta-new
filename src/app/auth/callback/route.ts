import { NextRequest, NextResponse } from "next/server";
import { ensurePaperAccount } from "@/lib/ensure-paper-account";
import { supabaseServer } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=google_callback_failed", requestUrl.origin));
  }

  const sb = await supabaseServer();
  const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("Google OAuth callback failed", exchangeError.message);
    return NextResponse.redirect(new URL("/login?error=google_callback_failed", requestUrl.origin));
  }

  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) {
    return NextResponse.redirect(new URL("/login?error=google_callback_failed", requestUrl.origin));
  }

  try {
    await ensurePaperAccount(userData.user, sb);
  } catch (error) {
    console.error("Google OAuth account provisioning failed", error);
    return NextResponse.redirect(new URL("/login?error=account_setup_failed", requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
