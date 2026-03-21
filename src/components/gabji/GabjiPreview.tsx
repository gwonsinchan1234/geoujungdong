"use client";

// 미리보기는 모바일/데스크탑 모두 동일하게 GabjiPdfViewer를 사용한다.
// 인쇄(PDF) 결과와 화면 미리보기 결과를 일치시키기 위함.

import React from "react";
import dynamic from "next/dynamic";
import type { GabjiDoc, GabjiItem } from "./types";

interface Props {
  doc: GabjiDoc;
  items: GabjiItem[];
  valueFontSize?: string;
  stableDebounceMs?: number;
}

const GabjiPdfViewer = dynamic(() => import("./GabjiPdfViewer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: "#94a3b8", fontSize: 13,
        flexDirection: "column", gap: 10,
      }}
    >
      <div
        style={{
          width: 28, height: 28,
          border: "3px solid rgba(148,163,184,.3)", borderTopColor: "#3b82f6",
          borderRadius: "50%", animation: "spin 0.75s linear infinite",
        }}
      />
      PDF 준비 중…
    </div>
  ),
});

export default function GabjiPreview({
  doc,
  items,
  valueFontSize,
  stableDebounceMs,
}: Props) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <GabjiPdfViewer
        doc={doc}
        items={items}
        valueFontSize={valueFontSize}
        stableDebounceMs={stableDebounceMs}
      />
    </div>
  );
}
