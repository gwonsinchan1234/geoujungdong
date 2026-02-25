"use client";

import { useState, useRef } from "react";
import type { PhotoBlock, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "./types";
import PhotoGrid from "./PhotoGrid";
import styles from "./photo-sheet.module.css";

type Props = {
  block:          PhotoBlock;
  readOnly?:      boolean;
  onSlotClick?:   OnSlotClick;
  onPhotoDelete?: OnPhotoDelete;
  onMetaUpdate?:  OnMetaUpdate;
};

type EditField = "left_date" | "right_date" | "left_label" | "right_label";

export default function PhotoBlockCard({
  block, readOnly, onSlotClick, onPhotoDelete, onMetaUpdate,
}: Props) {
  const leftPhotos  = block.photos.filter(p => p.side === "left");
  const rightPhotos = block.photos.filter(p => p.side === "right");

  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [editValue,    setEditValue]    = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const canEdit = !readOnly && !!onMetaUpdate;

  function startEdit(field: EditField) {
    if (!canEdit) return;
    setEditingField(field);
    setEditValue(block[field] ?? "");
    // autoFocus is on the input, but we do a safety setTimeout for iOS
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function commit() {
    if (!editingField || !onMetaUpdate) return;
    const trimmed = editValue.trim();
    if (trimmed !== (block[editingField] ?? "").trim()) {
      onMetaUpdate(block.id, { [editingField]: trimmed });
    }
    setEditingField(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setEditingField(null); }
  }

  /** 편집 가능한 값 셀 렌더링 */
  function renderField(field: EditField, value: string) {
    if (editingField === field) {
      return (
        <input
          ref={inputRef}
          className={styles.footerInput}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      );
    }
    return (
      <span
        className={`${styles.footerValue} ${canEdit ? styles.footerEditable : ""}`}
        onClick={() => startEdit(field)}
      >
        {value || <span className={styles.footerPlaceholder}>-</span>}
      </span>
    );
  }

  return (
    <div className={styles.blockCard}>

      {/* ── NO.XX 헤더 ── */}
      <div className={styles.blockHeader}>
        <span className={styles.blockNo}>NO.{block.no}</span>
      </div>

      {/* ── 섹션 헤더 (반입사진 | 지급/설치사진) ── */}
      <div className={styles.sectionHeaders}>
        <div className={styles.sectionHeader}>반입사진</div>
        <div className={styles.sectionHeader}>{block.right_header}</div>
      </div>

      {/* ── 사진 그리드 ── */}
      <div className={styles.gridsRow}>
        <div className={styles.gridWrap}>
          <PhotoGrid
            blockId={block.id}
            side="left"
            photos={leftPhotos}
            readOnly={readOnly}
            onSlotClick={onSlotClick}
            onPhotoDelete={onPhotoDelete}
          />
        </div>
        <div className={styles.gridDivider} />
        <div className={styles.gridWrap}>
          <PhotoGrid
            blockId={block.id}
            side="right"
            photos={rightPhotos}
            readOnly={readOnly}
            onSlotClick={onSlotClick}
            onPhotoDelete={onPhotoDelete}
          />
        </div>
      </div>

      {/* ── 하단 날짜 + 항목 라벨 ── */}
      <div className={styles.blockFooter}>
        <div className={styles.footerSide}>
          <span className={styles.footerLabel}>날짜</span>
          {renderField("left_date", block.left_date)}
          <span className={styles.footerLabel}>항목</span>
          {renderField("left_label", block.left_label)}
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerSide}>
          <span className={styles.footerLabel}>날짜</span>
          {renderField("right_date", block.right_date)}
          <span className={styles.footerLabel}>항목</span>
          {renderField("right_label", block.right_label)}
        </div>
      </div>

    </div>
  );
}
