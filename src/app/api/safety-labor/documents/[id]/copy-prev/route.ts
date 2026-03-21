import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
const BUCKET = "expense-evidence";

function prevMonthKey(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return "";
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const targetMonth = String(body?.targetMonth ?? "").trim();

    if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
      return NextResponse.json({ ok: false, error: "targetMonth must be YYYY-MM" }, { status: 400 });
    }

    const { data: baseDoc, error: baseErr } = await admin
      .from("safety_labor_documents")
      .select("id, person_name")
      .eq("id", id)
      .single();

    if (baseErr) return NextResponse.json({ ok: false, error: baseErr.message }, { status: 500 });

    const prevKey = prevMonthKey(targetMonth);
    if (!prevKey) return NextResponse.json({ ok: false, error: "invalid prev month" }, { status: 400 });

    const { data: srcDoc, error: srcErr } = await admin
      .from("safety_labor_documents")
      .select("id, person_name, amount")
      .eq("person_name", baseDoc.person_name)
      .eq("month_key", prevKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (srcErr) return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 });
    if (!srcDoc) return NextResponse.json({ ok: false, error: "이전월 문서를 찾을 수 없습니다." }, { status: 404 });

    const paymentDate = `${targetMonth}-01`;
    const { data: newDoc, error: newErr } = await admin
      .from("safety_labor_documents")
      .insert([
        {
          person_name: srcDoc.person_name,
          payment_date: paymentDate,
          month_key: targetMonth,
          amount: srcDoc.amount,
          status: "미완료",
          attachment_count: 0,
        },
      ])
      .select("id, person_name, payment_date, month_key, amount, status, attachment_count, created_at")
      .single();

    if (newErr) return NextResponse.json({ ok: false, error: newErr.message }, { status: 500 });

    const { data: srcAtts, error: attErr } = await admin
      .from("safety_labor_attachments")
      .select("file_name, mime_type, size_bytes, storage_path")
      .eq("document_id", srcDoc.id)
      .order("created_at", { ascending: true });
    if (attErr) return NextResponse.json({ ok: false, error: attErr.message }, { status: 500 });

    const copiedRows: Array<Record<string, unknown>> = [];
    for (const att of srcAtts ?? []) {
      const ext = (att.file_name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const newPath = `safety_labor/${newDoc.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: cpErr } = await admin.storage.from(BUCKET).copy(att.storage_path, newPath);
      if (cpErr) continue;
      copiedRows.push({
        document_id: newDoc.id,
        file_name: att.file_name,
        mime_type: att.mime_type,
        size_bytes: att.size_bytes,
        storage_path: newPath,
      });
    }

    if (copiedRows.length > 0) {
      const { error: insErr } = await admin.from("safety_labor_attachments").insert(copiedRows);
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

      await admin
        .from("safety_labor_documents")
        .update({
          attachment_count: copiedRows.length,
          status: "완료",
          updated_at: new Date().toISOString(),
        })
        .eq("id", newDoc.id);
    }

    return NextResponse.json({ ok: true, row: newDoc, copiedAttachmentCount: copiedRows.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
