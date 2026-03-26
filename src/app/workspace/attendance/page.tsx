"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

// ── 타입 ──────────────────────────────────────────────────────────
type Project = { id: string; name: string; description: string; created_at: string };
type BatchInfo = { source_file_name: string; count: number; first_date: string; last_date: string; uploaded_at: string };
type DailyRow  = { id: string; person_name: string; employee_id: string; company: string; work_date: string; check_in: string|null; check_out: string|null; total_minutes: number; labor_units: number; labor_status: string; log_count: number };
type SummaryRow = { person_name: string; employee_id: string; company: string; total_labor_units: number; work_days: number };

type Tab = "list" | "summary" | "preview";

// ── 유틸 ──────────────────────────────────────────────────────────
function fmtTime(t: string | null): string {
  if (!t) return "-";
  return t.slice(0, 5);
}
function fmtDate(d: string): string {
  return d ? d.slice(5).replace("-", "/") : "-"; // "MM/DD"
}
function fmtMins(m: number): string {
  if (!m) return "-";
  const h = Math.floor(m / 60), mi = m % 60;
  return `${h}h${mi > 0 ? mi + "m" : ""}`;
}

function BadgeStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    full:    { label: "1공",   cls: styles.badgeFull },
    half:    { label: "0.5공", cls: styles.badgeHalf },
    missing: { label: "!",     cls: styles.badgeMissing },
    ongoing: { label: "진행중", cls: styles.badgeOngoing },
  };
  const cfg = map[status] ?? { label: status, cls: styles.badgeMissing };
  return <span className={cfg.cls}>{cfg.label}</span>;
}

