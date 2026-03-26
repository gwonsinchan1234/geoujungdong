"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

// ── 타입 ──────────────────────────────────────────────────────────
type BatchInfo = { source_file_name: string; count: number; first_date: string; last_date: string; uploaded_at: string };
type DailyRow  = { id: string; person_name: string; employee_id: string; company: string; work_date: string; check_in: string|null; check_out: string|null; total_minutes: number; labor_units: number; labor_status: string; log_count: number };

type Tab = "list" | "summary" | "preview";

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

// ── 미리보기 체크표 ───────────────────────────────────────────────
function CheckTable({ daily }: { daily: DailyRow[] }) {
  if (!daily.length) return <div className={styles.emptyState}><div className={styles.emptyText}>출결 데이터가 없습니다.</div></div>;

  const dates   = Array.from(new Set(daily.map((r) => r.work_date))).sort();
  const persons = Array.from(new Set(daily.map((r) => r.person_name))).sort();
  const cellMap = new Map(daily.map((r) => [`${r.person_name}__${r.work_date}`, r]));

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
                <td className={styles.sumCell}>{total > 0 ? total : "-"}</td>
              </tr>
            );
          })}
          <tr>
            <td className={styles.nameCell} style={{ fontWeight: 700 }}>합계</td>
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
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    if (search && !r.person_name.includes(search) && !r.company.includes(search)) return false;
    if (filterStatus && r.labor_status !== filterStatus) return false;
    if (filterCompany && r.company !== filterCompany) return false;
    return true;
  });
  const companies = Array.from(new Set(daily.map((r) => r.company).filter(Boolean))).sort();

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
              <span style={{ fontSize: 12, color: "var(--at-muted)", marginLeft: "auto" }}>{filteredDaily.length}건</span>
            </div>
            {dataLoading ? (
              <div className={styles.loading}><div className={styles.spinner} />로딩 중...</div>
            ) : filteredDaily.length === 0 ? (
              <div className={styles.emptyState}><div className={styles.emptyIcon}>📋</div><div className={styles.emptyText}>출결 데이터가 없습니다.</div></div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>날짜</th><th>성명</th><th>회사</th><th>출근</th><th>퇴근</th><th>근무시간</th><th>공수</th><th>상태</th></tr>
                  </thead>
                  <tbody>
                    {filteredDaily.map((r) => (
                      <tr key={r.id}>
                        <td>{fmtDate(r.work_date)}</td>
                        <td style={{ fontWeight: 600, textAlign: "left" }}>{r.person_name}</td>
                        <td style={{ textAlign: "left" }}>{r.company || "-"}</td>
                        <td>{fmtTime(r.check_in)}</td>
                        <td>{fmtTime(r.check_out)}</td>
                        <td>{fmtMins(r.total_minutes)}</td>
                        <td style={{ fontWeight: 700 }}>{r.labor_units > 0 ? r.labor_units : "-"}</td>
                        <td><BadgeStatus status={r.labor_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* 미리보기 탭 */}
        {tab === "preview" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button className={`${styles.btnSm} ${styles.btnPrimary}`} onClick={() => window.print()}>인쇄</button>
            </div>
            {dataLoading ? (
              <div className={styles.loading}><div className={styles.spinner} />로딩 중...</div>
            ) : (
              <CheckTable daily={daily} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
