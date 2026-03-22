"use client";

import React, { useEffect, useState } from "react";
import { pdf, PDFViewer } from "@react-pdf/renderer";
import LaborAllowancePdf, { type LaborAllowancePdfMeta } from "./LaborAllowancePdf";
import type { LaborHistoryRow } from "./types";
import { useMobilePdfOpenFallback } from "@/lib/useMobilePdfOpenFallback";
import MobilePdfOpenPanel from "@/components/pdf/MobilePdfOpenPanel";

const DEFAULT_STABLE_DEBOUNCE_MS = 600;

interface Props {
  rows: LaborHistoryRow[];
  meta: LaborAllowancePdfMeta;
  stableDebounceMs?: number;
}

export default function LaborAllowancePdfViewer({
  rows,
  meta,
  stableDebounceMs = DEFAULT_STABLE_DEBOUNCE_MS,
}: Props) {
  const [stableRows, setStableRows] = useState(rows);
  const [stableMeta, setStableMeta] = useState(meta);
  const mobileOpen = useMobilePdfOpenFallback();

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setStableRows(rows);
      setStableMeta(meta);
    }, stableDebounceMs);
    return () => clearTimeout(t);
  }, [rows, meta, stableDebounceMs]);

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
          <LaborAllowancePdf rows={stableRows} meta={stableMeta} />,
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
  }, [mobileOpen, stableRows, stableMeta]);

  if (mobileOpen) {
    return (
      <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex" }}>
        <MobilePdfOpenPanel
          generating={generating}
          error={genError}
          blobUrl={blobUrl}
          docLabel="인건비"
        />
      </div>
    );
  }

  return (
    <PDFViewer width="100%" height="100%" showToolbar={true}>
      <LaborAllowancePdf rows={stableRows} meta={stableMeta} />
    </PDFViewer>
  );
}
