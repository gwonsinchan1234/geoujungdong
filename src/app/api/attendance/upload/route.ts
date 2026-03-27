import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseWithToken } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// ── 토큰 추출 헬퍼 ────────────────────────────────────────────────
function getToken(req: NextRequest): string {
  return req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
}

// ── CSV 파서 (UTF-8 BOM 처리, 따옴표 필드 지원) ────────────────────
function parseCSV(text: string): string[][] {
  // BOM 제거
  const raw = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if ((ch === "," || ch === "\t") && !inQuote) {
        cells.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

// ── 전각 숫자·기호 → 반각 (타사 엑셀 호환) ────────────────────────────
function toHalfWidthAscii(s: string): string {
  return s
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/：/g, ":")
    .replace(/．/g, ".")
    .replace(/／/g, "/");
}

// ── 헤더 정규화 ────────────────────────────────────────────────────
function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, "").replace(/[\(\)\[\]\{\}\-_:\.\/]/g, "").toLowerCase();
}

function findColIdx(headerRow: unknown[], aliases: string[]): number {
  const header = headerRow.map(norm);
  const aliasNorm = aliases.map(norm);
  for (let i = 0; i < header.length; i++) {
    if (aliasNorm.includes(header[i])) return i;
  }
  for (let i = 0; i < header.length; i++) {
    if (aliasNorm.some((a) => header[i].includes(a))) return i;
  }
  return -1;
}

function headerKeywordHits(cells: string[]): number {
  const pool = [
    "이름", "성명", "사원명", "작업자", "직원명", "근로자", "대상자", "인명", "인원",
    "날짜", "일자", "근무일", "출입일", "근무일자", "작업일", "기준일", "일시",
    "출근", "퇴근", "시간", "시각", "출입", "체크", "시작", "종료", "인증",
    "사번", "date", "name", "time", "employee", "clock", "punch", "check",
  ].map(norm);
  let n = 0;
  for (const k of pool) {
    if (cells.some((c) => c.includes(k))) n++;
  }
  return n;
}

function rowHeaderScore(cells: string[]): number {
  const hits = headerKeywordHits(cells);
  const mustHave = ["이름", "성명", "날짜", "일자", "시간", "출근", "퇴근"].map(norm);
  const legacy = mustHave.filter((k) => cells.some((c) => c.includes(k))).length;
  if (legacy >= 2) return 1000 + hits;
  if (hits >= 3) return 100 + hits;
  return 0;
}

/** 성명·일자·시간 계열이 같이 있는 행을 헤더로 간주 (타사 포맷 대응) */
function findHeaderRow(rows: unknown[][]): number {
  let best = 0;
  let bestIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 120); i++) {
    const cells = (rows[i] ?? []).map(norm).filter(Boolean);
    if (cells.length < 3) continue;
    const s = rowHeaderScore(cells);
    if (s > best) {
      best = s;
      bestIdx = i;
    }
  }
  return best > 0 ? bestIdx : -1;
}

// ── 날짜 파싱 ─────────────────────────────────────────────────────
function toISODate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && isFinite(value)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    if (!isNaN(dt.getTime())) {
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    }
  }
  let raw = String(value).trim();
  if (!raw) return null;
  raw = toHalfWidthAscii(raw);
  // ISO 날짜 앞부분만 (2026-03-13T09:00:00)
  const isoD = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoD) {
    const y = Number(isoD[1]), mo = Number(isoD[2]), d = Number(isoD[3]);
    if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }
  // 근태이력 등: 2026년 03월 13일 / 2026년03월13일
  const km = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (km) {
    const y = Number(km[1]);
    const mo = Number(km[2]);
    const d = Number(km[3]);
    if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }
  // 2026/03/13, 2026.3.13, 2026-03-13 (공백·전각 혼용)
  const flex = raw.match(/^(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})(?:\s|$|T)/);
  if (flex) {
    const y = Number(flex[1]), mo = Number(flex[2]), d = Number(flex[3]);
    if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }
  // 숫자만 8자리 20260313
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    const y = Number(digits.slice(0, 4)), mo = Number(digits.slice(4, 6)), d = Number(digits.slice(6, 8));
    if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }
  const cleaned = raw.replace(/[.\/]/g, "-").replace(/\s+/g, "");
  const parts = cleaned.split("-").filter(Boolean);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts;
  if (![a, b, c].every((x) => /^\d+$/.test(x))) return null;
  const y = a.length === 4 ? Number(a) : 2000 + Number(a);
  const mo = Number(b);
  const d = Number(c);
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ── 시간 파싱 ─────────────────────────────────────────────────────
function p2(n: number) { return String(n).padStart(2, "0"); }