// ── 미리보기 체크표 ───────────────────────────────────────────────
function CheckTable({ daily }: { daily: DailyRow[] }) {
  if (!daily.length) return <div className={styles.emptyState}><div className={styles.emptyText}>출결 데이터가 없습니다.</div></div>;

  const dates = Array.from(new Set(daily.map((r) => r.work_date))).sort();
  const persons = Array.from(new Set(daily.map((r) => r.person_name))).sort();

  const cellMap = new Map<string, DailyRow>();
  for (const r of daily) cellMap.set(`${r.person_name}__${r.work_date}`, r);

  function cellStyle(row: DailyRow | undefined) {
    if (!row) return styles.checkCellNone;
    if (row.labor_status === "full")    return styles.checkCell1;
    if (row.labor_status === "half")    return styles.checkCell05;
    if (row.labor_status === "ongoing") return styles.checkCellOng;
    return styles.checkCellMiss;
  }
  function cellLabel(row: DailyRow | undefined) {
    if (!row) return "";
    if (row.labor_status === "full")    return "✓";
    if (row.labor_status === "half")    return "½";
    if (row.labor_status === "ongoing") return "▶";
    return "!";
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
            const total = dates.reduce((s, d) => {
              const r = cellMap.get(`${person}__${d}`);
              return s + (r ? Number(r.labor_units) : 0);
            }, 0);
            return (
              <tr key={person}>
                <td className={styles.nameCell}>{person}</td>
                {dates.map((d) => {
                  const row = cellMap.get(`${person}__${d}`);
                  return <td key={d} className={cellStyle(row)}>{cellLabel(row)}</td>;
                })}
                <td className={styles.sumCell}>{total > 0 ? total : "-"}</td>
              </tr>
            );
          })}
          {/* 날짜별 합계 행 */}
          <tr>
            <td className={styles.nameCell} style={{ fontWeight: 700 }}>합계</td>
            {dates.map((d) => {
              const sum = persons.reduce((s, p) => {
                const r = cellMap.get(`${p}__${d}`);
                return s + (r ? Number(r.labor_units) : 0);
              }, 0);
              return <td key={d} className={styles.sumCell}>{sum > 0 ? sum : ""}</td>;
            })}
            <td className={styles.sumCell}>
              {persons.reduce((s, p) => s + dates.reduce((s2, d) => {
                const r = cellMap.get(`${p}__${d}`);
                return s2 + (r ? Number(r.labor_units) : 0);
              }, 0), 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────
export default function AttendancePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("list");

  // 프로젝트
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjId, setSelectedProjId] = useState("");
  const [newProjName, setNewProjName] = useState("");
  const [showNewProj, setShowNewProj] = useState(false);
  const [projLoading, setProjLoading] = useState(false);

  // 데이터
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [, setSummary] = useState<SummaryRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // 필터
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCompany, setFilterCompany] = useState("");

  // 업로드
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // ── 프로젝트 목록 로드
  const loadProjects = useCallback(async (uid: string) => {
    setProjLoading(true);
    const res = await fetch(`/api/attendance/projects?userId=${uid}`);
    const json = await res.json();
    setProjLoading(false);
    if (json.ok) {
      setProjects(json.projects);
      if (!selectedProjId && json.projects.length > 0) setSelectedProjId(json.projects[0].id);
    }
  }, [selectedProjId]);

  useEffect(() => { if (userId) loadProjects(userId); }, [userId, loadProjects]);

  // ── 데이터 로드
  const loadData = useCallback(async () => {
    if (!selectedProjId || !userId) return;
    setDataLoading(true);
    const res = await fetch(`/api/attendance/list?projectId=${selectedProjId}&userId=${userId}`);
    const json = await res.json();
    setDataLoading(false);
    if (json.ok) {
      setBatches(json.batches ?? []);
      setDaily(json.daily ?? []);
      setSummary(json.summary ?? []);
    }
  }, [selectedProjId, userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── 프로젝트 생성
  async function handleCreateProject() {
    if (!userId || !newProjName.trim()) return;
    setProjLoading(true);
    const res = await fetch("/api/attendance/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, name: newProjName.trim() }),
    });
    const json = await res.json();
    setProjLoading(false);
    if (json.ok) {
      setNewProjName("");
      setShowNewProj(false);
      await loadProjects(userId);
      setSelectedProjId(json.project.id);
    }
  }

  // ── 파일 업로드
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedProjId || !userId) return;
    e.target.value = "";

    setUploading(true);
    setUploadMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", selectedProjId);
    fd.append("userId", userId);

    const res = await fetch("/api/attendance/upload", { method: "POST", body: fd });
    const json = await res.json();
    setUploading(false);

    if (json.ok) {
      setUploadMsg({ ok: true, text: json.msg });
      await loadData();
    } else {
      setUploadMsg({ ok: false, text: json.error ?? "업로드 실패" });
    }
  }

  // ── 배치 삭제
  async function handleDeleteBatch(fileName: string) {
    if (!selectedProjId || !userId) return;
    if (!confirm(`"${fileName}" 데이터를 삭제할까요?`)) return;
    await fetch(`/api/attendance/list?projectId=${selectedProjId}&userId=${userId}&fileName=${encodeURIComponent(fileName)}`, { method: "DELETE" });
    await loadData();
  }

  // ── 필터된 daily
  const filteredDaily = daily.filter((r) => {
    if (search && !r.person_name.includes(search) && !r.company.includes(search)) return false;
    if (filterStatus && r.labor_status !== filterStatus) return false;
    if (filterCompany && r.company !== filterCompany) return false;
    return true;
  });

  const companies = Array.from(new Set(daily.map((r) => r.company).filter(Boolean))).sort();

  if (!userId) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}><div className={styles.spinner} /> 로그인 확인 중...</div>
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

      {/* 프로젝트 선택 */}
      <div className={styles.projectBar}>
        <span className={styles.projectLabel}>프로젝트</span>
        {projLoading ? (
          <div className={styles.spinner} style={{ width: 14, height: 14 }} />
        ) : (
          <>
            <select
              className={styles.projectSelect}
              value={selectedProjId}
              onChange={(e) => setSelectedProjId(e.target.value)}
            >
              {projects.length === 0 && <option value="">— 프로젝트 없음 —</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!showNewProj ? (
              <button className={styles.btnSm} onClick={() => setShowNewProj(true)}>+ 신규</button>
            ) : (
              <>
                <input
                  className={styles.projectNewInput}
                  placeholder="프로젝트 이름"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                  autoFocus
                />
                <button className={`${styles.btnSm} ${styles.btnPrimary}`} onClick={handleCreateProject} disabled={projLoading}>생성</button>
                <button className={styles.btnSm} onClick={() => { setShowNewProj(false); setNewProjName(""); }}>취소</button>
              </>
            )}
          </>
        )}
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
            {/* 업로드 영역 */}
            <label className={styles.uploadArea} style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
              {uploading ? (
                <div className={styles.uploadLabel}>
                  <div className={styles.spinner} />
                  <span className={styles.uploadText}>업로드 중...</span>
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className={styles.hiddenInput}
                onChange={(e) => {
                  if (!selectedProjId) {
                    setUploadMsg({ ok: false, text: "프로젝트를 먼저 선택해주세요." });
                    e.target.value = "";
                    return;
                  }
                  handleFile(e);
                }}
                disabled={uploading}
              />
            </label>

            {/* 배치 목록 */}
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
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📋</div>
                <div className={styles.emptyText}>출결 데이터가 없습니다.</div>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>성명</th>
                      <th>회사</th>
                      <th>출근</th>
                      <th>퇴근</th>
                      <th>근무시간</th>
                      <th>공수</th>
                      <th>상태</th>
                    </tr>
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
