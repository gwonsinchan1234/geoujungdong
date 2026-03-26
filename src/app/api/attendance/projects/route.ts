import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseWithToken } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getToken(req: NextRequest): string {
  return req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
}

function getAdminOrNull() {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

// GET /api/attendance/projects
export async function GET(req: NextRequest) {
  try {
    const token = getToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

    const db = getSupabaseWithToken(token);
    const { data: { user }, error: userErr } = await db.auth.getUser();
    if (userErr) return NextResponse.json({ ok: false, error: userErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 });
    const { data, error } = await db
      .from("attendance_projects")
      .select("id, name, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      const admin = getAdminOrNull();
      if (admin) {
        const { data: data2, error: err2 } = await admin
          .from("attendance_projects")
          .select("id, name, description, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (err2) return NextResponse.json({ ok: false, error: err2.message }, { status: 500 });
        return NextResponse.json({ ok: true, projects: data2 ?? [] });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, projects: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

// POST /api/attendance/projects  { name, description? }
export async function POST(req: NextRequest) {
  try {
    const token = getToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name        = String(body?.name        ?? "").trim();
    const description = String(body?.description ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "프로젝트 이름 필요" }, { status: 400 });

    const db = getSupabaseWithToken(token);

    // auth.uid() 확인
    const { data: { user }, error: userErr } = await db.auth.getUser();
    if (userErr) return NextResponse.json({ ok: false, error: userErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 });

    const { data, error } = await db
      .from("attendance_projects")
      .upsert({ user_id: user.id, name, description }, { onConflict: "user_id,name" })
      .select("id, name, description, created_at")
      .single();

    if (error) {
      const admin = getAdminOrNull();
      if (admin) {
        const { data: data2, error: err2 } = await admin
          .from("attendance_projects")
          .upsert({ user_id: user.id, name, description }, { onConflict: "user_id,name" })
          .select("id, name, description, created_at")
          .single();
        if (err2) return NextResponse.json({ ok: false, error: err2.message }, { status: 500 });
        return NextResponse.json({ ok: true, project: data2 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, project: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

// DELETE /api/attendance/projects?id=UUID
export async function DELETE(req: NextRequest) {
  try {
    const token = getToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim() ?? "";
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });

    const db = getSupabaseWithToken(token);
    const { data: { user }, error: userErr } = await db.auth.getUser();
    if (userErr) return NextResponse.json({ ok: false, error: userErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 });

    const { error } = await db.from("attendance_projects").delete().eq("id", id).eq("user_id", user.id);

    if (error) {
      const admin = getAdminOrNull();
      if (admin) {
        const { error: err2 } = await admin.from("attendance_projects").delete().eq("id", id).eq("user_id", user.id);
        if (err2) return NextResponse.json({ ok: false, error: err2.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