function parseHmsFromMatch(raw: string, m: RegExpMatchArray): string | null {
  let hh = Number(m[1]), mm = Number(m[2]), ss = m[3] != null ? Number(m[3]) : 0;
  const tail = raw.slice((m.index ?? 0) + m[0].length).trim();
  if (/^(pm|p\.m\.|오후)/i.test(tail) && hh < 12) hh += 12;
  if (/^(am|a\.m\.|오전)/i.test(tail) && hh === 12) hh = 0;
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return `${p2(hh)}:${p2(mm)}:${p2(ss)}`;
}

function toTimeStr(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && isFinite(value)) {
    const frac = value % 1;
    if (frac === 0 && value >= 1 && value < 100000) return null;
    const secs = Math.round(frac * 86400);
    return `${p2(Math.floor(secs / 3600) % 24)}:${p2(Math.floor((secs % 3600) / 60))}:${p2(secs % 60)}`;
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${p2(value.getHours())}:${p2(value.getMinutes())}:${p2(value.getSeconds())}`;
  }
  let raw = toHalfWidthAscii(String(value).trim());
  if (!raw) return null;
  raw = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  let m = raw.match(/^(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/);
  if (m) {
    const t = parseHmsFromMatch(raw, m);
    if (t) return t;
  }
  m = raw.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/);
  if (m) return parseHmsFromMatch(raw, m);
  return null;
}

function timeToMin(t: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ── 공수 계산 ─────────────────────────────────────────────────────
/** 출근·퇴근 중 하나라도 있으면 1공 인정. 둘 다 있으면 근무시간으로 1/0.5 판정. */
function calcLabor(
  checkIn: string | null,
  checkOut: string | null,
  workDate: string,
): { labor_units: number; labor_status: string; total_minutes: number } {
  const today = new Date().toISOString().slice(0, 10);
  if (!checkIn && !checkOut) return { labor_units: 0, labor_status: "missing", total_minutes: 0 };
  if (checkIn && !checkOut) {
    return workDate >= today
      ? { labor_units: 1.0, labor_status: "ongoing", total_minutes: 0 }
      : { labor_units: 1.0, labor_status: "full", total_minutes: 0 };
  }
  if (!checkIn && checkOut) return { labor_units: 1.0, labor_status: "full", total_minutes: 0 };
  const inMin = timeToMin(checkIn)!;
  const outMin = timeToMin(checkOut!);
  if (outMin === null) return { labor_units: 0, labor_status: "missing", total_minutes: 0 };
  const total = Math.max(0, outMin - inMin);
  let labor_units: number;
  let labor_status: string;
  if (total >= 480) {
    labor_units = 1.0;
    labor_status = "full";
  } else if (total >= 240) {
    labor_units = 0.5;
    labor_status = "half";
  } else {
    labor_units = 0;
    labor_status = "missing";
  }
  return { labor_units, labor_status, total_minutes: total };
}

function stablePersonKey(personName: string, employeeId: string) {
  const e = String(employeeId ?? "").trim();
  const p = String(personName ?? "").trim();
  // 동명이인 방지: 사번이 있으면 이름에 사번을 붙여 유니크 키로 사용
  return e ? `${p} (${e})` : p;
}

// ── 메인 핸들러 ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 토큰 추출: Authorization 헤더 우선, FormData "authToken" fallback
    let token = getToken(req);
    const formData = await req.formData();
    if (!token) {
      token = String(formData.get("authToken") ?? "").trim();
    }

    const file = formData.get("file") as File | null;
    const projectId = String(formData.get("projectId") ?? "").trim();

    if (!file) return NextResponse.json({ ok: false, error: "file이 없습니다." }, { status: 400 });
    if (!projectId) return NextResponse.json({ ok: false, error: "projectId가 필요합니다." }, { status: 400 });
    if (!token) return NextResponse.json({ ok: false, error: "인증 토큰이 없습니다." }, { status: 401 });

    const db = getSupabaseWithToken(token);
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "인증 실패: 유효하지 않은 토큰입니다." }, { status: 401 });
    const userId = user.id;

    // ── 파일 파싱
    type RawRow = { employee_id: string; person_name: string; company: string; work_date: string; check_in: string | null; check_out: string | null; };
    let rawRows: RawRow[] = [];
    const skipped: { row: number; reason: string }[] = [];

    const isCSV = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv" || file.type === "text/plain";

    let headerRowIdx = -1;
    let dataRows: unknown[][] = [];
    let headerRow: unknown[] = [];

    if (isCSV) {
      const text = await file.text();
      const rows = parseCSV(text);
      headerRowIdx = findHeaderRow(rows as unknown[][]);
      if (headerRowIdx < 0) return NextResponse.json({ ok: false, error: "헤더 행을 찾지 못했습니다. (성명/날짜/시간 컬럼 필요)" }, { status: 400 });
      headerRow = rows[headerRowIdx];
      dataRows = rows.slice(headerRowIdx + 1);
    } else {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      let rows: unknown[][] = [];
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const candidate = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
        const idx = findHeaderRow(candidate);
        if (idx >= 0) {
          rows = candidate;
          headerRowIdx = idx;
          break;
        }
      }
      if (headerRowIdx < 0 || rows.length === 0) {
        return NextResponse.json({ ok: false, error: "헤더 행을 찾지 못했습니다. (성명·일자·출근/퇴근 컬럼이 있는 시트 필요)" }, { status: 400 });
      }
      headerRow = rows[headerRowIdx];
      dataRows = rows.slice(headerRowIdx + 1);
    }

    const iName    = findColIdx(headerRow, [
      "성명", "이름", "사원명", "작업자", "직원명", "근로자", "대상자", "인명", "성함", "name", "employee", "emplname",
    ]);
    const iDate    = findColIdx(headerRow, [
      "근무일자", "날짜", "일자", "출입일자", "근무일", "작업일", "기준일", "일시", "date", "workdate", "근태일자",
    ]);
    const iIn      = findColIdx(headerRow, [
      "출근시간", "출근", "인정출근", "시작시간", "출근일시", "입장", "출근시각", "clockin", "checkin", "timein",
    ]);
    const iOut     = findColIdx(headerRow, [
      "퇴근시간", "퇴근", "인정퇴근", "종료시간", "퇴근일시", "퇴장", "퇴근시각", "clockout", "checkout", "timeout",
    ]);
    const iEmpId   = findColIdx(headerRow, ["사번", "사원번호", "직원번호", "직원코드", "사원코드", "empid", "employeeid", "empno"]);
    const iCompany = findColIdx(headerRow, ["회사", "소속", "업체", "회사명", "업체명", "소속사", "company"]);

    // 단일 시간 컬럼 모드 (기존 swipe 방식 호환)
    const iTime    = (iIn < 0 && iOut < 0) ? findColIdx(headerRow, ["시간", "출입시간", "시각", "기록시간", "timestamp", "punch"]) : -1;

    const missing: string[] = [];
    if (iName < 0) missing.push("성명");
    if (iDate < 0) missing.push("근무일자");
    if (iIn < 0 && iOut < 0 && iTime < 0) missing.push("출근시간/퇴근시간");
    if (missing.length) return NextResponse.json({ ok: false, error: `필수 컬럼 없음: ${missing.join(", ")}`, headerRow }, { status: 400 });

    let emptyStreak = 0;
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i] ?? [];
      const filled = (row as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean);
      if (filled.length === 0) { if (++emptyStreak >= 10) break; continue; }
      emptyStreak = 0;

      const personName  = String(row[iName] ?? "").trim();
      const employeeId  = iEmpId  >= 0 ? String(row[iEmpId]  ?? "").trim() : "";
      const company     = iCompany >= 0 ? String(row[iCompany] ?? "").trim() : "";
      const workDate    = toISODate(row[iDate]);
      let   checkIn: string | null  = iIn  >= 0 ? toTimeStr(row[iIn])  : null;
      let   checkOut: string | null = iOut >= 0 ? toTimeStr(row[iOut]) : null;

      // 단일 시간 컬럼 모드: swipe log (같은 사람+날짜 여러 행) → 아래 집계에서 처리
      if (iTime >= 0) {
        const t = toTimeStr(row[iTime]);
        if (t) { checkIn = t; checkOut = null; } // 임시로 checkIn에 넣음 — 집계 단계에서 처리
      }

      if (!personName) { skipped.push({ row: headerRowIdx + 1 + i, reason: "성명 비어있음" }); continue; }
      if (!workDate)   { skipped.push({ row: headerRowIdx + 1 + i, reason: `날짜 파싱 실패: "${String(row[iDate])}"` }); continue; }

      rawRows.push({ employee_id: employeeId, person_name: personName, company, work_date: workDate, check_in: checkIn, check_out: checkOut });
    }

    if (rawRows.length === 0) return NextResponse.json({ ok: false, error: "저장할 출결 데이터가 0건입니다.", skipped: skipped.slice(0, 50) }, { status: 400 });

    // ── 동일 파일 이전 기록 삭제 (재업로드 중복 방지)
    await db.from("attendance_raw").delete().eq("project_id", projectId).eq("source_file_name", file.name);

    // ── attendance_raw upsert
    const rawInsert = rawRows.map((r, idx) => ({
      project_id: projectId,
      user_id: userId,
      source_file_name: file.name,
      source_row_index: idx,
      ...r,
    }));
    const { error: rawErr } = await db.from("attendance_raw").insert(rawInsert);
    if (rawErr) return NextResponse.json({ ok: false, error: rawErr.message }, { status: 500 });

    // ── 이 프로젝트의 전체 attendance_raw 재집계
    const { data: allRaw, error: fetchErr } = await db
      .from("attendance_raw")
      .select("person_name, employee_id, company, work_date, check_in, check_out")
      .eq("project_id", projectId);
    if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });

    // 집계: key = (사번 있으면) person_name(사번) + work_date
    const dailyMap = new Map<string, { employee_id: string; company: string; inMin: number | null; outMin: number | null; count: number }>();
    for (const r of allRaw ?? []) {
      const pk = stablePersonKey(String(r.person_name ?? ""), String(r.employee_id ?? ""));
      const key = `${pk}__${r.work_date}`;
      const inM  = timeToMin(r.check_in);
      const outM = timeToMin(r.check_out);
      const cur  = dailyMap.get(key);
      if (!cur) {
        dailyMap.set(key, { employee_id: r.employee_id ?? "", company: r.company ?? "", inMin: inM, outMin: outM, count: 1 });
      } else {
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
      return {
        project_id:   projectId,
        user_id:      userId,
        employee_id:  v.employee_id,
        person_name,
        company:      v.company,
        work_date,
        check_in:     checkIn,
        check_out:    checkOut,
        total_minutes,
        labor_units,
        labor_status,
        log_count:    v.count,
      };
    });

    // attendance_daily: 이 프로젝트 전체 재upsert
    await db.from("attendance_daily").delete().eq("project_id", projectId);
    if (dailyRows.length > 0) {
      const { error: dailyErr } = await db.from("attendance_daily").insert(dailyRows);
      if (dailyErr) return NextResponse.json({ ok: false, error: dailyErr.message }, { status: 500 });
    }

    // ── labor_summary 재집계
    const summaryMap = new Map<string, { employee_id: string; company: string; units: number; days: number }>();
    for (const d of dailyRows) {
      const cur = summaryMap.get(d.person_name);
      if (!cur) {
        summaryMap.set(d.person_name, { employee_id: d.employee_id, company: d.company, units: d.labor_units, days: d.labor_units > 0 ? 1 : 0 });
      } else {
        cur.units += d.labor_units;
        if (d.labor_units > 0) cur.days++;
      }
    }
    const summaryRows = Array.from(summaryMap.entries()).map(([person_name, v]) => ({
      project_id:         projectId,
      user_id:            userId,
      employee_id:        v.employee_id,
      person_name,
      company:            v.company,
      total_labor_units:  v.units,
      work_days:          v.days,
    }));

    await db.from("labor_summary").delete().eq("project_id", projectId);
    if (summaryRows.length > 0) {
      await db.from("labor_summary").insert(summaryRows);
    }

    return NextResponse.json({
      ok: true,
      fileName: file.name,
      savedRaw: rawInsert.length,
      upsertedDaily: dailyRows.length,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 30),
      msg: `완료: 원본 ${rawInsert.length}건, 일자집계 ${dailyRows.length}건`,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
