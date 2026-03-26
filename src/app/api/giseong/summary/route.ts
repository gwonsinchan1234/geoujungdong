import { NextRequest, NextResponse } from "next/server";
import { getSupabaseWithToken } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// ── 토큰 추출 헬퍼 ────────────────────────────────────────────────
function getToken(req: NextRequest): string {
  return req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
}

// GET /api/giseong/summary?projectId=UUID&userId=UUID
// 노무 집계 (labor_summary) 반환
// 자재 집계는 추후 확장: material_total 필드로 placeholder 제공
export async function GET(req: NextRequest) {
  try {
    const token = getToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "인증 토큰이 없습니다." }, { status: 401 });

    const db = getSupabaseWithToken(token);
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "인증 실패" }, { status: 401 });
    const userId = user.id;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim() ?? "";

    if (!projectId) return NextResponse.json({ ok: false, error: "projectId 필요" }, { status: 400 });

    const { data: labor, error: laborErr } = await db
      .from("labor_summary")
      .select("person_name, employee_id, company, total_labor_units, work_days, updated_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("company", { ascending: true })
      .order("person_name", { ascending: true });

    if (laborErr) return NextResponse.json({ ok: false, error: laborErr.message }, { status: 500 });

    const rows = labor ?? [];
    const total_labor_units = rows.reduce((s, r) => s + Number(r.total_labor_units ?? 0), 0);
    const total_work_days   = rows.reduce((s, r) => s + Number(r.work_days ?? 0), 0);

    // 협력사별 집계
    const companyMap = new Map<string, { persons: number; labor_units: number; work_days: number }>();
    for (const r of rows) {
      const co = r.company || "미지정";
      const cur = companyMap.get(co);
      if (!cur) companyMap.set(co, { persons: 1, labor_units: Number(r.total_labor_units), work_days: Number(r.work_days) });
      else { cur.persons++; cur.labor_units += Number(r.total_labor_units); cur.work_days += Number(r.work_days); }
    }
    const by_company = Array.from(companyMap.entries())
      .map(([company, v]) => ({ company, ...v }))
      .sort((a, b) => b.labor_units - a.labor_units);

    return NextResponse.json({
      ok: true,
      labor: rows,
      by_company,
      total_labor_units,
      total_work_days,
      material_total: 0,     // placeholder — 자재 연동 시 업데이트
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
