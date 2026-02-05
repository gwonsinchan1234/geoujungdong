"use client";

import React from "react";
import styles from "./PhotoSheet.module.css";
import type { PhotoSheetItem } from "./types";

type Props = {
  item: PhotoSheetItem;
};

/**
 * 단일 NO 항목 렌더링
 * - 반입사진 4칸 (2x2) 고정
 * - 설치사진 4칸 (2x2) 고정
 * - 사진 없으면 빈칸 유지
 */
export function PhotoSheetItemView({ item }: Props) {
  // 4칸 고정 배열 생성 (빈칸 포함)
  const inboundSlots = Array.from({ length: 4 }, (_, i) => item.inboundPhotos[i] ?? null);
  const installSlots = Array.from({ length: 4 }, (_, i) => item.installPhotos[i] ?? null);

  return (
    <div className={styles.item}>
      {/* NO 헤더 */}
      <div className={styles.noHeader}>NO.{item.no}</div>

      {/* 사진 영역 (반입 | 설치) */}
      <div className={styles.content}>
        {/* 반입사진 열 */}
        <div className={styles.column}>
          <div className={styles.columnHeader}>반입사진</div>
          <div className={styles.photoGrid}>
            {inboundSlots.map((url, idx) => (
              <div key={`inbound_${idx}`} className={styles.photoCell}>
                {url ? (
                  <img src={url} alt={`반입 ${idx + 1}`} />
                ) : (
                  <span className={styles.emptyCell}>(빈)</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 설치사진 열 */}
        <div className={styles.column}>
          <div className={styles.columnHeader}>현장 설치 사진</div>
          <div className={styles.photoGrid}>
            {installSlots.map((url, idx) => (
              <div key={`install_${idx}`} className={styles.photoCell}>
                {url ? (
                  <img src={url} alt={`설치 ${idx + 1}`} />
                ) : (
                  <span className={styles.emptyCell}>(빈)</span>
                )}
              </div>
            ))}
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
