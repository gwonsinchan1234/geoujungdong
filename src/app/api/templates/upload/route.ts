import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

async function makeSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

// POST /api/templates/upload — xlsx 업로드 → Storage + DB
export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null) ?? file?.name ?? "양식";

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const ext = file.name.endsWith(".xls") ? ".xls" : ".xlsx";
  const storagePath = `${user.id}/${randomUUID()}${ext}`;
  const buf = await file.arrayBuffer();

  // Storage 업로드
  const { error: uploadErr } = await admin.storage
    .from("user-templates")
    .upload(storagePath, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // DB 저장
  const { data: tmpl, error: dbErr } = await admin
    .from("user_templates")
    .insert({ user_id: user.id, name, storage_path: storagePath, file_size: file.size })
    .select("id, name, file_size, created_at")
    .single();

  if (dbErr) {
    await admin.storage.from("user-templates").remove([storagePath]);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ template: tmpl });
}
