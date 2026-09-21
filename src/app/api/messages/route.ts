import { NextRequest, NextResponse } from "next/server";
import { resolveAccount, isMissingTableError } from "../auth-utils";

export async function GET(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const other = new URL(req.url).searchParams.get("account_id");
  let query = ctx.db
    .from("direct_messages")
    .select("id, sender_account_id, recipient_account_id, body, hidden_by_admin, read_at, created_at")
    .eq("hidden_by_admin", false)
    .order("created_at", { ascending: false })
    .limit(80);

  if (other) {
    const { data: recipient } = await ctx.db
      .from("accounts")
      .select("id")
      .eq("id", other)
      .eq("competition_id", ctx.account.competition_id)
      .eq("status", "active")
      .maybeSingle();
    if (!recipient) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

    query = query
      .in("sender_account_id", [ctx.account.id, other])
      .in("recipient_account_id", [ctx.account.id, other]);
  } else {
    query = query.or(`sender_account_id.eq.${ctx.account.id},recipient_account_id.eq.${ctx.account.id}`);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ messages: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // GET is read-only / side-effect free. Marking messages read is an explicit
  // PATCH the client calls once it has actually rendered the conversation.
  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const body = await req.json().catch(() => ({}));
  const other = typeof body.account_id === "string" ? body.account_id : null;

  let query = ctx.db
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_account_id", ctx.account.id)
    .is("read_at", null);
  if (other) query = query.eq("sender_account_id", other);

  const { error } = await query;
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAccount(req);
  if (!("account" in ctx)) return ctx as NextResponse;

  const body = await req.json().catch(() => ({}));
  const recipient = String(body.recipient_account_id ?? "");
  const text = String(body.body ?? "").trim();
  if (!recipient || recipient === ctx.account.id) return NextResponse.json({ error: "valid recipient required" }, { status: 400 });
  if (text.length < 1 || text.length > 500) return NextResponse.json({ error: "message must be 1-500 characters" }, { status: 400 });

  const { data: recipientAccount, error: recipientError } = await ctx.db
    .from("accounts")
    .select("id")
    .eq("id", recipient)
    .eq("competition_id", ctx.account.competition_id)
    .eq("status", "active")
    .maybeSingle();
  if (recipientError) return NextResponse.json({ error: recipientError.message }, { status: 500 });
  if (!recipientAccount) return NextResponse.json({ error: "recipient is not available in this competition" }, { status: 404 });

  const { data: blocked, error: blockError } = await ctx.db
    .from("blocked_users")
    .select("id")
    .or(
      `and(blocker_account_id.eq.${ctx.account.id},blocked_account_id.eq.${recipient}),and(blocker_account_id.eq.${recipient},blocked_account_id.eq.${ctx.account.id})`
    )
    .limit(1);
  if (blockError && !isMissingTableError(blockError)) return NextResponse.json({ error: blockError.message }, { status: 500 });
  if ((blocked ?? []).length > 0) return NextResponse.json({ error: "messaging is blocked between these users" }, { status: 403 });

  const { data, error } = await ctx.db
    .from("direct_messages")
    .insert({ sender_account_id: ctx.account.id, recipient_account_id: recipient, body: text })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: isMissingTableError(error) ? 501 : 500 });
  return NextResponse.json({ message: data });
}

export const dynamic = "force-dynamic";
