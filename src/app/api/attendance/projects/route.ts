import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/attendance/projects?userId=UUID
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId")?.trim() ?? "";
    if (!userId) return NextResponse.json({ ok: false, error: "userId 필요" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("attendance_projects")
      .select("id, name, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, projects: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

// POST /api/attendance/projects  { userId, name, description? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const description = String(body?.description ?? "").trim();

    if (!userId) return NextResponse.json({ ok: false, error: "userId 필요" }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "프로젝트 이름 필요" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("attendance_projects")
      .upsert({ user_id: userId, name, description }, { onConflict: "user_id,name" })
      .select("id, name, description, created_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, project: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

// DELETE /api/attendance/projects?id=UUID&userId=UUID
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim() ?? "";
    const userId = searchParams.get("userId")?.trim() ?? "";
    if (!id || !userId) return NextResponse.json({ ok: false, error: "id, userId 필요" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("attendance_projects")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
