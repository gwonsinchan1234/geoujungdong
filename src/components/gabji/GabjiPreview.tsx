"use client";

// react-pdf PDFViewer 래퍼 — SSR 없이 클라이언트에서만 렌더링

import React from "react";
import dynamic from "next/dynamic";
import type { GabjiDoc, GabjiItem } from "./types";

interface Props {
  doc: GabjiDoc;
  items: GabjiItem[];
}

// SSR에서 제외: react-pdf는 브라우저 전용
const GabjiPdfViewer = dynamic(() => import("./GabjiPdfViewer"), {
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

export default function GabjiPreview({ doc, items }: Props) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <GabjiPdfViewer doc={doc} items={items} />
    </div>
  );
}
