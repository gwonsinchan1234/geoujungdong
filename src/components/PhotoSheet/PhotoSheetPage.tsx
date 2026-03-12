"use client";

import React from "react";
import styles from "./PhotoSheet.module.css";
import { PhotoSheetItemView } from "./PhotoSheetItemView";
import { getTemplateSpec, DEFAULT_TEMPLATE_ID } from "./templateSpec";
import type { PhotoSheetItem } from "./types";

type Props = {
  items: PhotoSheetItem[];
  preview?: boolean;
  /** 문서 상단 제목 (예: 사진대지(안전시설물)) */
  documentTitle?: string;
};

/**
 * 사진대지 페이지
 * - 맨 위에 시트 제목(항목별 템플릿에 따라), 그 아래 NO.1, NO.2... 블록
 * - 최대 3개 항목 = 1페이지 (A4 세로)
 * - preview=true: 미리보기용 스케일
 */
export function PhotoSheetPage({ items, preview = false, documentTitle = "사진대지(안전시설물)" }: Props) {
  // no를 배열 순서(1-based)로 재부여 → 엑셀 원본의 중복/불규칙 순번 무시
  const numberedItems: PhotoSheetItem[] = items.map((item, i) => ({ ...item, no: i + 1 }));

  const pages: PhotoSheetItem[][] = [];
  for (let i = 0; i < numberedItems.length; i += 3) {
    pages.push(numberedItems.slice(i, i + 3));
  }
  if (pages.length === 0) {
    pages.push([]);
  }

  return (
    <>
      {pages.map((pageItems, pageIdx) => {
        const firstItem = pageItems[0];
        const templateId = firstItem?.templateId ?? DEFAULT_TEMPLATE_ID;
        const spec = getTemplateSpec(templateId);
        const sheetTitle = spec?.previewTitle ?? "사진대지";

        return (
          <div
            key={`page_${pageIdx}`}
            className={preview ? styles.pagePreview : styles.page}
          >
            <div className={styles.sheetTitle}>{sheetTitle}</div>

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
        );
      })}
    </>
  );
}
