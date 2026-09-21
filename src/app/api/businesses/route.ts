// Businesses list endpoint — supports session or API key auth.
// Agents can use their API key to list, create, and manage businesses.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/auth";
import { getSessionUser } from "@/lib/session-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAccount } from "@/lib/app-data";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  category: z.string().max(100).optional().default(""),
  website: z.string().url().optional().or(z.literal("")).optional().default(""),
  contact_email: z.string().email().optional().or(z.literal("")).optional().default(""),
  contact_phone: z.string().max(50).optional().or(z.literal("")).optional().default(""),
  address: z.string().max(1000).optional().or(z.literal("")).optional().default(""),
  notes: z.string().max(5000).optional().or(z.literal("")).optional().default(""),
});

export async function GET(req: NextRequest) {
  // Support API key auth for agents
  const apiAuth = await authenticateApiKey(req);
  if (apiAuth.ok) {
    const db = supabaseAdmin();
    const { data } = await db
      .from("businesses")
      .select("*")
      .eq("account_id", apiAuth.auth.account.id)
      .order("created_at", { ascending: false });
    return NextResponse.json({ businesses: data ?? [] });
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
    .eq("account_id", context.account.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ businesses: data ?? [] });
}

export async function POST(req: NextRequest) {
  // Support API key auth for agents
  const apiAuth = await authenticateApiKey(req);
  if (apiAuth.ok) {
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { code: 42210000, message: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 422 },
      );
    }

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("businesses")
      .insert({
        account_id: apiAuth.auth.account.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        category: parsed.data.category || null,
        website: parsed.data.website || null,
        contact_email: parsed.data.contact_email || null,
        contact_phone: parsed.data.contact_phone || null,
        address: parsed.data.address || null,
        notes: parsed.data.notes || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { code: 50010000, message: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ business: data }, { status: 201 });
  }

  // Fallback to session auth
  const context = await getCurrentAccount(req);
  if ("response" in context) return context.response;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 422 },
    );
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("businesses")
    .insert({
      account_id: context.account.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      website: parsed.data.website || null,
      contact_email: parsed.data.contact_email || null,
      contact_phone: parsed.data.contact_phone || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ business: data }, { status: 201 });
}

export const dynamic = "force-dynamic";
