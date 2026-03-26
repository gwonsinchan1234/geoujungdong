import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/giseong/summary?projectId=UUID&userId=UUID
// 노무 집계 (labor_summary) 반환
// 자재 집계는 추후 확장: material_total 필드로 placeholder 제공
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim() ?? "";
    const userId    = searchParams.get("userId")?.trim()    ?? "";

    if (!projectId) return NextResponse.json({ ok: false, error: "projectId 필요" }, { status: 400 });
    if (!userId)    return NextResponse.json({ ok: false, error: "userId 필요" },    { status: 400 });

    const admin = getSupabaseAdmin();

    const { data: labor, error: laborErr } = await admin
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
