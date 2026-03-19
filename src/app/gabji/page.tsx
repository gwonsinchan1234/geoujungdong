"use client";

// /gabji 페이지 — 산업안전보건관리비 사용내역서(갑지)
// 진입 시 로그인 확인 → 현장명+월 선택 → 불러오기 또는 신규 작성

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import GabjiEditor from "@/components/gabji/GabjiEditor";
import type { GabjiDoc, GabjiItem } from "@/components/gabji/types";
import { makeDefaultItems, makeEmptyDoc } from "@/components/gabji/types";
import styles from "./page.module.css";

type Status = "loading" | "unauth" | "ready";

export default function GabjiPage() {
  const router = useRouter();

  const [status, setStatus]   = useState<Status>("loading");
  const [siteName, setSiteName] = useState("");
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [fetching, setFetching] = useState(false);

  // 에디터로 넘길 데이터
  const [doc,   setDoc]   = useState<GabjiDoc | null>(null);
  const [items, setItems] = useState<GabjiItem[] | null>(null);

  const siteRef = useRef<HTMLInputElement>(null);

  // ── 인증 확인 ────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setStatus("unauth");
      } else {
        setStatus("ready");
        // 마지막 사용 현장+월 복원
        try {
          const last = localStorage.getItem("gabji_last");
          if (last) {
            const { site_name, year_month } = JSON.parse(last);
            if (site_name)  setSiteName(site_name);
            if (year_month) setYearMonth(year_month);
          }
        } catch {}
      }
    });
  }, []);

  // ── 불러오기 ─────────────────────────────────────────────────
  async function handleLoad() {
    if (!siteName.trim()) {
      siteRef.current?.focus();
      return;
    }
    setFetching(true);
    try {
      const params = new URLSearchParams({ site_name: siteName.trim(), year_month: yearMonth });
      const res  = await fetch(`/api/gabji/load?${params}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) { setStatus("unauth"); return; }
        alert(data.error ?? "불러오기 실패");
        return;
      }

      if (data.doc) {
        // 기존 문서
        setDoc(data.doc);
        setItems(data.items && data.items.length > 0 ? data.items : makeDefaultItems());
      } else {
        // 신규 문서 — 빈 문서 초기화
        setDoc({ ...makeEmptyDoc(), site_name: siteName.trim(), year_month: yearMonth });
        setItems(makeDefaultItems());
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setFetching(false);
    }
  }

  // Enter 키로 불러오기
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleLoad();
  }

  // ── 렌더 ─────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className={styles.page}>
        <div className={styles.authOverlay}>
          <div className={styles.loadingCard} style={{ background: "#1e293b", borderRadius: 12, padding: "28px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, border: "3px solid rgba(255,255,255,.15)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />
            <span style={{ fontSize: 13, color: "#94a3b8" }}>로딩 중…</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauth") {
    return (
      <div className={styles.page}>
        <div className={styles.authOverlay}>
          <div className={styles.authCard}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div className={styles.authTitle}>로그인이 필요합니다</div>
            <div className={styles.authDesc}>
              갑지 사용내역서는 로그인 후<br />이용할 수 있습니다.
            </div>
            <button
              type="button"
              className={styles.loginBtn}
              onClick={() => router.push("/login?next=/gabji")}
            >
              로그인하러 가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── 현장·월 선택 바 ── */}
      <div className={styles.selectorBar}>
        <span className={styles.selectorLabel}>현장명</span>
        <input
          ref={siteRef}
          type="text"
          className={styles.siteInput}
          placeholder="예: 거우중동 1구역"
          value={siteName}
          onChange={e => setSiteName(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className={styles.selectorLabel}>작성기준월</span>
        <input
          type="month"
          className={styles.monthInput}
          value={yearMonth}
          onChange={e => setYearMonth(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={styles.loadBtn}
          onClick={handleLoad}
          disabled={fetching || !siteName.trim()}
        >
          {fetching ? (
            <><div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> 불러오는 중…</>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              불러오기
            </>
          )}
        </button>
        <span className={styles.hint}>현장명+월을 입력 후 불러오기 → 없으면 신규 문서 생성</span>
      </div>

      {/* ── 에디터 or 빈 상태 ── */}
      {doc ? (
        <div className={styles.editorArea}>
          <GabjiEditor initialDoc={doc} initialItems={items} />
        </div>
      ) : (
        <div className={styles.emptyState}>
          <svg className={styles.emptyIcon} width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <div className={styles.emptyTitle}>갑지 사용내역서</div>
          <div className={styles.emptyDesc}>
            위에서 현장명과 작성기준월을 입력한 후<br />
            <strong>불러오기</strong>를 눌러 시작하세요.<br />
            <span style={{ fontSize: 12 }}>기존 데이터가 없으면 새 문서가 생성됩니다.</span>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
