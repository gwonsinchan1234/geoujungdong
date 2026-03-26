"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type LaborRow = { person_name: string; employee_id: string; company: string; total_labor_units: number; work_days: number };
type ByCompany= { company: string; persons: number; labor_units: number; work_days: number };

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
export default function GiseongPage() {
  const tokenRef  = useRef<string>("");
  const projIdRef = useRef<string>("");
  const [ready, setReady] = useState(false);

  // 데이터
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [byCompany, setByCompany] = useState<ByCompany[]>([]);
  const [totalLaborUnits, setTotalLaborUnits] = useState(0);
  const [totalWorkDays, setTotalWorkDays] = useState(0);
  const [loading, setLoading] = useState(false);

  // ── auth + 프로젝트 준비
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

  // ── 기성 집계 로드
  const loadSummary = useCallback(async () => {
    const projId = projIdRef.current;
    const token  = tokenRef.current;
    if (!projId || !token) return;
    setLoading(true);
    const res = await fetch(`/api/giseong/summary?projectId=${projId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setLoading(false);
    if (json.ok) {
      setLabor(json.labor ?? []);
      setByCompany(json.by_company ?? []);
      setTotalLaborUnits(Number(json.total_labor_units ?? 0));
      setTotalWorkDays(Number(json.total_work_days ?? 0));
    }
  }, []);

  useEffect(() => { if (ready) loadSummary(); }, [ready, loadSummary]);

  const maxUnits = Math.max(...byCompany.map((c) => c.labor_units), 1);

  if (!ready) return <div className={styles.page}><div className={styles.loading}><div className={styles.spinner} />초기화 중...</div></div>;
  return (
    <div className={styles.page}>
      {/* 상단 바 */}
      <div className={styles.topBar}>
        <Link href="/workspace/attendance" className={styles.backBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          출결
        </Link>
        <span className={styles.pageTitle}>기성관리</span>
        <div className={styles.navLinks}>
          <Link href="/workspace/attendance" className={styles.navLink}>출결</Link>
          <Link href="/workspace/giseong" className={`${styles.navLink} ${styles.navLinkActive}`}>기성관리</Link>
          <Link href="/workspace/output" className={styles.navLink}>출력</Link>
        </div>
      </div>
      {/* 콘텐츠 */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}><div className={styles.spinner} />로딩 중...</div>
        ) : (
          <>
            {/* 집계 요약 카드 */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>노무 집계 요약</span>
              </div>
              <div className={styles.statCards}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>총 인원</span>
                  <span className={styles.statValue}>{labor.length}</span>
                  <span className={styles.statUnit}>명</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>총 공수</span>
                  <span className={styles.statValue}>{totalLaborUnits}</span>
                  <span className={styles.statUnit}>공</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>총 근무일수</span>
                  <span className={styles.statValue}>{totalWorkDays}</span>
                  <span className={styles.statUnit}>일</span>
                </div>
              </div>
            </div>
            {byCompany.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>협력사별 노무</span>
                  <span className={styles.sectionMeta}>{byCompany.length}개사</span>
                </div>
                <div className={styles.companyList}>
                  {byCompany.map((c) => (
                    <div key={c.company} className={styles.companyRow}>
                      <span className={styles.companyName}>{c.company || "미지정"}</span>
                      <div className={styles.companyBar}>
                        <div className={styles.companyFill} style={{ width: `${(c.labor_units / maxUnits) * 100}%` }} />
                      </div>
                      <span className={styles.companyVal}>{c.labor_units}공</span>
                    </div>
                  ))}
                </div>
              </div>
            )}            {labor.length > 0 ? (
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>인원별 노무 기성</span>
                  <span className={styles.sectionMeta}>{labor.length}명</span>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>성명</th>
                        <th>사번</th>
                        <th>협력사</th>
                        <th>근무일수</th>
                        <th>총 공수</th>
                      </tr>
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
                        <td>{totalWorkDays}일</td>
                        <td>{totalLaborUnits}공</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.section}>
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📊</div>
                  <div className={styles.emptyText}>출결 데이터가 없습니다.</div>
                  <span style={{ fontSize: 12, color: "#99a1b7" }}>출결기성관리에서 파일을 업로드하면 자동으로 집계됩니다.</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}