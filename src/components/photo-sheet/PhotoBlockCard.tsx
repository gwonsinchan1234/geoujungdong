"use client";

import { useState, useRef, useEffect } from "react";
import type { PhotoBlock, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "./types";
import PhotoGrid from "./PhotoGrid";
import styles from "./photo-sheet.module.css";

type Props = {
  block:            PhotoBlock;
  readOnly?:        boolean;
  availableLabels?: string[];
  onSlotClick?:     OnSlotClick;
  onPhotoDelete?:   OnPhotoDelete;
  onMetaUpdate?:    OnMetaUpdate;
};

type EditField = "left_date" | "right_date" | "left_label" | "right_label";

// ── 커스텀 라벨 드롭다운 ───────────────────────────────────────
function LabelSelect({ value, options, onChange }: {
  value:   string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // 열릴 때 현재 항목으로 스크롤
  useEffect(() => {
    if (open) {
      setTimeout(() => activeRef.current?.scrollIntoView({ block: "nearest" }), 30);
    }
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.labelSelectWrap}>
      <button
        type="button"
        className={styles.labelSelectTrigger}
        onClick={() => setOpen(o => !o)}
      >
        <span className={styles.labelSelectTriggerText}>{value || "-"}</span>
        <span className={`${styles.labelSelectArrow} ${open ? styles.labelSelectArrowOpen : ""}`}>▾</span>
      </button>

      {open && (
        <div className={styles.labelSelectMenu}>
          {options.map(opt => {
            const isActive = opt === value;
            return (
              <button
                key={opt}
                ref={isActive ? activeRef : undefined}
                type="button"
                className={`${styles.labelSelectOption} ${isActive ? styles.labelSelectOptionActive : ""}`}
                onClick={() => { onChange(opt); setOpen(false); }}
              >
                <span className={styles.labelSelectCheck}>{isActive ? "✓" : ""}</span>
                <span className={styles.labelSelectOptionText}>{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PhotoBlockCard ─────────────────────────────────────────────
export default function PhotoBlockCard({
  block, readOnly, availableLabels, onSlotClick, onPhotoDelete, onMetaUpdate,
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

  /** 날짜 등 일반 텍스트 편집 */
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

  /** 항목 라벨 — availableLabels 있으면 커스텀 드롭다운, 없으면 텍스트 입력 */
  function renderLabelField(field: "left_label" | "right_label", value: string) {
    if (!canEdit) {
      return <span className={styles.footerValue}>{value || <span className={styles.footerPlaceholder}>-</span>}</span>;
    }
    if (availableLabels && availableLabels.length > 0) {
      const options = availableLabels.includes(value)
        ? availableLabels
        : value ? [value, ...availableLabels] : availableLabels;
      return (
        <LabelSelect
          value={value}
          options={options}
          onChange={v => onMetaUpdate?.(block.id, { [field]: v })}
        />
      );
    }
    return renderField(field, value);
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
          {renderLabelField("left_label", block.left_label)}
        </div>
        <div className={styles.footerDivider} />
        <div className={styles.footerSide}>
          <span className={styles.footerLabel}>날짜</span>
          {renderField("right_date", block.right_date)}
          <span className={styles.footerLabel}>항목</span>
          {renderLabelField("right_label", block.right_label)}
        </div>
      </div>

    </div>
  );
}
