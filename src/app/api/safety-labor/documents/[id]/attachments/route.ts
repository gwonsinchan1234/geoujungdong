import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "expense-evidence";

async function syncStatus(admin: ReturnType<typeof getSupabaseAdmin>, docId: string) {
  const { count } = await admin
    .from("safety_labor_attachments")
    .select("id", { count: "exact", head: true })
    .eq("document_id", docId);

  const attachmentCount = Number(count ?? 0);
  await admin
    .from("safety_labor_documents")
    .update({
      attachment_count: attachmentCount,
      status: attachmentCount > 0 ? "완료" : "미완료",
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("safety_labor_attachments")
      .select("id, file_name, mime_type, size_bytes, storage_path, created_at")
      .eq("document_id", id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const withUrl = await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 10);
        return { ...row, url: signed?.signedUrl ?? null };
      })
    );

    return NextResponse.json({ ok: true, rows: withUrl });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const admin = getSupabaseAdmin();
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "이미지 파일만 허용됩니다." }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const now = Date.now();
    const storagePath = `safety_labor/${id}/${now}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buf, {
      upsert: false,
      contentType: file.type,
    });
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    const { data, error } = await admin
      .from("safety_labor_attachments")
      .insert([
        {
          document_id: id,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          storage_path: storagePath,
        },
      ])
      .select("id, file_name, mime_type, size_bytes, storage_path, created_at")
      .single();

    if (error) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    await syncStatus(admin, id);

    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
    return NextResponse.json({ ok: true, row: { ...data, url: signed?.signedUrl ?? null } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
