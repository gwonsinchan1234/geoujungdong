import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

// GET /api/templates — 내 양식 목록
export async function GET() {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_templates")
    .select("id, name, file_size, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

// DELETE /api/templates?id=xxx — 양식 삭제
export async function DELETE(request: NextRequest) {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // 소유 확인 + storage_path 조회
  const { data: tmpl, error: findErr } = await supabaseAdmin
    .from("user_templates")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (findErr || !tmpl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Storage 삭제
  await supabaseAdmin.storage.from("user-templates").remove([tmpl.storage_path]);

  // DB 삭제
  const { error: delErr } = await supabaseAdmin
    .from("user_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
