"use client";

import type { PhotoBlock, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "./types";
import PhotoBlockCard from "./PhotoBlockCard";
import styles from "./photo-sheet.module.css";

type Props = {
  sheetName:      string;
  blocks:         PhotoBlock[];
  readOnly?:      boolean;
  a4Mode?:        boolean;   // 인쇄 미리보기 — A4 페이지 단위로 렌더
  onSlotClick?:   OnSlotClick;
  onPhotoDelete?: OnPhotoDelete;
  onMetaUpdate?:  OnMetaUpdate;
};

// 배열을 n개씩 묶음
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function PhotoSheetView({
  sheetName, blocks, readOnly, a4Mode,
  onSlotClick, onPhotoDelete, onMetaUpdate,
}: Props) {
  if (!blocks.length) {
    return (
      <div className={styles.emptySheet}>
        <p>블록이 없습니다.</p>
      </div>
    );
  }

  // ── A4 미리보기 모드: 2블록씩 A4 페이지로 분리 ──
  if (a4Mode) {
    const pages = chunk(blocks, 3);
    return (
      <div className={styles.sheetView}>
        {pages.map((pageBlocks, pi) => (
          <div key={pi} className={styles.a4PageWrap}>
            <div className={styles.a4PageTitle}>{sheetName}</div>
            {pageBlocks.map((block) => (
              <div key={block.id} className={styles.a4Block}>
                <PhotoBlockCard
                  block={block}
                  readOnly
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── 일반 모드 (모바일 편집) ──
  return (
    <div className={styles.sheetView}>
      <div className={styles.sheetTitle}>{sheetName}</div>
      <div className={styles.blockList}>
        {blocks.map((block) => (
          <PhotoBlockCard
            key={block.id}
            block={block}
            readOnly={readOnly}
            onSlotClick={onSlotClick}
            onPhotoDelete={onPhotoDelete}
            onMetaUpdate={onMetaUpdate}
          />
        ))}
      </div>
    </div>
  );
}
