// [왜] 엑셀 시트 양식 유지.
// 사진영역만 슬롯 0..3 고정 반복 + find(kind, slot) 렌더.
// 4칸 = 2x2 grid 고정.

"use client";

import React from "react";
import styles from "./PhotoSheet.module.css";
import type { PhotoSheetItem } from "./types";
import { getTemplateSpec, DEFAULT_TEMPLATE_ID } from "./templateSpec";

function toUrl(v: string | undefined | null): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** 슬롯 0..n-1 고정 반복 */
function PhotoGrid({
  kind,
  slotCount,
  photos,
}: {
  kind: "incoming" | "install";
  slotCount: number;
  photos: PhotoSheetItem["photos"];
}) {
  const n = Math.min(4, Math.max(1, slotCount));

  const gridClass =
    n === 4
      ? styles.cols4
      : n === 3
      ? styles.cols3
      : n === 2
      ? styles.cols2
      : styles.cols1;

  console.log("GRID_CHECK", kind, n, gridClass);

  return (
    <div className={styles.photoArea}>
      <div className={`${styles.photoGrid} ${gridClass}`}>
        {Array.from({ length: n }, (_, slot) => {
          const p = photos.find(
            (x) => x.kind === kind && Number(x.slot) === slot
          );
          const url = toUrl(p?.url ?? null);

          return (
            <div key={`${kind}_${slot}`} className={styles.photoCell}>
              {url ? (
                <img
                  src={url}
                  alt={`${kind}_${slot + 1}`}
                  className={styles.photo}
                />
              ) : (
                <span className={styles.emptyCell}>(빈)</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  item: PhotoSheetItem;
};

export function PhotoSheetItemView({ item }: Props) {
  const templateId = item.templateId ?? DEFAULT_TEMPLATE_ID;
  const spec = getTemplateSpec(templateId);

  const incomingLen = spec?.incomingSlots ?? 4;
  const installLen = spec?.installSlots ?? 4;

  const noLabel =
    item.evidence_no != null
      ? String(item.evidence_no)
      : String(item.no);

  return (
    <div className={styles.item}>
      <table className={styles.sheetTable}>
        <colgroup>
          <col className={styles.colA} />
          <col className={styles.colB} />
          <col className={styles.colCDE} />
          <col className={styles.colCDE} />
          <col className={styles.colCDE} />
          <col className={styles.colF} />
          <col className={styles.colGHI} />
          <col className={styles.colGHI} />
          <col className={styles.colGHI} />
        </colgroup>

        <tbody>
          <tr>
            <td className={styles.cellBlank} />
            <td className={styles.cellNo}>NO.{noLabel}</td>
            <td colSpan={7} className={styles.cellBlank} />
          </tr>

          <tr>
            <td className={styles.cellBlank} />
            <td colSpan={4} className={styles.cellHeader}>
              반입사진
            </td>
            <td colSpan={4} className={styles.cellHeader}>
              현장 설치 사진
            </td>
          </tr>

          <tr>
            <td className={styles.cellBlank} />
            <td colSpan={4} className={styles.cellPhoto}>
              <PhotoGrid
                kind="incoming"
                slotCount={incomingLen}
                photos={item.photos}
              />
            </td>
            <td colSpan={4} className={styles.cellPhoto}>
              <PhotoGrid
                kind="install"
                slotCount={installLen}
                photos={item.photos}
              />
            </td>
          </tr>

          <tr>
            <td className={styles.cellBlank} />
            <td className={styles.cellLabel}>날짜</td>
            <td colSpan={3} className={styles.cellValue}>
              {item.date || "—"}
            </td>
            <td className={styles.cellLabel}>날짜</td>
            <td colSpan={3} className={styles.cellValue}>
              {item.date || "—"}
            </td>
          </tr>

          <tr>
            <td className={styles.cellBlank} />
            <td className={styles.cellLabel}>항목</td>
            <td colSpan={3} className={styles.cellValue}>
              {item.itemName || "—"}
            </td>
            <td className={styles.cellLabel}>항목</td>
            <td colSpan={3} className={styles.cellValue}>
              {item.itemName || "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
