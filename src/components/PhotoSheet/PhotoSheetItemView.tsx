"use client";

import React from "react";
import styles from "./PhotoSheet.module.css";
import type { PhotoSheetItem } from "./types";

type Props = {
  item: PhotoSheetItem;
};

/** 사진 개수에 따른 그리드 클래스 (0~4) */
function photoGridClass(count: number): string {
  const n = Math.min(4, Math.max(0, count));
  return `${styles.photoGrid} ${styles[`photoGridCount${n}` as keyof typeof styles]}`;
}

/**
 * 단일 NO 항목 렌더링
 * - 반입/설치 각각 0~4장 유연 레이아웃 (1장=한 칸, 2장=나란히, 3장=2+1, 4장=2x2)
 * - 사진 없으면 빈 회색 영역
 */
export function PhotoSheetItemView({ item }: Props) {
  const inboundPhotos = item.inboundPhotos.slice(0, 4);
  const installPhotos = item.installPhotos.slice(0, 4);
  const inboundCount = inboundPhotos.length;
  const installCount = installPhotos.length;

  return (
    <div className={styles.item}>
      <div className={styles.noHeader}>NO.{item.no}</div>

      <div className={styles.content}>
        {/* 반입사진 열 */}
        <div className={styles.column}>
          <div className={styles.columnHeader}>반입사진</div>
          <div className={photoGridClass(inboundCount)}>
            {inboundCount === 0 ? (
              <div className={styles.photoCell}>
                <span className={styles.emptyCell}>(빈)</span>
              </div>
            ) : (
              inboundPhotos.map((url, idx) => (
                <div key={`inbound_${idx}`} className={styles.photoCell}>
                  <img src={url} alt={`반입 ${idx + 1}`} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* 설치사진 열 */}
        <div className={styles.column}>
          <div className={styles.columnHeader}>현장 설치 사진</div>
          <div className={photoGridClass(installCount)}>
            {installCount === 0 ? (
              <div className={styles.photoCell}>
                <span className={styles.emptyCell}>(빈)</span>
              </div>
            ) : (
              installPhotos.map((url, idx) => (
                <div key={`install_${idx}`} className={styles.photoCell}>
                  <img src={url} alt={`설치 ${idx + 1}`} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 날짜 행 */}
      <div className={styles.infoRow}>
        <div className={styles.infoCell}>
          <span className={styles.infoLabel}>날짜</span>
          <span className={styles.infoValue}>{item.date || "—"}</span>
        </div>
        <div className={styles.infoCell}>
          <span className={styles.infoLabel}>날짜</span>
          <span className={styles.infoValue}>{item.date || "—"}</span>
        </div>
      </div>

      {/* 항목 행 */}
      <div className={styles.infoRow}>
        <div className={styles.infoCell}>
          <span className={styles.infoLabel}>항목</span>
          <span className={styles.infoValue}>{item.itemName || "—"}</span>
        </div>
        <div className={styles.infoCell}>
          <span className={styles.infoLabel}>항목</span>
          <span className={styles.infoValue}>{item.itemName || "—"}</span>
        </div>
      </div>
    </div>
  );
}
