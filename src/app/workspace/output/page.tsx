"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type DailyRow = { person_name: string; company: string; work_date: string; check_in: string|null; check_out: string|null; total_minutes: number; labor_units: number; labor_status: string };
type LaborRow = { person_name: string; employee_id: string; company: string; total_labor_units: number; work_days: number };
type ByCompany= { company: string; persons: number; labor_units: number; work_days: number };

type PrintMode = null | "attendance" | "labor" | "giseong";

function fmtDate(d: string) { return d ? d.slice(5).replace("-", "/") : "-"; }

// ── 출결 체크표 ────────────────────────────────────
function AttendanceCheckTable({ daily }: { daily: DailyRow[] }) {
  if (!daily.length) return <p style={{ color: "#99a1b7", textAlign: "center", padding: 24 }}>데이터 없음</p>;
  const dates   = Array.from(new Set(daily.map((r) => r.work_date))).sort();
  const persons = Array.from(new Set(daily.map((r) => r.person_name))).sort();
  const cellMap = new Map(daily.map((r) => [`${r.person_name}__${r.work_date}`, r]));

  function cellCls(r: DailyRow | undefined) {
    if (!r) return "";
    return r.labor_status === "full" ? styles.cell1 : r.labor_status === "half" ? styles.cell05 : r.labor_status === "ongoing" ? styles.cellOng : styles.cellMiss;
  }
  function cellLbl(r: DailyRow | undefined) {
    if (!r) return "";
    return r.labor_status === "full" ? "✓" : r.labor_status === "half" ? "½" : r.labor_status === "ongoing" ? "▶" : "!";
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className={styles.checkTable}>
        <thead>
          <tr>
            <th className={styles.nameCell}>성명</th>
            {dates.map((d) => <th key={d}>{fmtDate(d)}</th>)}
            <th className={styles.sumCell}>합계</th>
          </tr>
        </thead>
        <tbody>
          {persons.map((person) => {
            const total = dates.reduce((s, d) => s + (cellMap.get(`${person}__${d}`)?.labor_units ?? 0), 0);
            return (
              <tr key={person}>
                <td className={styles.nameCell}>{person}</td>
                {dates.map((d) => { const r = cellMap.get(`${person}__${d}`); return <td key={d} className={cellCls(r)}>{cellLbl(r)}</td>; })}
                <td className={styles.sumCell}>{total || "-"}</td>
              </tr>
            );
          })}
          <tr>
            <td className={`${styles.nameCell} ${styles.sumCell}`} style={{ fontWeight: 700 }}>합계</td>
            {dates.map((d) => {
              const sum = persons.reduce((s, p) => s + (cellMap.get(`${p}__${d}`)?.labor_units ?? 0), 0);
              return <td key={d} className={styles.sumCell}>{sum || ""}</td>;
            })}
            <td className={styles.sumCell}>{persons.reduce((s, p) => s + dates.reduce((s2, d) => s2 + (cellMap.get(`${p}__${d}`)?.labor_units ?? 0), 0), 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
// ── 공수 집계 테이블 ────────────────────────────────────
function LaborSummaryTable({ labor }: { labor: LaborRow[] }) {
  if (!labor.length) return <p style={{ color: "#99a1b7", textAlign: "center", padding: 24 }}>데이터 없음</p>;
  const total_units = labor.reduce((s, r) => s + Number(r.total_labor_units), 0);
  const total_days  = labor.reduce((s, r) => s + Number(r.work_days), 0);
  return (
    <table className={styles.printTable}>
      <thead>
        <tr><th>성명</th><th>사번</th><th>협력사</th><th>근무일수</th><th>총 공수</th></tr>
      </thead>
      <tbody>
        {labor.map((r) => (
          <tr key={r.person_name}>
            <td className={styles.nameCell}>{r.person_name}</td>
            <td>{r.employee_id || "-"}</td>
            <td>{r.company || "-"}</td>
            <td>{r.work_days}일</td>
            <td style={{ fontWeight: 700 }}>{r.total_labor_units}공</td>
          </tr>
        ))}
        <tr className={styles.sumRow}>
          <td colSpan={3} className={styles.nameCell}>합계</td>
          <td>{total_days}일</td>
          <td>{total_units}공</td>
        </tr>
      </tbody>
    </table>
  );
}

// ── 기성 집계 테이블 ────────────────────────────────────
function GiseongTable({ labor, byCompany }: { labor: LaborRow[]; byCompany: ByCompany[] }) {
  if (!labor.length) return <p style={{ color: "#99a1b7", textAlign: "center", padding: 24 }}>데이터 없음</p>;
  const totalUnits = labor.reduce((s, r) => s + Number(r.total_labor_units), 0);
  return (
    <>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: "#1a1f36", margin: "0 0 10px" }}>협력사별 기성</h4>
      <table className={styles.printTable} style={{ marginBottom: 20 }}>
        <thead>
          <tr><th>협력사</th><th>인원</th><th>근무일수</th><th>총 공수</th></tr>
        </thead>
        <tbody>
          {byCompany.map((c) => (
            <tr key={c.company}>
              <td className={styles.nameCell}>{c.company || "미지정"}</td>
              <td>{c.persons}명</td>
              <td>{c.work_days}일</td>
              <td style={{ fontWeight: 700 }}>{c.labor_units}공</td>
            </tr>
          ))}
          <tr className={styles.sumRow}>
            <td className={styles.nameCell}>합계</td>
            <td>{labor.length}명</td>
            <td>{labor.reduce((s, r) => s + Number(r.work_days), 0)}일</td>
            <td>{totalUnits}공</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
// ── 메인 ─────────────────────────────────────────────
export default function OutputPage() {
  const tokenRef  = useRef<string>("");
  const projIdRef = useRef<string>("");
  const [ready, setReady] = useState(false);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [byCompany, setByCompany] = useState<ByCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>(null);

  async function ensureProject(token: string): Promise<string | null> {
    const listRes = await fetch("/api/attendance/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listJson = await listRes.json();
    if (listJson.ok && listJson.projects.length > 0) return listJson.projects[0].id as string;
    const createRes = await fetch("/api/attendance/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "기본" }),
    });
    const createJson = await createRes.json();
    return createJson.ok ? createJson.project.id as string : null;
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token ?? "";
      tokenRef.current = token;
      if (!token) return;
      const projId = await ensureProject(token);
      if (projId) {
        projIdRef.current = projId;
        setReady(true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    const projId = projIdRef.current;
    const token  = tokenRef.current;
    if (!projId || !token) return;
    setLoading(true);
    const [listRes, giseongRes] = await Promise.all([
      fetch(`/api/attendance/list?projectId=${projId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/giseong/summary?projectId=${projId}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const [listJson, giseongJson] = await Promise.all([listRes.json(), giseongRes.json()]);
    setLoading(false);
    if (listJson.ok)    setDaily(listJson.daily ?? []);
    if (giseongJson.ok) { setLabor(giseongJson.labor ?? []); setByCompany(giseongJson.by_company ?? []); }
  }, []);

  useEffect(() => { if (ready) loadData(); }, [ready, loadData]);

  function openPrint(mode: PrintMode) { setPrintMode(mode); }
  function doPrint() { window.print(); }

  const modalTitle: Record<Exclude<PrintMode, null>, string> = {
    attendance: "출결 체크표",
    labor:      "공수 집계표",
    giseong:    "기성 집계표",
  };

  if (!ready) return <div className={styles.page}><div className={styles.loading}><div className={styles.spinner} />초기화 중...</div></div>;
  return (
    <div className={styles.page}>
      {/* 상단 바 */}
      <div className={styles.topBar}>
        <Link href="/workspace/giseong" className={styles.backBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          기성관리
        </Link>
        <span className={styles.pageTitle}>출력관리</span>
        <div className={styles.navLinks}>
          <Link href="/workspace/attendance" className={styles.navLink}>출결</Link>
          <Link href="/workspace/giseong" className={styles.navLink}>기성관리</Link>
          <Link href="/workspace/output" className={`${styles.navLink} ${styles.navLinkActive}`}>출력</Link>
        </div>
      </div>

      {/* 출력 카드 그리드 */}
      <div className={styles.content}>
        {loading && <div className={styles.loading}><div className={styles.spinner} /></div>}
        <div className={styles.printGrid}>
          {/* 사진대지 */}
          <div className={styles.printCard}>
            <div className={styles.printCardIcon}>📸</div>
            <div className={styles.printCardTitle}>사진대지</div>
            <div className={styles.printCardDesc}>현장 사진 증빙 대지를 출력합니다.</div>
            <div className={styles.printCardBtnRow}>
              <Link href="/workspace/fill" className={styles.printBtn}>이동</Link>
            </div>
          </div>

          {/* 출결 체크표 */}
          <div className={styles.printCard}>
            <div className={styles.printCardIcon}>✅</div>
            <div className={styles.printCardTitle}>출결 체크표</div>
            <div className={styles.printCardDesc}>인원별 날짜별 출결 현황을 표로 출력합니다.</div>
            <div className={styles.printCardBtnRow}>
              <button className={styles.printBtn} onClick={() => openPrint("attendance")} disabled={!daily.length}>미리보기</button>
            </div>
          </div>

          {/* 공수 집계 */}
          <div className={styles.printCard}>
            <div className={styles.printCardIcon}>📋</div>
            <div className={styles.printCardTitle}>공수 집계</div>
            <div className={styles.printCardDesc}>인원별 전체 공수를 집계한 표를 출력합니다.</div>
            <div className={styles.printCardBtnRow}>
              <button className={styles.printBtn} onClick={() => openPrint("labor")} disabled={!labor.length}>미리보기</button>
            </div>
          </div>

          {/* 기성 집계 */}
          <div className={styles.printCard}>
            <div className={styles.printCardIcon}>💰</div>
            <div className={styles.printCardTitle}>기성 집계</div>
            <div className={styles.printCardDesc}>협력사별 노무 기성 집계표를 출력합니다.</div>
            <div className={styles.printCardBtnRow}>
              <button className={styles.printBtn} onClick={() => openPrint("giseong")} disabled={!labor.length}>미리보기</button>
            </div>
          </div>
        </div>
      </div>

      {/* 인쇄 미리보기 오버레이 */}
      {printMode && (
        <div className={styles.previewOverlay} onClick={(e) => e.target === e.currentTarget && setPrintMode(null)}>
          <div className={styles.previewModal}>
            <div className={styles.previewHeader}>
              <span className={styles.previewTitle}>{modalTitle[printMode]}</span>
              <div className={styles.previewActions}>
                <button className={styles.closePrintBtn} onClick={doPrint}>인쇄</button>
                <button className={styles.closeBtn} onClick={() => setPrintMode(null)}>닫기</button>
              </div>
            </div>
            <div className={styles.previewBody}>
              {printMode === "attendance" && <AttendanceCheckTable daily={daily} />}
              {printMode === "labor"      && <LaborSummaryTable labor={labor} />}
              {printMode === "giseong"    && <GiseongTable labor={labor} byCompany={byCompany} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}