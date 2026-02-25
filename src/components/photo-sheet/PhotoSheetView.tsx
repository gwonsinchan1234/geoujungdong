"use client";

import type { PhotoBlock, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "./types";
import PhotoBlockCard from "./PhotoBlockCard";
import styles from "./photo-sheet.module.css";

type Props = {
  sheetName:      string;
  blocks:         PhotoBlock[];
  readOnly?:      boolean;
  onSlotClick?:   OnSlotClick;
  onPhotoDelete?: OnPhotoDelete;
  onMetaUpdate?:  OnMetaUpdate;
};

export default function PhotoSheetView({
  sheetName, blocks, readOnly, onSlotClick, onPhotoDelete, onMetaUpdate,
}: Props) {
  if (!blocks.length) {
    return (
      <div className={styles.emptySheet}>
        <p>블록이 없습니다.</p>
      </div>
    );
  }

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
