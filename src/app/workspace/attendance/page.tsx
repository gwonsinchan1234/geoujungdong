"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

// ── 타입 ──────────────────────────────────────────────────────────
type BatchInfo = { source_file_name: string; count: number; first_date: string; last_date: string; uploaded_at: string };
type DailyRow  = { id: string; person_name: string; employee_id: string; company: string; work_date: string; check_in: string|null; check_out: string|null; total_minutes: number; labor_units: number; labor_status: string; log_count: number };

type Tab = "list" | "summary" | "preview";
type PreviewMode = "matrix" | "compact";

// ── 유틸 ──────────────────────────────────────────────────────────
function fmtTime(t: string | null) { return t ? t.slice(0, 5) : "-"; }
function fmtDate(d: string) { return d ? d.slice(5).replace("-", "/") : "-"; }
function fmtMins(m: number) {
  if (!m) return "-";
  const h = Math.floor(m / 60), mi = m % 60;
  return `${h}h${mi > 0 ? mi + "m" : ""}`;
}

function BadgeStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    full:    { label: "1공",    cls: styles.badgeFull },
    half:    { label: "0.5공",  cls: styles.badgeHalf },
    missing: { label: "!",      cls: styles.badgeMissing },
    ongoing: { label: "진행중", cls: styles.badgeOngoing },
  };
  const cfg = map[status] ?? { label: status, cls: styles.badgeMissing };
  return <span className={cfg.cls}>{cfg.label}</span>;
}

function parseMoney(v: string): number {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n) || n === 0) return "";
  return n.toLocaleString("ko-KR");
}

function splitNameAndEmpId(personName: string, employeeId?: string) {
  const emp = String(employeeId ?? "").trim();
  const raw = String(personName ?? "").trim();
  if (emp) return { name: raw.replace(/\s*\([^)]*\)\s*$/, "").trim() || raw, empId: emp };
  const m = raw.match(/^(.*)\s*\(([^()]+)\)\s*$/);
  if (m) return { name: m[1].trim(), empId: m[2].trim() };
  return { name: raw, empId: "" };
}

