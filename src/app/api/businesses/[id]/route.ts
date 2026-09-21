// Businesses CRUD — support session or API key auth.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/auth";
import { getSessionUser } from "@/lib/session-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAccount } from "@/lib/app-data";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().or(z.literal("")).optional(),
  category: z.string().max(100).optional().or(z.literal("")).optional(),
  website: z.string().url().optional().or(z.literal("")).optional(),
  contact_email: z.string().email().optional().or(z.literal("")).optional(),
  contact_phone: z.string().max(50).optional().or(z.literal("")).optional(),
  address: z.string().max(1000).optional().or(z.literal("")).optional(),
  notes: z.string().max(5000).optional().or(z.literal("")).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Support API key auth for agents
  const apiAuth = await authenticateApiKey(req);
  if (apiAuth.ok) {
    const db = supabaseAdmin();
    const { data } = await db
      .from("businesses")
      .select("*")
      .eq("id", (await params).id)
      .eq("account_id", apiAuth.auth.account.id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: "business not found" }, { status: 404 });
    }
    return NextResponse.json({ business: data });
  }

  // Fallback to session auth
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const context = await getCurrentAccount(req);
  if ("response" in context) return context.response;

  const db = supabaseAdmin();
  const { data } = await db
    .from("businesses")
    .select("*")
    .eq("id", (await params).id)
    .eq("account_id", context.account.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }
  return NextResponse.json({ business: data });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Support API key auth for agents
  const apiAuth = await authenticateApiKey(req);
  if (apiAuth.ok) {
    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { code: 42210000, message: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 422 },
      );
    }

    const db = supabaseAdmin();

    // Verify ownership
    const { data: existing } = await db
      .from("businesses")
      .select("id")
      .eq("id", (await params).id)
      .eq("account_id", apiAuth.auth.account.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ code: 40400000, message: "business not found" }, { status: 404 });
    }

    const { data, error } = await db
      .from("businesses")
      .update({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        category: parsed.data.category ?? null,
        website: parsed.data.website ?? null,
        contact_email: parsed.data.contact_email ?? null,
        contact_phone: parsed.data.contact_phone ?? null,
        address: parsed.data.address ?? null,
        notes: parsed.data.notes ?? null,
        is_active: parsed.data.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (await params).id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { code: 50010000, message: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ business: data });
  }

  // Fallback to session auth
  const context = await getCurrentAccount(req);
  if ("response" in context) return context.response;

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 422 },
    );
  }

  const db = supabaseAdmin();

  // Verify ownership
  const { data: existing } = await db
    .from("businesses")
    .select("id")
    .eq("id", (await params).id)
    .eq("account_id", context.account.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }

  const { data, error } = await db
    .from("businesses")
    .update({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      website: parsed.data.website ?? null,
      contact_email: parsed.data.contact_email ?? null,
      contact_phone: parsed.data.contact_phone ?? null,
      address: parsed.data.address ?? null,
      notes: parsed.data.notes ?? null,
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", (await params).id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ business: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Support API key auth for agents
  const apiAuth = await authenticateApiKey(req);
  if (apiAuth.ok) {
    const db = supabaseAdmin();

    // Verify ownership
    const { data: existing } = await db
      .from("businesses")
      .select("id")
      .eq("id", (await params).id)
      .eq("account_id", apiAuth.auth.account.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ code: 40400000, message: "business not found" }, { status: 404 });
    }

    const { error } = await db
      .from("businesses")
      .delete()
      .eq("id", (await params).id);

    if (error) {
      return NextResponse.json(
        { code: 50010000, message: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Fallback to session auth
  const context = await getCurrentAccount(req);
  if ("response" in context) return context.response;

  const db = supabaseAdmin();

  // Verify ownership
  const { data: existing } = await db
    .from("businesses")
    .select("id")
    .eq("id", (await params).id)
    .eq("account_id", context.account.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }

  const { error } = await db
    .from("businesses")
    .delete()
    .eq("id", (await params).id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
