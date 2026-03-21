import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();

    const { data: doc, error: docErr } = await admin
      .from("safety_labor_documents")
      .select("id, person_name, payment_date, month_key, amount, status, attachment_count, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (docErr) return NextResponse.json({ ok: false, error: docErr.message }, { status: 500 });
    if (!doc) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

    const { data: atts, error: attErr } = await admin
      .from("safety_labor_attachments")
      .select("id, file_name, mime_type, size_bytes, storage_path, created_at")
      .eq("document_id", id)
      .order("created_at", { ascending: false });

    if (attErr) return NextResponse.json({ ok: false, error: attErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, doc, attachments: atts ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.personName !== undefined) {
      const personName = String(body.personName ?? "").trim();
      if (!personName) return NextResponse.json({ ok: false, error: "personName required" }, { status: 400 });
      fields.person_name = personName;
    }
    if (body.paymentDate !== undefined) {
      const paymentDate = String(body.paymentDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
        return NextResponse.json({ ok: false, error: "paymentDate must be YYYY-MM-DD" }, { status: 400 });
      }
      fields.payment_date = paymentDate;
      fields.month_key = paymentDate.slice(0, 7);
    }
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ ok: false, error: "amount must be >= 0" }, { status: 400 });
      }
      fields.amount = amount;
    }

    const { data, error } = await admin
      .from("safety_labor_documents")
      .update(fields)
      .eq("id", id)
      .select("id, person_name, payment_date, month_key, amount, status, attachment_count, created_at, updated_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, doc: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
