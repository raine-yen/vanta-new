import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const callbackUrl = new URL("/auth/callback", requestUrl.origin);
  callbackUrl.searchParams.set("next", safeNext(requestUrl.searchParams.get("next")));

  const { data, error } = await (await supabaseServer()).auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    console.error("Google OAuth start failed", error?.message ?? "missing provider URL");
    return NextResponse.redirect(new URL("/login?error=google_oauth_unavailable", requestUrl.origin));
  }

  return NextResponse.redirect(data.url);
}
