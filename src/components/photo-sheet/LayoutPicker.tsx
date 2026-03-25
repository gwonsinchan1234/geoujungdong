"use client";

import type { PhotoLayout } from "./types";
import styles from "./photo-sheet.module.css";

const LAYOUT_OPTIONS: Array<{
  id: PhotoLayout;
  label: string;
  vb: string;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
}> = [
  // ── 2장 ──
  { id: "2a", label: "좌·우", vb: "0 0 28 20",
    rects: [{ x: 0, y: 0, w: 12, h: 20 }, { x: 16, y: 0, w: 12, h: 20 }] },
  { id: "2b", label: "상·하", vb: "0 0 28 20",
    rects: [{ x: 0, y: 0, w: 28, h: 9 }, { x: 0, y: 11, w: 28, h: 9 }] },
  // ── 3장 ──
  { id: "3a", label: "2+1", vb: "0 0 28 20",
    rects: [{ x: 0, y: 0, w: 12, h: 9 }, { x: 16, y: 0, w: 12, h: 9 }, { x: 0, y: 11, w: 28, h: 9 }] },
  { id: "3b", label: "세로+2", vb: "0 0 28 20",
    rects: [{ x: 0, y: 0, w: 12, h: 20 }, { x: 16, y: 0, w: 12, h: 9 }, { x: 16, y: 11, w: 12, h: 9 }] },
  { id: "3c", label: "1+2", vb: "0 0 28 20",
    rects: [{ x: 0, y: 0, w: 28, h: 9 }, { x: 0, y: 11, w: 12, h: 9 }, { x: 16, y: 11, w: 12, h: 9 }] },
  // ── 4장 ──
  { id: "4a", label: "2×2", vb: "0 0 28 20",
    rects: [{ x: 0, y: 0, w: 12, h: 9 }, { x: 16, y: 0, w: 12, h: 9 }, { x: 0, y: 11, w: 12, h: 9 }, { x: 16, y: 11, w: 12, h: 9 }] },
  { id: "4b", label: "세로+3", vb: "0 0 28 28",
    rects: [{ x: 0, y: 0, w: 12, h: 28 }, { x: 16, y: 0, w: 12, h: 7 }, { x: 16, y: 10, w: 12, h: 7 }, { x: 16, y: 21, w: 12, h: 7 }] },
  { id: "4c", label: "1+3", vb: "0 0 40 20",
    rects: [{ x: 0, y: 0, w: 40, h: 9 }, { x: 0, y: 11, w: 11, h: 9 }, { x: 14, y: 11, w: 11, h: 9 }, { x: 28, y: 11, w: 12, h: 9 }] },
];

type Props = {
  layout?: PhotoLayout;
  onChange: (layout: PhotoLayout) => void;
};

export default function LayoutPicker({ layout = "auto", onChange }: Props) {
  return (
    <div className={styles.layoutPicker}>
      {LAYOUT_OPTIONS.map(opt => {
        const isActive = layout === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className={`${styles.layoutBtn} ${isActive ? styles.layoutBtnActive : ""}`}
            onClick={() => onChange(isActive ? "auto" : opt.id)}
            title={opt.label}
            aria-label={`레이아웃 ${opt.label}`}
            aria-pressed={isActive}
          >
            <svg viewBox={opt.vb} fill="currentColor" style={{ width: "100%", height: "100%" }}>
              {opt.rects.map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="1.5" />
              ))}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
