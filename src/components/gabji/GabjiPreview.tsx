"use client";

// 미리보기 분기:
//   모바일(≤768px) → GabjiHtmlPreview (HTML/CSS, 입력값 즉시 반영)
//   데스크탑       → GabjiPdfViewer  (@react-pdf iframe, SSR:false)
//
// 이유: 모바일 브라우저(iOS Safari / Android Chrome)는 <iframe> PDF 렌더링을
// 지원하지 않아 "파일 열기" fallback 카드만 표시됨. HTML 방식으로 대체.

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import GabjiHtmlPreview from "./GabjiHtmlPreview";
import type { GabjiDoc, GabjiItem } from "./types";

interface Props {
  doc: GabjiDoc;
  items: GabjiItem[];
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

// 초기값을 클라이언트에서 즉시 계산해 flash 방지
function initIsMobile() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768;
}

export default function GabjiPreview({ doc, items }: Props) {
  const [isMobile, setIsMobile] = useState(initIsMobile);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return <GabjiHtmlPreview doc={doc} items={items} />;
  }

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <GabjiPdfViewer doc={doc} items={items} />
    </div>
  );
}
