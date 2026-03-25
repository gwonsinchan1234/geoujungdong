"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PhotoBlock, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "./types";
import PhotoGrid from "./PhotoGrid";
import LayoutPicker from "./LayoutPicker";
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

/** 다양한 날짜 형식 → YYYY-MM-DD */
function toInputDate(v: string): string {
  if (!v) return "";
  const m = v.replace(/\s/g, "").match(/(\d{4})[.\-/년](\d{1,2})[.\-/월](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return "";
}
/** YYYY-MM-DD → YYYY.MM.DD */
function fromInputDate(v: string): string {
  if (!v) return "";
  return v.replace(/-/g, ".");
}

// ── 커스텀 라벨 드롭다운 ───────────────────────────────────────
function LabelSelect({ value, options, onChange }: {
  value:    string;
  options:  string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => activeRef.current?.scrollIntoView({ block: "nearest" }), 30);
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.labelSelectWrap}>
      <button type="button" className={styles.labelSelectTrigger} onClick={() => setOpen(o => !o)}>
        <span className={styles.labelSelectTriggerText}>{value || "-"}</span>
        <span className={`${styles.labelSelectArrow} ${open ? styles.labelSelectArrowOpen : ""}`}>▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className={styles.labelSelectMenu}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}>
            {options.map(opt => {
              const isActive = opt === value;
              return (
                <button key={opt} ref={isActive ? activeRef : undefined}
                  type="button"
                  className={`${styles.labelSelectOption} ${isActive ? styles.labelSelectOptionActive : ""}`}
                  onClick={() => { onChange(opt); setOpen(false); }}>
                  <span className={styles.labelSelectCheck}>{isActive ? "✓" : ""}</span>
                  <span className={styles.labelSelectOptionText}>{opt}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── PhotoBlockCard ─────────────────────────────────────────────
export default function PhotoBlockCard({
  block, readOnly, availableLabels, onSlotClick, onPhotoDelete, onMetaUpdate,
}: Props) {
  const leftPhotos  = block.photos.filter(p => p.side === "left");
  const rightPhotos = block.photos.filter(p => p.side === "right");

  const canEdit    = !readOnly && !!onMetaUpdate;
  const leftLayout  = block.left_layout  ?? "auto";
  const rightLayout = block.right_layout ?? "auto";

  /** 날짜 필드 */
  function renderField(field: EditField, value: string) {
    if (!canEdit) {
      return (
        <span className={styles.footerValue}>
          {value || <span className={styles.footerPlaceholder}>-</span>}
        </span>
      );
    }
    return (
      <input
        type="date"
        className={styles.footerDateInput}
        value={toInputDate(value)}
        onChange={e => onMetaUpdate?.(block.id, { [field]: fromInputDate(e.target.value) })}
        aria-label={field.includes("left") ? "반입 날짜" : "지급 날짜"}
      />
    );
  }

  /** 항목 라벨 */
  function renderLabelField(field: "left_label" | "right_label", value: string) {
    if (!canEdit) {
      return <span className={styles.footerValue}>{value || <span className={styles.footerPlaceholder}>-</span>}</span>;
    }
    if (availableLabels && availableLabels.length > 0) {
      const options = availableLabels.includes(value)
        ? availableLabels
        : value ? [value, ...availableLabels] : availableLabels;
      return (
        <LabelSelect value={value} options={options}
          onChange={v => onMetaUpdate?.(block.id, { [field]: v })} />
      );
    }
    return renderField(field, value);
  }

  return (
    <motion.div className={styles.blockCard}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>

      {/* NO.XX 헤더 */}
      <div className={styles.blockHeader}>
        <span className={styles.blockNo}>NO.{block.no}</span>
      </div>

      {/* 섹션 헤더 */}
      <div className={styles.sectionHeaders}>
        <div className={styles.sectionHeader}>반입사진</div>
        <div className={styles.gridDivider} />
        <div className={styles.sectionHeader}>{block.right_header}</div>
      </div>

      {/* 레이아웃 선택기 (편집 모드만) */}
      {canEdit && (
        <div className={styles.layoutPickerRow}>
          <div className={styles.layoutPickerSide}>
            <LayoutPicker layout={leftLayout}
              onChange={v => onMetaUpdate?.(block.id, { left_layout: v })} />
          </div>
          <div className={styles.layoutPickerDivider} />
          <div className={styles.layoutPickerSide}>
            <LayoutPicker layout={rightLayout}
              onChange={v => onMetaUpdate?.(block.id, { right_layout: v })} />
          </div>
        </div>
      )}

      {/* 사진 그리드 */}
      <div className={styles.gridsRow}>
        <div className={styles.gridWrap}>
          <PhotoGrid blockId={block.id} side="left" photos={leftPhotos}
            readOnly={readOnly} layout={leftLayout}
            onSlotClick={onSlotClick} onPhotoDelete={onPhotoDelete} />
        </div>
        <div className={styles.gridDivider} />
        <div className={styles.gridWrap}>
          <PhotoGrid blockId={block.id} side="right" photos={rightPhotos}
            readOnly={readOnly} layout={rightLayout}
            onSlotClick={onSlotClick} onPhotoDelete={onPhotoDelete} />
        </div>
      </div>

      {/* 하단 날짜 + 항목 */}
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

    </motion.div>
  );
}
