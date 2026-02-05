"use client";

import React from "react";
import styles from "./PhotoSheet.module.css";
import { PhotoSheetItemView } from "./PhotoSheetItemView";
import type { PhotoSheetItem } from "./types";

type Props = {
  items: PhotoSheetItem[];
  preview?: boolean;
};

/**
 * 사진대지 페이지
 * - 최대 3개 항목 = 1페이지 (A4 세로)
 * - preview=true: 미리보기용 스케일
 * - preview=false: 출력용 실제 크기
 */
export function PhotoSheetPage({ items, preview = false }: Props) {
  // 3개씩 페이지 분할
  const pages: PhotoSheetItem[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    pages.push(items.slice(i, i + 3));
  }

  // 빈 페이지 방지
  if (pages.length === 0) {
    pages.push([]);
  }

  return (
    <>
      {pages.map((pageItems, pageIdx) => (
        <div
          key={`page_${pageIdx}`}
          className={preview ? styles.pagePreview : styles.page}
        >
          {pageItems.length === 0 ? (
            <div style={{ textAlign: "center", color: "#999", paddingTop: 100 }}>
              사진이 등록된 품목이 없습니다.
            </div>
          ) : (
            pageItems.map((item) => (
              <PhotoSheetItemView key={`item_${item.no}`} item={item} />
            ))
          )}
        </div>
      ))}
    </>
  );
}
