"use client";

import type { BlockPhoto, OnSlotClick, OnPhotoDelete } from "./types";
import styles from "./photo-sheet.module.css";

type Props = {
  blockId:       string;
  side:          "left" | "right";
  photos:        BlockPhoto[];          // 이 side에 해당하는 사진만
  readOnly?:     boolean;               // 미리보기/출력 시 true
  onSlotClick?:  OnSlotClick;
  onPhotoDelete?: OnPhotoDelete;
};

// 사진 수에 따른 그리드 레이아웃 클래스
const GRID_CLASS: Record<number, string> = {
  0: "grid0",
  1: "grid1",
  2: "grid2",
  3: "grid3",
  4: "grid4",
};

export default function PhotoGrid({
  blockId, side, photos, readOnly, onSlotClick, onPhotoDelete,
}: Props) {
  const count = photos.length;
  const gridClass = GRID_CLASS[Math.min(count, 4)] ?? "grid4";

  // 편집 모드: 4슬롯 항상 렌더 (채워진 것 + 빈 것)
  // 읽기 모드: 사진 있는 것만 렌더
  if (readOnly) {
    if (!count) return (
      <div className={`${styles.photoGrid} ${styles[gridClass]}`}>
        <div className={styles.emptySlotPrint} />
      </div>
    );
    return (
      <div className={`${styles.photoGrid} ${styles[gridClass]}`}>
        {photos
          .sort((a, b) => a.slot_index - b.slot_index)
          .map((p) => (
            <div key={p.id} className={styles.photoCell}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className={styles.photoImg} />
            </div>
          ))}
      </div>
    );
  }

  // 편집 모드: 슬롯 0~3 렌더
  const slots = Array.from({ length: 4 }, (_, i) => ({
    index: i,
    photo: photos.find(p => p.slot_index === i) ?? null,
  }));

  // 편집 모드는 항상 4슬롯 표시 → grid4(2×2) 고정
  const editGridClass = "grid4";
  const slotsToShow = slots;

  return (
    <div className={`${styles.photoGrid} ${styles[editGridClass]}`}>
      {slotsToShow.map(({ index, photo }) =>
        photo ? (
          <div key={index} className={styles.photoCell}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={`사진 ${index + 1}`}
              className={styles.photoImg}
            />
            {onPhotoDelete && (
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onPhotoDelete(photo.id, blockId, side, index);
                }}
                aria-label="사진 삭제"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <button
            key={index}
            type="button"
            className={styles.emptySlot}
            onClick={() => onSlotClick?.(blockId, side, index)}
            aria-label={`${side === "left" ? "반입" : "지급"} 사진 ${index + 1} 추가`}
          >
            <span className={styles.addIcon}>+</span>
            <span className={styles.addLabel}>사진 추가</span>
          </button>
        )
      )}
    </div>
  );
}
