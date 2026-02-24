"use client";

import React from "react";
import styles from "./PhotoSheet.module.css";
import { PhotoSheetItemView } from "./PhotoSheetItemView";
import type { PhotoSheetItem } from "./types";

type Props = {
  items: PhotoSheetItem[];
  preview?: boolean;
  /** 문서 상단 제목 (예: 사진대지(안전시설물)) */
  documentTitle?: string;
};

/**
 * 사진대지 페이지
 * - 최대 3개 항목 = 1페이지 (A4 세로)
 * - preview=true: 미리보기용 스케일
 * - preview=false: 출력용 실제 크기
 */
export function PhotoSheetPage({ items, preview = false, documentTitle = "사진대지(안전시설물)" }: Props) {
  // no를 배열 순서(1-based)로 재부여 → 엑셀 원본의 중복/불규칙 순번 무시
  const numberedItems: PhotoSheetItem[] = items.map((item, i) => ({ ...item, no: i + 1 }));

  // 3개씩 페이지 분할
  const pages: PhotoSheetItem[][] = [];
  for (let i = 0; i < numberedItems.length; i += 3) {
    pages.push(numberedItems.slice(i, i + 3));
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
          {pageIdx === 0 && documentTitle ? (
            <h1 className={styles.documentTitle}>{documentTitle}</h1>
          ) : null}
          {pageItems.length === 0 ? (
            <div className={styles.emptyMessage}>사진이 등록된 품목이 없습니다.</div>
          ) : (
            pageItems.map((item, rowIdx) => (
              <PhotoSheetItemView key={`page_${pageIdx}_row_${rowIdx}_no_${item.no}`} item={item} />
            ))
          )}
        </div>
      ))}
    </>
  );
}
