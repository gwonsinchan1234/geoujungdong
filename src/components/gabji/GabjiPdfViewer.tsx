"use client";

// PDFViewer + GabjiPdf 래퍼
// 600ms 디바운스: 타이핑 중 PDF 재렌더링 억제

import React, { useEffect, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import GabjiPdf from "./GabjiPdf";
import type { GabjiDoc, GabjiItem } from "./types";

interface Props {
  doc: GabjiDoc;
  items: GabjiItem[];
}

export default function GabjiPdfViewer({ doc, items }: Props) {
  const [stableDoc,   setStableDoc]   = useState(doc);
  const [stableItems, setStableItems] = useState(items);

  // 입력 멈춘 후 600ms 뒤 PDF 갱신
  useEffect(() => {
    const t = setTimeout(() => {
      setStableDoc(doc);
      setStableItems(items);
    }, 600);
    return () => clearTimeout(t);
  }, [doc, items]);

  return (
    <PDFViewer
      width="100%"
      height="100%"
      showToolbar={true}
    >
      <GabjiPdf doc={stableDoc} items={stableItems} />
    </PDFViewer>
  );
}
