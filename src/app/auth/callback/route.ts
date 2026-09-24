import { NextRequest, NextResponse } from "next/server";

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

  // Exchange Google code via Express auth endpoint
  const res = await fetch(`${process.env.APP_URL || "http://localhost:3000"}/api/auth/google/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, next }),
  });

  if (!res.ok) {
    console.error("Google OAuth callback failed", await res.text().catch(() => ""));
    return NextResponse.redirect(new URL("/login?error=google_callback_failed", requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
