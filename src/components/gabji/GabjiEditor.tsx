"use client";

// 갑지 에디터 최상위 컴포넌트
// 좌측 폼 ↔ 우측 PDF 미리보기 실시간 연동
// 저장 → /api/gabji/save, 이전월 복사 → /api/gabji/copy
// 인쇄 → react-pdf blob → 새 탭 열기

import React, { useState, useCallback, useEffect } from "react";
import type { GabjiDoc, GabjiItem } from "./types";
import { makeDefaultItems, makeEmptyDoc } from "./types";
import GabjiForm from "./GabjiForm";
import GabjiItemsForm from "./GabjiItemsForm";
import GabjiPreview from "./GabjiPreview";
import GabjiToolbar from "./GabjiToolbar";
import styles from "./gabji.module.css";

interface Props {
  initialDoc: GabjiDoc | null;
  initialItems: GabjiItem[] | null;
}

type MobileTab = "form" | "items" | "preview";
type Toast = { msg: string; type: "success" | "error" } | null;

export default function GabjiEditor({ initialDoc, initialItems }: Props) {
  // ── 상태 ──────────────────────────────────────────────────────
  const [doc, setDoc]     = useState<GabjiDoc>(() => initialDoc ?? makeEmptyDoc());
  const [items, setItems] = useState<GabjiItem[]>(() =>
    initialItems && initialItems.length > 0 ? initialItems : makeDefaultItems()
  );
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState<Toast>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("form");

  useEffect(() => { if (initialDoc) setDoc(initialDoc); }, [initialDoc]);
  useEffect(() => {
    if (initialItems && initialItems.length > 0) setItems(initialItems);
  }, [initialItems]);

  // ── 토스트 ──────────────────────────────────────────────────
  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2200);
  }

  // ── 저장 ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!doc.site_name || !doc.year_month) {
      showToast("현장명과 작성기준월을 입력해주세요.", "error");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/gabji/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setDoc(prev => ({ ...prev, id: data.doc.id }));
      setSaved(true);
      showToast("저장 완료");
      localStorage.setItem("gabji_last", JSON.stringify({
        site_name: doc.site_name, year_month: doc.year_month,
      }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }, [doc, items]);

  // ── 이전월 복사 ─────────────────────────────────────────────
  const handleCopy = useCallback(async (fromYM: string) => {
    if (!doc.site_name) {
      showToast("현장명을 먼저 입력해주세요.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/gabji/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_name:       doc.site_name,
          from_year_month: fromYM,
          to_year_month:   doc.year_month,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "복사 실패");
      setDoc(data.doc);
      setItems(data.items && data.items.length > 0 ? data.items : makeDefaultItems());
      setSaved(false);
      showToast(`${fromYM} 데이터를 복사했습니다.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "복사 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [doc.site_name, doc.year_month]);

  // ── PDF 열기 (react-pdf → blob → 새 탭) ────────────────────
  const handlePrint = useCallback(async () => {
    showToast("PDF 생성 중…");
    try {
      const [{ pdf }, { default: GabjiPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./GabjiPdf"),
      ]);
      const blob = await pdf(<GabjiPdf doc={doc} items={items} />).toBlob();
      const url  = URL.createObjectURL(blob);
      const w    = window.open(url, "_blank");
      if (!w) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `갑지_${doc.site_name || "문서"}_${doc.year_month || ""}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setToast(null); // 생성 완료 시 토스트 제거
    } catch (err) {
      showToast(err instanceof Error ? err.message : "PDF 생성 실패", "error");
    }
  }, [doc, items]);

  // ── 렌더 ────────────────────────────────────────────────────
  return (
    <div className={styles.editor}>
      {/* 툴바 */}
      <GabjiToolbar
        saving={saving}
        saved={saved}
        onSave={handleSave}
        onCopy={handleCopy}
        onPrint={handlePrint}
        yearMonth={doc.year_month}
        siteName={doc.site_name}
      />

      {/* 모바일 탭바 */}
      <div className={styles.mobileTabs}>
        <div className={styles.tabBar}>
          {(["form", "items", "preview"] as MobileTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              className={`${styles.tabBtn} ${mobileTab === tab ? styles.active : ""}`}
              onClick={() => setMobileTab(tab)}
            >
              {tab === "form" ? "기본정보" : tab === "items" ? "사용내역" : "미리보기"}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 2분할 */}
      <div className={styles.editorBody}>
        {/* 좌측: 폼 */}
        <div className={`${styles.leftPanel} ${mobileTab === "preview" ? styles.mobileHidden : ""}`}>
          <div className={mobileTab === "items" ? styles.mobileHidden : ""}>
            <GabjiForm doc={doc} onChange={d => { setDoc(d); setSaved(false); }} />
          </div>
          <div
            style={{ padding: "0 20px 20px" }}
            className={mobileTab === "form" ? styles.mobileHidden : ""}
          >
            <GabjiItemsForm
              items={items}
              onChange={it => { setItems(it); setSaved(false); }}
              budgeted={doc.budgeted_safety_cost}
            />
          </div>
        </div>

        {/* 우측: PDF 미리보기 */}
        <div className={`${styles.rightPanel} ${mobileTab !== "preview" ? styles.mobileHidden : ""}`}>
          <GabjiPreview doc={doc} items={items} />
        </div>
      </div>

      {/* 로딩 오버레이 */}
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingCard}>
            <div className={styles.loadingSpinner} />
            <span className={styles.loadingText}>처리 중…</span>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === "error" ? styles.toastError : styles.toastSuccess}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
