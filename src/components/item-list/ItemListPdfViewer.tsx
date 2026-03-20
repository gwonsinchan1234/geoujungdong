"use client";

// GabjiPdfViewer 와 동일한 패턴
// 600ms 디바운스: 타이핑 중 PDF 재렌더 억제

import React, { useEffect, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import ItemListPdf from "./ItemListPdf";
import type { ItemData } from "./types";

interface Props { items: ItemData[] }

export default function ItemListPdfViewer({ items }: Props) {
  const [stableItems, setStableItems] = useState(items);

  useEffect(() => {
    const t = setTimeout(() => setStableItems(items), 600);
    return () => clearTimeout(t);
  }, [items]);

  return (
    <PDFViewer width="100%" height="100%" showToolbar={true}>
      <ItemListPdf items={stableItems} />
    </PDFViewer>
  );
}
