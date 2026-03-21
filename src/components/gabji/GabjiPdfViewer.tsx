"use client";

// PDFViewer + GabjiPdf 래퍼
// 600ms 디바운스: 타이핑 중 PDF 재렌더링 억제
// 모바일(≤768px): iOS 등에서 iframe PDFViewer가 "Open" 영문 UI만 나오는 경우가 많아
// blob 생성 후 새 탭으로 열기 패널 사용

import React, { useEffect, useState } from "react";
import { pdf, PDFViewer } from "@react-pdf/renderer";
import GabjiPdf from "./GabjiPdf";
import type { GabjiDoc, GabjiItem } from "./types";
import { useMobilePdfOpenFallback } from "@/lib/useMobilePdfOpenFallback";
import MobilePdfOpenPanel from "@/components/pdf/MobilePdfOpenPanel";

const DEFAULT_STABLE_DEBOUNCE_MS = 600;

interface Props {
  doc: GabjiDoc;
  items: GabjiItem[];
  valueFontSize?: string;
  /** 모바일 편집 탭에서 백그라운드 미리 생성 시 짧게(예: 220) */
  stableDebounceMs?: number;
}

export default function GabjiPdfViewer({
  doc,
  items,
  valueFontSize,
  stableDebounceMs = DEFAULT_STABLE_DEBOUNCE_MS,
}: Props) {
  const [stableDoc, setStableDoc] = useState(doc);
  const [stableItems, setStableItems] = useState(items);
  const mobileOpen = useMobilePdfOpenFallback();

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // 입력 멈춘 후 debounce 뒤 PDF 반영 (편집 탭 백그라운드는 짧게)
  useEffect(() => {
    const t = setTimeout(() => {
      setStableDoc(doc);
      setStableItems(items);
    }, stableDebounceMs);
    return () => clearTimeout(t);
  }, [doc, items, stableDebounceMs]);

  // 모바일: PDFViewer 대신 blob URL 생성
  useEffect(() => {
    if (!mobileOpen) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setGenError(null);
      setGenerating(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setGenerating(true);
      setGenError(null);
      try {
        const blob = await pdf(
          <GabjiPdf
            doc={stableDoc}
            items={stableItems}
            valueFontSize={valueFontSize}
          />,
        ).toBlob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e) {
        if (!cancelled) {
          setGenError(e instanceof Error ? e.message : "PDF 생성 실패");
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [mobileOpen, stableDoc, stableItems, valueFontSize]);

  if (mobileOpen) {
    return (
      <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex" }}>
        <MobilePdfOpenPanel
          generating={generating}
          error={genError}
          blobUrl={blobUrl}
          docLabel="갑지"
        />
      </div>
    );
  }

  return (
    <PDFViewer width="100%" height="100%" showToolbar={true}>
      <GabjiPdf
        doc={stableDoc}
        items={stableItems}
        valueFontSize={valueFontSize}
      />
    </PDFViewer>
  );
}
