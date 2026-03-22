"use client";

// 항목별세부내역(ItemListView)과 동일: 좌 편집 + 우 PDFViewer, 모바일 탭 전환

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import type { LaborHistoryRow } from "./types";
import type { LaborAllowancePdfMeta } from "./LaborAllowancePdf";
import ilStyles from "@/components/item-list/item-list.module.css";
import { useMobilePdfOpenFallback } from "@/lib/useMobilePdfOpenFallback";

const LaborAllowancePdfViewer = dynamic(() => import("./LaborAllowancePdfViewer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "#94a3b8",
        fontSize: 13,
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: "3px solid rgba(148,163,184,.3)",
          borderTopColor: "#3b82f6",
          borderRadius: "50%",
          animation: "spin 0.75s linear infinite",
        }}
      />
      PDF 준비 중…
    </div>
  ),
});

const MOBILE_PREFETCH_DEBOUNCE_MS = 220;
const PREVIEW_TAB_DEBOUNCE_MS = 600;

function fmtNum(n: number) {
  return n.toLocaleString("ko-KR");
}

interface Props {
  children: React.ReactNode;
  rows: LaborHistoryRow[];
  meta: LaborAllowancePdfMeta;
  loading?: boolean;
}

export default function LaborAllowanceSplitLayout({ children, rows, meta, loading }: Props) {
  const [mobileTab, setMobileTab] = useState<"list" | "preview">("list");
  const mobilePdfFallback = useMobilePdfOpenFallback();
  const pdfStableDebounceMs =
    mobilePdfFallback && mobileTab === "list"
      ? MOBILE_PREFETCH_DEBOUNCE_MS
      : PREVIEW_TAB_DEBOUNCE_MS;

  const totalAmt = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows],
  );

  return (
    <div className={ilStyles.editor}>
      <div className={ilStyles.mobileTabs}>
        <div className={ilStyles.tabBar}>
          <button
            type="button"
            className={`${ilStyles.tabBtn} ${mobileTab === "list" ? ilStyles.active : ""}`}
            onClick={() => setMobileTab("list")}
          >
            인건비 편집
          </button>
          <button
            type="button"
            className={`${ilStyles.tabBtn} ${mobileTab === "preview" ? ilStyles.active : ""}`}
            onClick={() => setMobileTab("preview")}
          >
            미리보기
          </button>
        </div>
      </div>

      <div className={ilStyles.editorBody}>
        <div
          className={`${ilStyles.leftPanel} ${mobileTab === "preview" ? ilStyles.mobileHidden : ""}`}
        >
          <div className={ilStyles.leftSummary}>
            <span className={ilStyles.leftSummaryTitle}>안전관리자 인건비</span>
            <span className={ilStyles.leftSummarySep} />
            <span className={ilStyles.leftSummaryCount}>
              총 {rows.length}건{loading ? " · 조회 중" : ""}
            </span>
            <span className={ilStyles.leftSummaryTotal}>{fmtNum(totalAmt)}원</span>
          </div>
          <div className={ilStyles.formWrap}>{children}</div>
        </div>

        <motion.div
          className={ilStyles.rightPanel}
          animate={{
            opacity: !mobilePdfFallback || mobileTab === "preview" ? 1 : 0,
            y: !mobilePdfFallback || mobileTab === "preview" ? 0 : 16,
          }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          style={{
            pointerEvents: !mobilePdfFallback || mobileTab === "preview" ? "auto" : "none",
          }}
        >
          <LaborAllowancePdfViewer
            rows={rows}
            meta={meta}
            stableDebounceMs={pdfStableDebounceMs}
          />
        </motion.div>
      </div>
    </div>
  );
}
