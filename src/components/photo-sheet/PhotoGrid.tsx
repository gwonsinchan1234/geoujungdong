"use client";

import type { BlockPhoto, OnSlotClick, OnPhotoDelete, PhotoLayout } from "./types";
import styles from "./photo-sheet.module.css";

type Props = {
  blockId:        string;
  side:           "left" | "right";
  photos:         BlockPhoto[];
  readOnly?:      boolean;
  layout?:        PhotoLayout;
  onSlotClick?:   OnSlotClick;
  onPhotoDelete?: OnPhotoDelete;
};

// auto 레이아웃: 사진 수에 따른 기본 그리드 클래스
const AUTO_GRID: Record<number, string> = {
  0: "grid0", 1: "grid1", 2: "grid2", 3: "grid3", 4: "grid4",
};

// 레이아웃 프리셋 → CSS 클래스 + 슬롯 수
const LAYOUT_DEF: Record<Exclude<PhotoLayout, "auto">, { cssClass: string; slots: number }> = {
  "2a": { cssClass: "grid2",  slots: 2 },
  "2b": { cssClass: "grid2b", slots: 2 },
  "3a": { cssClass: "grid3",  slots: 3 },
  "3b": { cssClass: "grid3b", slots: 3 },
  "3c": { cssClass: "grid3c", slots: 3 },
  "4a": { cssClass: "grid4",  slots: 4 },
  "4b": { cssClass: "grid4b", slots: 4 },
  "4c": { cssClass: "grid4c", slots: 4 },
};

export default function PhotoGrid({
  blockId, side, photos, readOnly, layout = "auto", onSlotClick, onPhotoDelete,
}: Props) {
  const count = photos.length;
  const def   = layout !== "auto" ? LAYOUT_DEF[layout] : null;

  // slot_index 순 정렬
  const sorted = [...photos].sort((a, b) => a.slot_index - b.slot_index).slice(0, 4);

  // 다음 빈 슬롯 인덱스 (추가 버튼용)
  const used = new Set(sorted.map(p => p.slot_index));
  const nextEmpty = [0, 1, 2, 3].find(i => !used.has(i)) ?? count;

  // ── 읽기 모드 ─────────────────────────────────────────────────
  if (readOnly) {
    if (!def && count === 0) {
      return (
        <div className={`${styles.photoGrid} ${styles.grid4}`}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={styles.photoCell}>
              <div className={styles.emptySlotPrint} />
            </div>
          ))}
        </div>
      );
    }
    // 미리보기/출력은 항상 "실제 사진 수" 기준으로 동일 렌더링:
    // 1장=1칸 꽉참, 2장=2칸 꽉참, 3장=3칸, 4장=4칸
    const totalSlots = Math.min(Math.max(count, 1), 4);
    const cssClass   = AUTO_GRID[Math.min(count, 4)] ?? "grid4";
    return (
      <div className={`${styles.photoGrid} ${styles[cssClass]}`}>
        {Array.from({ length: totalSlots }, (_, i) => {
          const photo = sorted[i] ?? null;
          return (
            <div key={i} className={styles.photoCell}>
              {photo?.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={photo.url} alt="" className={styles.photoImg}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
              ) : (
                <div className={styles.emptySlotPrint} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── 편집 모드 ─────────────────────────────────────────────────
  const totalEdit = def ? def.slots : Math.min(count + 1, 4);
  const editClass  = def ? def.cssClass : (AUTO_GRID[Math.min(Math.max(totalEdit, 1), 4)] ?? "grid4");

  return (
    <div className={`${styles.photoGrid} ${styles[editClass]}`}>
      {Array.from({ length: totalEdit }, (_, i) => {
        const photo = sorted[i] ?? null;

        const emptySlotIdx = (() => {
          let cnt = 0;
          for (let s = 0; s <= 3; s++) {
            if (!used.has(s)) {
              if (cnt === i - count) return s;
              cnt++;
            }
          }
          return nextEmpty;
        })();

        return photo ? (
          <div key={i} className={styles.photoCell}>
            {photo.url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photo.url} alt={`사진 ${i + 1}`} className={styles.photoImg}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
            ) : (
              <div className={styles.photoImgPlaceholder} aria-hidden />
            )}
            {onPhotoDelete && (
              <button type="button" className={styles.deleteBtn}
                onClick={(e) => { e.stopPropagation(); onPhotoDelete(photo.id, blockId, side, photo.slot_index); }}
                aria-label="사진 삭제">✕</button>
            )}
          </div>
        ) : (
          <button key={`add-${i}`} type="button" className={styles.emptySlot}
            onClick={() => onSlotClick?.(blockId, side, i < count ? emptySlotIdx : nextEmpty)}
            aria-label={`${side === "left" ? "반입" : "지급"} 사진 추가`}>
            <svg className={styles.addIcon} width="26" height="26" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span className={styles.addLabel}>사진 추가</span>
          </button>
        );
      })}
    </div>
  );
}
