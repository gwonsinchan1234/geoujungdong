import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/attendance/list?projectId=UUID&userId=UUID
// Returns: batches (업로드 이력), daily (일자별 출결), summary (인원별 집계)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim() ?? "";
    const userId    = searchParams.get("userId")?.trim() ?? "";

    if (!projectId) return NextResponse.json({ ok: false, error: "projectId 필요" }, { status: 400 });
    if (!userId)    return NextResponse.json({ ok: false, error: "userId 필요" },    { status: 400 });

    const admin = getSupabaseAdmin();

    // ── 업로드 배치 목록 (source_file_name 기준)
    const { data: rawData, error: rawErr } = await admin
      .from("attendance_raw")
      .select("source_file_name, work_date, created_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (rawErr) return NextResponse.json({ ok: false, error: rawErr.message }, { status: 500 });

    const batchMap = new Map<string, { source_file_name: string; count: number; first_date: string; last_date: string; uploaded_at: string }>();
    for (const r of rawData ?? []) {
      const fn = r.source_file_name;
      const cur = batchMap.get(fn);
      if (!cur) {
        batchMap.set(fn, { source_file_name: fn, count: 1, first_date: r.work_date, last_date: r.work_date, uploaded_at: r.created_at });
      } else {
        cur.count++;
        if (r.work_date < cur.first_date) cur.first_date = r.work_date;
        if (r.work_date > cur.last_date)  cur.last_date  = r.work_date;
      }
    }
    const batches = Array.from(batchMap.values());

    // ── 일자별 출결
    const { data: daily, error: dailyErr } = await admin
      .from("attendance_daily")
      .select("id, person_name, employee_id, company, work_date, check_in, check_out, total_minutes, labor_units, labor_status, log_count, updated_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("work_date", { ascending: false })
      .order("person_name", { ascending: true });

    if (dailyErr) return NextResponse.json({ ok: false, error: dailyErr.message }, { status: 500 });

    // ── 인원별 집계
    const { data: summary, error: sumErr } = await admin
      .from("labor_summary")
      .select("person_name, employee_id, company, total_labor_units, work_days, updated_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("total_labor_units", { ascending: false });

    if (sumErr) return NextResponse.json({ ok: false, error: sumErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, batches, daily: daily ?? [], summary: summary ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

// DELETE /api/attendance/list?projectId=UUID&userId=UUID&fileName=...
// 특정 파일 배치 삭제 → daily/summary 재계산
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim() ?? "";
    const userId    = searchParams.get("userId")?.trim()    ?? "";
    const fileName  = searchParams.get("fileName")?.trim()  ?? "";

    if (!projectId || !userId || !fileName)
      return NextResponse.json({ ok: false, error: "projectId, userId, fileName 필요" }, { status: 400 });

    const admin = getSupabaseAdmin();

    // 해당 파일의 원본 로그 삭제
    const { error: delErr } = await admin.from("attendance_raw")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("source_file_name", fileName);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });

    // daily / summary 재계산
    const { data: allRaw } = await admin.from("attendance_raw")
      .select("person_name, employee_id, company, work_date, check_in, check_out")
      .eq("project_id", projectId);

    function timeToMin(t: string | null): number | null {
      if (!t) return null;
      const m = t.match(/^(\d{2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    }
    function p2(n: number) { return String(n).padStart(2, "0"); }

    const today = new Date().toISOString().slice(0, 10);
    function calcLabor(ci: string | null, co: string | null, wd: string) {
      if (!ci && !co) return { labor_units: 0, labor_status: "missing", total_minutes: 0 };
      if (ci && !co)  return { labor_units: 0, labor_status: wd >= today ? "ongoing" : "missing", total_minutes: 0 };
      if (!ci && co)  return { labor_units: 0, labor_status: "missing", total_minutes: 0 };
      const inM = timeToMin(ci)!, outM = timeToMin(co)!;
      const total = Math.max(0, outM - inM);
      return total >= 480 ? { labor_units: 1.0, labor_status: "full",  total_minutes: total }
           : total >= 240 ? { labor_units: 0.5, labor_status: "half",  total_minutes: total }
                          : { labor_units: 0,   labor_status: "missing", total_minutes: total };
    }

    const dailyMap = new Map<string, { employee_id: string; company: string; inMin: number | null; outMin: number | null; count: number }>();
    for (const r of allRaw ?? []) {
      const key = `${r.person_name}__${r.work_date}`;
      const inM  = timeToMin(r.check_in);
      const outM = timeToMin(r.check_out);
      const cur  = dailyMap.get(key);
      if (!cur) dailyMap.set(key, { employee_id: r.employee_id ?? "", company: r.company ?? "", inMin: inM, outMin: outM, count: 1 });
      else {
        if (inM  !== null && (cur.inMin  === null || inM  < cur.inMin))  cur.inMin  = inM;
        if (outM !== null && (cur.outMin === null || outM > cur.outMin)) cur.outMin = outM;
        cur.count++;
      }
    }

    const dailyRows = Array.from(dailyMap.entries()).map(([key, v]) => {
      const [person_name, work_date] = key.split("__");
      const checkIn  = v.inMin  !== null ? `${p2(Math.floor(v.inMin  / 60))}:${p2(v.inMin  % 60)}:00` : null;
      const checkOut = v.outMin !== null ? `${p2(Math.floor(v.outMin / 60))}:${p2(v.outMin % 60)}:00` : null;
      const { labor_units, labor_status, total_minutes } = calcLabor(checkIn, checkOut, work_date);
      return { project_id: projectId, user_id: userId, employee_id: v.employee_id, person_name, company: v.company, work_date, check_in: checkIn, check_out: checkOut, total_minutes, labor_units, labor_status, log_count: v.count };
    });

    await admin.from("attendance_daily").delete().eq("project_id", projectId);
    if (dailyRows.length > 0) await admin.from("attendance_daily").insert(dailyRows);

    const summaryMap = new Map<string, { employee_id: string; company: string; units: number; days: number }>();
    for (const d of dailyRows) {
      const cur = summaryMap.get(d.person_name);
      if (!cur) summaryMap.set(d.person_name, { employee_id: d.employee_id, company: d.company, units: d.labor_units, days: d.labor_units > 0 ? 1 : 0 });
      else { cur.units += d.labor_units; if (d.labor_units > 0) cur.days++; }
    }
    const summaryRows = Array.from(summaryMap.entries()).map(([person_name, v]) => ({ project_id: projectId, user_id: userId, employee_id: v.employee_id, person_name, company: v.company, total_labor_units: v.units, work_days: v.days }));

    await admin.from("labor_summary").delete().eq("project_id", projectId);
    if (summaryRows.length > 0) await admin.from("labor_summary").insert(summaryRows);

    return NextResponse.json({ ok: true, msg: `${fileName} 삭제 완료, 재집계 완료` });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