async function downloadMonthMatrixExcelStyled(args: {
  fileName: string;
  monthKey: string;
  daysInMonth: number;
  persons: string[];
  matrixRates: Record<string, string>;
  cellText: (person: string, workDate: string) => string;
  totalUnitsByPerson: (person: string) => number;
  personMeta: Map<string, { name: string; empId: string }>;
}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("월체크표", { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });

  // ── 컬럼 정의 (폭: 엑셀 느낌에 맞게)
  const cols: { header: string; key: string; width: number }[] = [
    { header: "이름", key: "name", width: 14 },
    { header: "사번", key: "emp", width: 10 },
    { header: "단가", key: "rate", width: 12 },
    ...Array.from({ length: args.daysInMonth }, (_, i) => ({ header: String(i + 1), key: `d${i + 1}`, width: 4 })),
    { header: "공수", key: "units", width: 7 },
    { header: "총합", key: "amount", width: 14 },
  ];
  ws.columns = cols;

  // ── 헤더 스타일
  const headerRow = ws.getRow(1);
  headerRow.values = cols.map((c) => c.header);
  headerRow.height = 20;

  const thin = { style: "thin", color: { argb: "FF111827" } } as const;
  const border = { top: thin, left: thin, bottom: thin, right: thin } as const;

  for (let c = 1; c <= cols.length; c++) {
    const cell = headerRow.getCell(c);
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.font = { bold: true, size: 11, color: { argb: "FF111827" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };
    cell.border = border;
  }

  // ── 바디
  let rIdx = 2;
  for (const person of args.persons) {
    const row = ws.getRow(rIdx);
    const meta = args.personMeta.get(person) ?? splitNameAndEmpId(person);
    const rateRaw = (args.matrixRates[person] ?? "").trim();
    const effectiveRate = rateRaw ? rateRaw : "100000";
    const rate = parseMoney(effectiveRate);
    const totalUnits = args.totalUnitsByPerson(person);
    const amount = totalUnits > 0 && rate > 0 ? totalUnits * rate : 0;

    const values: (string | number)[] = [];
    values[1] = meta.name;
    values[2] = meta.empId;
    values[3] = rate;
    for (let d = 1; d <= args.daysInMonth; d++) {
      const dd = String(d).padStart(2, "0");
      values[3 + d] = args.cellText(person, `${args.monthKey}-${dd}`);
    }
    values[3 + args.daysInMonth + 1] = totalUnits || "";
    values[3 + args.daysInMonth + 2] = amount || "";
    row.values = values;
    row.height = 18;

    for (let c = 1; c <= cols.length; c++) {
      const cell = row.getCell(c);
      cell.border = border;
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.font = { size: 10.5, color: { argb: "FF111827" } };
    }
    // 숫자 서식 (단가/총합)
    row.getCell(3).numFmt = "#,##0";
    row.getCell(cols.length).numFmt = "#,##0";
    rIdx++;
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = args.fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 미리보기 체크표 ───────────────────────────────────────────────
function CheckTable({ daily }: { daily: DailyRow[] }) {
  if (!daily.length) return <div className={styles.emptyState}><div className={styles.emptyText}>출결 데이터가 없습니다.</div></div>;

  const dates   = Array.from(new Set(daily.map((r) => r.work_date))).sort();
  const persons = Array.from(new Set(daily.map((r) => r.person_name))).sort();
  const cellMap = new Map(daily.map((r) => [`${r.person_name}__${r.work_date}`, r]));
  const personMeta = new Map<string, { name: string; empId: string }>();
  for (const r of daily) {
    if (!personMeta.has(r.person_name)) personMeta.set(r.person_name, splitNameAndEmpId(r.person_name, r.employee_id));
  }

  function cellCls(r: DailyRow | undefined) {
    if (!r) return styles.checkCellNone;
    return r.labor_status === "full" ? styles.checkCell1 : r.labor_status === "half" ? styles.checkCell05 : r.labor_status === "ongoing" ? styles.checkCellOng : styles.checkCellMiss;
  }
  function cellLbl(r: DailyRow | undefined) {
    if (!r) return "";
    return r.labor_status === "full" ? "✓" : r.labor_status === "half" ? "½" : r.labor_status === "ongoing" ? "▶" : "!";
  }

  return (
    <div className={styles.previewWrap}>
      <table className={styles.checkTable}>
        <thead>
          <tr>
            <th className={styles.nameCell}>성명</th>
            <th className={styles.empCell}>사번</th>
            {dates.map((d) => <th key={d}>{fmtDate(d)}</th>)}
            <th className={styles.sumCell}>합계</th>
          </tr>
        </thead>
        <tbody>
          {persons.map((person) => {
            const meta = personMeta.get(person) ?? splitNameAndEmpId(person);
            const total = dates.reduce((s, d) => s + (cellMap.get(`${person}__${d}`)?.labor_units ?? 0), 0);
            return (
              <tr key={person}>
                <td className={styles.nameCell}>{meta.name}</td>
                <td className={styles.empCell}>{meta.empId || "-"}</td>
                {dates.map((d) => { const r = cellMap.get(`${person}__${d}`); return <td key={d} className={cellCls(r)}>{cellLbl(r)}</td>; })}
                <td className={styles.sumCell}>{total > 0 ? total : "-"}</td>
              </tr>
            );
          })}
          <tr>
            <td className={styles.nameCell} style={{ fontWeight: 700 }}>합계</td>
            <td className={styles.empCell} />
            {dates.map((d) => {
              const sum = persons.reduce((s, p) => s + (cellMap.get(`${p}__${d}`)?.labor_units ?? 0), 0);
              return <td key={d} className={styles.sumCell}>{sum > 0 ? sum : ""}</td>;
            })}
            <td className={styles.sumCell}>
              {persons.reduce((s, p) => s + dates.reduce((s2, d) => s2 + (cellMap.get(`${p}__${d}`)?.labor_units ?? 0), 0), 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MonthMatrix({
  daily,
  rates,
  setRate,
}: {
  daily: DailyRow[];
  rates: Record<string, string>;
  setRate: (person: string, next: string) => void;
}) {
  if (!daily.length) return <div className={styles.emptyState}><div className={styles.emptyText}>출결 데이터가 없습니다.</div></div>;

  const monthKey = daily[0]?.work_date?.slice(0, 7) ?? "";
  const monthRows = daily.filter((r) => r.work_date.startsWith(monthKey));

  const daysInMonth = (() => {
    if (!monthKey) return 31;
    const [y, m] = monthKey.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  })();

  const persons = Array.from(new Set(monthRows.map((r) => r.person_name))).sort((a, b) => a.localeCompare(b, "ko"));
  const cellMap = new Map(monthRows.map((r) => [`${r.person_name}__${r.work_date}`, r] as const));
  const personMeta = new Map<string, { name: string; empId: string }>();
  for (const r of monthRows) {
    if (!personMeta.has(r.person_name)) personMeta.set(r.person_name, splitNameAndEmpId(r.person_name, r.employee_id));
  }

  function cellMark(r?: DailyRow) {
    if (!r) return "";
    if (r.labor_status === "full") return "○";
    if (r.labor_status === "half") return "1/2";
    if (r.labor_status === "ongoing") return "…";
    return "";
  }

  function units(r?: DailyRow) {
    return r ? Number(r.labor_units ?? 0) : 0;
  }

  return (
    <div className={styles.previewWrap}>
      <table className={styles.matrixTable}>
        <thead>
          <tr>
            <th className={styles.nameCell}>이름</th>
            <th className={styles.empCell}>사번</th>
            <th className={styles.rateCell}>단가</th>
            {Array.from({ length: daysInMonth }, (_, i) => (
              <th key={i} className={styles.dayCell}>{i + 1}</th>
            ))}
            <th className={styles.sumCell}>공수</th>
            <th className={styles.amountCell}>총합</th>
          </tr>
        </thead>
        <tbody>
          {persons.map((p) => {
            const meta = personMeta.get(p) ?? splitNameAndEmpId(p);
            let totalUnits = 0;
            const rateRaw = (rates[p] ?? "").trim();
            const effectiveRate = rateRaw ? rateRaw : "100000";
            const rate = parseMoney(effectiveRate);
            return (
              <tr key={p}>
                <td className={styles.nameCell}>{meta.name}</td>
                <td className={styles.empCell}>{meta.empId || "-"}</td>
                <td className={styles.rateCell}>
                  <div className={styles.rateField}>
                    <input
                      className={styles.rateInput}
                      inputMode="numeric"
                      placeholder="100000"
                      value={rates[p] ?? ""}
                      onChange={(e) => setRate(p, e.target.value)}
                    />
                    <span className={styles.rateSuffix}>원</span>
                  </div>
                </td>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const d = String(i + 1).padStart(2, "0");
                  const wd = `${monthKey}-${d}`;
                  const r = cellMap.get(`${p}__${wd}`);
                  totalUnits += units(r);
                  return <td key={wd} className={styles.matrixCell}>{cellMark(r)}</td>;
                })}
                <td className={styles.sumCell}>{totalUnits > 0 ? totalUnits : ""}</td>
                <td className={styles.amountCell}>{totalUnits > 0 && rate > 0 ? fmtMoney(totalUnits * rate) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function rowDesc(r: DailyRow): string {
  if (r.labor_status === "full")    return "정상(1공)";
  if (r.labor_status === "half")    return "반일(0.5공)";
  if (r.labor_status === "ongoing") return "진행중(퇴근 미입력)";
  if (r.labor_status === "missing") {
    if (!r.check_in && !r.check_out) return "누락(출근/퇴근)";
    if (!r.check_in) return "누락(출근)";
    if (!r.check_out) return "누락(퇴근)";
    return "누락";
  }
  return r.labor_status || "";
}

function dateCellCls(r: DailyRow): string | undefined {
  if (r.labor_status === "missing") return styles.dateCellMissing;
  if (r.labor_status === "ongoing") return styles.dateCellOngoing;
  if (r.labor_status === "half") return styles.dateCellHalf;
  if (r.labor_status === "full") return styles.dateCellFull;
  return undefined;
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function AttendancePage() {
  const tokenRef   = useRef<string>("");
  const projIdRef  = useRef<string>("");   // 자동 생성된 프로젝트 ID
  const didInitRef = useRef(false);
  const [ready, setReady]         = useState(false);   // 프로젝트 준비 완료
  const [tab, setTab]             = useState<Tab>("list");
  const [batches, setBatches]     = useState<BatchInfo[]>([]);
  const [daily, setDaily]         = useState<DailyRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterPerson, setFilterPerson] = useState("");
  const [filterWorkDate, setFilterWorkDate] = useState(""); // "YYYY-MM-DD"
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("matrix");
  const [matrixRates, setMatrixRates] = useState<Record<string, string>>({});

  const setMatrixRate = useCallback((person: string, next: string) => {
    setMatrixRates((p) => ({ ...p, [person]: next }));
  }, []);

  const handleDownloadMonthMatrix = useCallback(() => {
    (async () => {
      if (!daily.length) return;
      const monthKey = daily[0]?.work_date?.slice(0, 7) ?? "";
      if (!monthKey) return;
      const monthRows = daily.filter((r) => r.work_date.startsWith(monthKey));

      const [y, m] = monthKey.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();

      const persons = Array.from(new Set(monthRows.map((r) => r.person_name))).sort((a, b) => a.localeCompare(b, "ko"));
      const cellMap = new Map(monthRows.map((r) => [`${r.person_name}__${r.work_date}`, r] as const));
      const personMeta = new Map<string, { name: string; empId: string }>();
      for (const r of monthRows) {
        if (!personMeta.has(r.person_name)) personMeta.set(r.person_name, splitNameAndEmpId(r.person_name, r.employee_id));
      }

      const cellText = (person: string, wd: string) => {
        const r = cellMap.get(`${person}__${wd}`);
        if (!r) return "";
        if (r.labor_status === "full") return "○";
        if (r.labor_status === "half") return "1/2";
        if (r.labor_status === "ongoing") return "…";
        return "";
      };

      const totalUnitsByPerson = (person: string) => {
        let total = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dd = String(d).padStart(2, "0");
          const r = cellMap.get(`${person}__${monthKey}-${dd}`);
          total += r ? Number(r.labor_units ?? 0) : 0;
        }
        return total;
      };

      await downloadMonthMatrixExcelStyled({
        fileName: `월체크표_${monthKey}.xlsx`,
        monthKey,
        daysInMonth,
        persons,
        matrixRates,
        cellText,
        totalUnitsByPerson,
        personMeta,
      });
    })();
  }, [daily, matrixRates]);

  // ── 기본 프로젝트 자동 생성/조회
  async function ensureProject(token: string): Promise<string | null> {
    // 기존 프로젝트 조회
    const listRes = await fetch("/api/attendance/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listJson = await listRes.json();
    if (listJson.ok && listJson.projects.length > 0) {
      return listJson.projects[0].id as string;
    }
    // 없으면 "기본" 프로젝트 생성
    const createRes = await fetch("/api/attendance/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "기본" }),
    });
    const createJson = await createRes.json();
    if (createJson.ok) return createJson.project.id as string;
    return null;
  }

  // ── auth + 프로젝트 준비
  useEffect(() => {
    let alive = true;

    async function bootFromSession(session: { access_token: string } | null | undefined) {
      const token = session?.access_token ?? "";
      tokenRef.current = token;
      if (!token) return;
      // 이미 준비됐으면 중복 초기화 방지 (deps 없이도 안전)
      if (didInitRef.current && projIdRef.current) return;

      const projId = await ensureProject(token);
      if (!alive) return;
      if (projId) {
        projIdRef.current = projId;
        didInitRef.current = true;
        setReady(true);
      }
    }

    supabase.auth.getSession().then(({ data }) => bootFromSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      // 토큰 갱신/복구 시에도 ref를 최신으로 유지 + 최초 준비 보장
      bootFromSession(session as any);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 데이터 로드
  const loadData = useCallback(async () => {
    const projId = projIdRef.current;
    const token  = tokenRef.current;
    if (!projId || !token) return;
    setDataLoading(true);
    const res = await fetch(`/api/attendance/list?projectId=${projId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setDataLoading(false);
    if (json.ok) {
      setBatches(json.batches ?? []);
      setDaily(json.daily ?? []);
    }
  }, []);

  useEffect(() => { if (ready) loadData(); }, [ready, loadData]);

  // ── 파일 업로드
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const token  = tokenRef.current;
    const projId = projIdRef.current;
    if (!token || !projId) return;

    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", projId);
    fd.append("authToken", token);

    const res = await fetch("/api/attendance/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const json = await res.json();
    setUploading(false);
    setUploadMsg({ ok: json.ok, text: json.ok ? json.msg : (json.error ?? "업로드 실패") });
    if (json.ok) await loadData();
  }

  // ── 배치 삭제
  async function handleDeleteBatch(fileName: string) {
    if (!confirm(`"${fileName}" 데이터를 삭제할까요?`)) return;
    await fetch(`/api/attendance/list?projectId=${projIdRef.current}&fileName=${encodeURIComponent(fileName)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenRef.current}` },
    });
    await loadData();
  }

  const filteredDaily  = daily.filter((r) => {
    const desc = rowDesc(r);
    if (search && !r.person_name.includes(search) && !r.company.includes(search) && !desc.includes(search)) return false;
    if (filterStatus && r.labor_status !== filterStatus) return false;
    if (filterCompany && r.company !== filterCompany) return false;
    if (filterPerson && r.person_name !== filterPerson) return false;
    if (filterWorkDate && r.work_date !== filterWorkDate) return false;
    if (dateFrom && r.work_date < dateFrom) return false;
    if (dateTo && r.work_date > dateTo) return false;
    return true;
  });
  const companies = Array.from(new Set(daily.map((r) => r.company).filter(Boolean))).sort();
  const persons = Array.from(new Set(daily.map((r) => r.person_name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));

  const workDates = Array.from(new Set(daily.map((r) => r.work_date).filter(Boolean)))
    .filter((d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo))
    .sort(); // YYYY-MM-DD asc

  const sortedFilteredDaily = [...filteredDaily].sort((a, b) => {
    const d = a.work_date.localeCompare(b.work_date);
    if (d !== 0) return d; // 날짜 오름차순: 3/1 → 3/31
    return a.person_name.localeCompare(b.person_name, "ko");
  });

  if (!ready) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}><div className={styles.spinner} /> 초기화 중...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* 상단 바 */}
      <div className={styles.topBar}>
        <Link href="/workspace/fill" className={styles.backBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          자재관리
        </Link>
        <span className={styles.pageTitle}>출결기성관리</span>
        <div className={styles.navLinks}>
          <Link href="/workspace/attendance" className={`${styles.navLink} ${styles.navLinkActive}`}>출결</Link>
          <Link href="/workspace/giseong" className={styles.navLink}>기성관리</Link>
          <Link href="/workspace/output" className={styles.navLink}>출력</Link>
        </div>
      </div>

      {/* 탭 */}
      <div className={styles.tabs}>
        {(["list", "summary", "preview"] as Tab[]).map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)}>
            {{ list: "목록", summary: "정리", preview: "미리보기" }[t]}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div className={styles.tabContent}>
        {uploadMsg && (
          <div className={uploadMsg.ok ? styles.successBanner : styles.errorBanner}>{uploadMsg.text}</div>
        )}

        {/* 목록 탭 */}
        {tab === "list" && (
          <>
            <label className={styles.uploadArea}>
              {uploading ? (
                <div className={styles.uploadLabel}>
                  <div className={styles.spinner} /><span className={styles.uploadText}>업로드 중...</span>
                </div>
              ) : (
                <div className={styles.uploadLabel}>
                  <svg className={styles.uploadIcon} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span className={styles.uploadText}>CSV 또는 xlsx 업로드</span>
                  <span className={styles.uploadSub}>근무일자 / 출근시간 / 퇴근시간 / 사번 / 성명 / 회사</span>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv"
                className={styles.hiddenInput} onChange={handleFile} disabled={uploading} />
            </label>

            {dataLoading ? (
              <div className={styles.loading}><div className={styles.spinner} />로딩 중...</div>
            ) : batches.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📂</div>
                <div className={styles.emptyText}>업로드된 파일이 없습니다.</div>
                <div className={styles.emptyDesc}>CSV 또는 xlsx 파일을 업로드하면 출결 데이터를 자동으로 정리합니다.</div>
              </div>
            ) : (
              <div className={styles.batchList}>
                {batches.map((b) => (
                  <div key={b.source_file_name} className={styles.batchCard}>
                    <div className={styles.batchInfo}>
                      <div className={styles.batchName}>{b.source_file_name}</div>
                      <div className={styles.batchMeta}>
                        {b.count}건 · {fmtDate(b.first_date)} ~ {fmtDate(b.last_date)} · {new Date(b.uploaded_at).toLocaleDateString("ko")} 업로드
                      </div>
                    </div>
                    <div className={styles.batchActions}>
                      <button className={`${styles.btnSm} ${styles.btnDanger}`} onClick={() => handleDeleteBatch(b.source_file_name)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 정리 탭 */}
        {tab === "summary" && (
          <>
            <div className={styles.filterBar}>
              <input className={styles.searchInput} placeholder="이름/회사 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className={styles.filterSelect} value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
                <option value="">전체 성명</option>
                {persons.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className={styles.filterSelect} value={filterWorkDate} onChange={(e) => setFilterWorkDate(e.target.value)}>
                <option value="">전체 날짜</option>
                {workDates.map((d) => {
                  const mm = String(Number(d.slice(5, 7)));
                  const dd = String(Number(d.slice(8, 10)));
                  return <option key={d} value={d}>{`${mm}/${dd}`}</option>;
                })}
              </select>
              <input className={styles.dateInput} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span style={{ fontSize: 12, color: "var(--at-muted)" }}>~</span>
              <input className={styles.dateInput} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <select className={styles.filterSelect} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">전체 상태</option>
                <option value="full">1공</option>
                <option value="half">0.5공</option>
                <option value="missing">누락(!)</option>
                <option value="ongoing">진행중</option>
              </select>
              {companies.length > 0 && (
                <select className={styles.filterSelect} value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
                  <option value="">전체 회사</option>
                  {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <span style={{ fontSize: 12, color: "var(--at-muted)", marginLeft: "auto" }}>{sortedFilteredDaily.length}건</span>
            </div>
            {dataLoading ? (
              <div className={styles.loading}><div className={styles.spinner} />로딩 중...</div>
            ) : sortedFilteredDaily.length === 0 ? (
              <div className={styles.emptyState}><div className={styles.emptyIcon}>📋</div><div className={styles.emptyText}>출결 데이터가 없습니다.</div></div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>날짜</th><th>설명</th><th>성명</th><th>사번</th><th>회사</th><th>출근</th><th>퇴근</th><th>근무시간</th><th>공수</th><th>상태</th></tr>
                  </thead>
                  <tbody>
                    {sortedFilteredDaily.map((r) => {
                      const meta = splitNameAndEmpId(r.person_name, r.employee_id);
                      return (
                        <tr key={r.id}>
                          <td className={dateCellCls(r)}>{fmtDate(r.work_date)}</td>
                          <td style={{ textAlign: "left" }}>{rowDesc(r)}</td>
                          <td style={{ fontWeight: 600, textAlign: "left" }}>{meta.name}</td>
                          <td style={{ textAlign: "left" }}>{meta.empId || "-"}</td>
                          <td style={{ textAlign: "left" }}>{r.company || "-"}</td>
                          <td>{fmtTime(r.check_in)}</td>
                          <td>{fmtTime(r.check_out)}</td>
                          <td>{fmtMins(r.total_minutes)}</td>
                          <td style={{ fontWeight: 700 }}>{r.labor_units > 0 ? r.labor_units : "-"}</td>
                          <td><BadgeStatus status={r.labor_status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* 미리보기 탭 */}
        {tab === "preview" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`${styles.btnSm} ${previewMode === "matrix" ? styles.btnPrimary : ""}`}
                  onClick={() => setPreviewMode("matrix")}
                >
                  월 체크표
                </button>
                <button
                  type="button"
                  className={`${styles.btnSm} ${previewMode === "compact" ? styles.btnPrimary : ""}`}
                  onClick={() => setPreviewMode("compact")}
                >
                  요약 체크표
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {previewMode === "matrix" && (
                  <button type="button" className={`${styles.btnSm} ${styles.btnSuccess}`} onClick={handleDownloadMonthMatrix}>
                    엑셀 다운로드
                  </button>
                )}
                <button className={`${styles.btnSm} ${styles.btnPrimary}`} onClick={() => window.print()}>인쇄</button>
              </div>
            </div>
            {dataLoading ? (
              <div className={styles.loading}><div className={styles.spinner} />로딩 중...</div>
            ) : (
              previewMode === "matrix"
                ? <MonthMatrix daily={daily} rates={matrixRates} setRate={setMatrixRate} />
                : <CheckTable daily={daily} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
