"use client";

// GabjiPdfViewer 와 동일한 패턴
// 600ms 디바운스: 타이핑 중 PDF 재렌더 억제
// 모바일: iframe PDFViewer 대신 blob + 새 탭 패널

import React, { useEffect, useState } from "react";
import { pdf, PDFViewer } from "@react-pdf/renderer";
import ItemListPdf from "./ItemListPdf";
import type { ItemData } from "./types";
import { useMobilePdfOpenFallback } from "@/lib/useMobilePdfOpenFallback";
import MobilePdfOpenPanel from "@/components/pdf/MobilePdfOpenPanel";

const DEFAULT_STABLE_DEBOUNCE_MS = 600;

interface Props {
  items: ItemData[];
  stableDebounceMs?: number;
}

export default function ItemListPdfViewer({
  items,
  stableDebounceMs = DEFAULT_STABLE_DEBOUNCE_MS,
}: Props) {
  const [stableItems, setStableItems] = useState(items);
  const mobileOpen = useMobilePdfOpenFallback();

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setStableItems(items), stableDebounceMs);
    return () => clearTimeout(t);
  }, [items, stableDebounceMs]);

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
        const blob = await pdf(<ItemListPdf items={stableItems} />).toBlob();
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
  }, [mobileOpen, stableItems]);

  if (mobileOpen) {
    return (
      <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex" }}>
        <MobilePdfOpenPanel
          generating={generating}
          error={genError}
          blobUrl={blobUrl}
          docLabel="항목별세부내역"
        />
      </div>
    );
  }

  return (
    <PDFViewer width="100%" height="100%" showToolbar={true}>
      <ItemListPdf items={stableItems} />
    </PDFViewer>
  );
}
