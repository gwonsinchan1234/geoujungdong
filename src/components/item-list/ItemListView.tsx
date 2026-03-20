"use client";

// 항목별세부내역 카드 리스트
// 갑지와 동일한 UX 흐름:
//   • 요약바(상단 고정) → 카테고리 섹션 → 카드 → 바텀시트 편집
// 카드 구성: NO / 사용일자(인라인) / 품명·단위 / 수량·단가·금액 / 수정·삭제

import React, { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { ItemData } from "./types";
import {
  CATEGORY_LABELS, CATEGORY_SHORT, UNIT_SUGGESTIONS,
  makeNewItem, fmtNum, parseNum, calcAmount,
} from "./types";
import styles from "./item-list.module.css";

// ── 숫자 인라인 입력 (포커스 시 raw, blur 시 포맷) ─────────────────
function useInlineNum(value: number, onChange: (v: string) => void) {
  const [editing, setEditing] = React.useState(false);
  const [raw, setRaw]         = React.useState("");
  return {
    value:    editing ? raw : (value || ""),
    onFocus:  () => { setEditing(true); setRaw(value ? String(value) : ""); },
    onBlur:   (e: React.FocusEvent<HTMLInputElement>) => { setEditing(false); onChange(e.target.value); },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setRaw(e.target.value),
  };
}

// ══════════════════════════════════════════════════════════════════════
// 항목 편집 폼 (바텀시트 내부)
// ══════════════════════════════════════════════════════════════════════
function ItemEditForm({
  item, onSave, onCancel,
}: {
  item: ItemData;
  onSave: (item: ItemData) => void;
  onCancel: () => void;
}) {
  const isNew = !item.evidenceNo && item.name === "";
  const [local, setLocal] = useState<ItemData>({ ...item });

  const setF = <K extends keyof ItemData>(key: K, val: ItemData[K]) => {
    setLocal(prev => {
      const next = { ...prev, [key]: val };
      if (key === "quantity" || key === "unitPrice") {
        next.amount = calcAmount(next.quantity, next.unitPrice);
      }
      return next;
    });
  };

  return (
    <div className={styles.editForm}>
      <div className={styles.editFormHeader}>
        <h3>{isNew ? "항목 추가" : "항목 수정"}</h3>
        <button className={styles.editFormClose} onClick={onCancel} aria-label="닫기">✕</button>
      </div>

      <div className={styles.editFormBody}>

        {/* 카테고리 */}
        <div className={styles.editField}>
          <label>카테고리</label>
          <select
            className={styles.editSelect}
            value={local.categoryNo}
            onChange={e => setF("categoryNo", parseInt(e.target.value))}
          >
            {Object.entries(CATEGORY_LABELS).map(([no, label]) => (
              <option key={no} value={no}>{no}. {label}</option>
            ))}
          </select>
        </div>

        {/* 사용일자 */}
        <div className={styles.editField}>
          <label>사용일자</label>
          <input
            className={styles.editInput} type="text"
            value={local.usageDate} placeholder="예: 26.01.15"
            onChange={e => setF("usageDate", e.target.value)}
          />
        </div>

        {/* 품명 */}
        <div className={styles.editField}>
          <label>품명</label>
          <input
            className={styles.editInput} type="text"
            value={local.name} placeholder="품명 입력"
            onChange={e => setF("name", e.target.value)}
          />
        </div>

        {/* 수량 + 단위 */}
        <div className={`${styles.editField} ${styles.editFieldRow}`}>
          <div className={styles.editFieldHalf}>
            <label>수량</label>
            <input
              className={styles.editInput} type="number" min="0"
              value={local.quantity || ""}
              placeholder="0"
              onChange={e => setF("quantity", parseNum(e.target.value))}
            />
          </div>
          <div className={styles.editFieldHalf}>
            <label>단위 / 규격</label>
            <input
              className={styles.editInput} type="text"
              value={local.unit} placeholder="식"
              list="itemUnitList"
              onChange={e => setF("unit", e.target.value)}
            />
            <datalist id="itemUnitList">
              {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
            </datalist>
          </div>
        </div>

        {/* 단가 */}
        <div className={styles.editField}>
          <label>단가</label>
          <div className={styles.editInputRow}>
            <input
              className={styles.editInput} type="text" inputMode="numeric"
              value={local.unitPrice ? fmtNum(local.unitPrice) : ""}
              placeholder="0"
              onChange={e => setF("unitPrice", parseNum(e.target.value))}
            />
            <span className={styles.editUnit}>원</span>
          </div>
        </div>

        {/* 금액 (자동계산, 수동 수정 가능) */}
        <div className={styles.editField}>
          <label>금액 <span className={styles.autoLabel}>수량×단가 자동</span></label>
          <div className={styles.editInputRow}>
            <input
              className={`${styles.editInput} ${styles.editInputAuto}`}
              type="text" inputMode="numeric"
              value={local.amount ? fmtNum(local.amount) : ""}
              placeholder="수량 × 단가"
              onChange={e => setLocal(prev => ({ ...prev, amount: parseNum(e.target.value) }))}
            />
            <span className={styles.editUnit}>원</span>
          </div>
        </div>

        {/* 비고 */}
        <div className={styles.editField}>
          <label>비고</label>
          <input
            className={styles.editInput} type="text"
            value={local.note} placeholder="선택사항"
            onChange={e => setF("note", e.target.value)}
          />
        </div>

        {/* 사진대지 포함 토글 */}
        <div className={`${styles.editField} ${styles.editFieldToggle}`}>
          <label>사진대지 포함</label>
          <button
            type="button"
            className={`${styles.toggle} ${local.hasPhoto ? styles.toggleOn : ""}`}
            onClick={() => setF("hasPhoto", !local.hasPhoto)}
          >
            {local.hasPhoto ? "📷 포함" : "제외"}
          </button>
        </div>

      </div>

      <div className={styles.editFormActions}>
        <button className={styles.editCancel} onClick={onCancel}>취소</button>
        <button
          className={styles.editSave}
          onClick={() => onSave(local)}
          disabled={!local.name.trim()}
        >
          저장
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 항목 카드
// ══════════════════════════════════════════════════════════════════════
function ItemCard({
  item, idx, deletingId,
  onEdit, onDelete, onCancelDelete, onStartDelete, onInlineChange,
}: {
  item: ItemData;
  idx: number;
  deletingId: string | null;
  onEdit: (item: ItemData) => void;
  onDelete: (id: string) => void;
  onCancelDelete: () => void;
  onStartDelete: (id: string) => void;
  onInlineChange: (id: string, field: keyof ItemData, raw: string) => void;
}) {
  const qtyProps       = useInlineNum(item.quantity,  v => onInlineChange(item.id, "quantity",  v));
  const unitPriceProps = useInlineNum(item.unitPrice, v => onInlineChange(item.id, "unitPrice", v));
  const amountProps    = useInlineNum(item.amount,    v => onInlineChange(item.id, "amount",    v));

  return (
    <div
      className={styles.itemCard}
      style={{ animationDelay: `${idx * 0.03}s` } as React.CSSProperties}
    >
      {/* ── 상단: NO / 날짜 / 배지 ─────────────────────────── */}
      <div className={styles.cardTop}>
        <span className={styles.itemEvNo}>
          {item.evidenceNo || `NO.${idx + 1}`}
        </span>
        <input
          className={styles.cardDateInput}
          value={item.usageDate}
          placeholder="YY.MM.DD"
          onChange={e => onInlineChange(item.id, "usageDate", e.target.value)}
        />
        <div className={styles.cardBadges}>
          {item.hasPhoto && <span className={styles.photoBadge}>📷</span>}
          {item.note     && <span className={styles.noteBadge}>📝</span>}
        </div>
      </div>

      {/* ── 품명 + 단위/규격 ────────────────────────────────── */}
      <div className={styles.nameRow}>
        <span className={styles.itemName}>
          {item.name || <em className={styles.namePlaceholder}>품명 없음</em>}
        </span>
        {item.unit && (
          <span className={styles.itemUnit}>{item.unit}</span>
        )}
      </div>

      {/* ── 수량 / 단가 / 금액 인라인 ───────────────────────── */}
      <div className={styles.inlineFields}>
        <div className={styles.inlineField}>
          <span className={styles.inlineLabel}>수량</span>
          <input
            className={styles.inlineInput}
            inputMode="numeric"
            placeholder="0"
            {...qtyProps}
          />
        </div>
        <div className={styles.inlineField}>
          <span className={styles.inlineLabel}>단가</span>
          <input
            className={`${styles.inlineInput} ${styles.inlineInputAmt}`}
            inputMode="numeric"
            placeholder="0"
            {...unitPriceProps}
          />
        </div>
        <div className={styles.inlineField}>
          <span className={styles.inlineLabel}>금액</span>
          <input
            className={`${styles.inlineInput} ${styles.inlineInputAmt}`}
            inputMode="numeric"
            placeholder="0"
            {...amountProps}
          />
        </div>
      </div>

      {/* ── 액션: 수정(좌) / 삭제(우) ───────────────────────── */}
      <div className={styles.itemActions}>
        <button className={styles.itemEditBtn} onClick={() => onEdit(item)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          수정
        </button>

        {deletingId === item.id ? (
          <div className={styles.deleteConfirm}>
            <button className={styles.deleteConfirmNo}  onClick={onCancelDelete}>취소</button>
            <button className={styles.deleteConfirmYes} onClick={() => onDelete(item.id)}>삭제 확인</button>
          </div>
        ) : (
          <button className={styles.itemDeleteBtn} onClick={() => onStartDelete(item.id)}>
            삭제
          </button>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════════════
interface Props {
  items: ItemData[];
  onChange: (items: ItemData[]) => void;
}

export default function ItemListView({ items, onChange }: Props) {
  const [editingItem, setEditingItem] = useState<ItemData | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  // 카테고리별 그룹핑 (1~9)
  const grouped = useMemo(() => {
    const map = new Map<number, ItemData[]>();
    for (let i = 1; i <= 9; i++) map.set(i, []);
    for (const item of items) map.get(item.categoryNo)?.push(item);
    return map;
  }, [items]);

  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);

  const handleAdd  = useCallback((catNo: number) => setEditingItem(makeNewItem(catNo)), []);
  const handleEdit = useCallback((item: ItemData)  => setEditingItem({ ...item }), []);

  const handleSave = useCallback((saved: ItemData) => {
    const exists = items.some(i => i.id === saved.id);
    onChange(exists
      ? items.map(i => i.id === saved.id ? saved : i)
      : [...items, saved]
    );
    setEditingItem(null);
  }, [items, onChange]);

  const handleDelete = useCallback((id: string) => {
    onChange(items.filter(i => i.id !== id));
    setDeletingId(null);
  }, [items, onChange]);

  const handleInlineChange = useCallback((id: string, field: keyof ItemData, raw: string) => {
    onChange(items.map(it => {
      if (it.id !== id) return it;
      if (field === "usageDate") return { ...it, usageDate: raw };
      const num = parseNum(raw);
      if (field === "quantity") {
        const qty = isNaN(num) ? it.quantity : num;
        return { ...it, quantity: qty, amount: calcAmount(qty, it.unitPrice) };
      }
      if (field === "unitPrice") {
        const up = isNaN(num) ? it.unitPrice : num;
        return { ...it, unitPrice: up, amount: calcAmount(it.quantity, up) };
      }
      if (field === "amount") {
        return { ...it, amount: isNaN(num) ? it.amount : num };
      }
      return it;
    }));
  }, [items, onChange]);

  return (
    <div className={styles.listView}>

      {/* ── 전체 요약바 (sticky) ──────────────────────────── */}
      <div className={styles.summaryBar}>
        <span className={styles.summaryLabel}>총 {items.length}건</span>
        <span className={styles.summaryTotal}>{fmtNum(total)}원</span>
      </div>

      {/* ── 카테고리별 섹션 ──────────────────────────────── */}
      {Array.from(grouped.entries()).map(([catNo, catItems]) => {
        const catSum = catItems.reduce((s, i) => s + i.amount, 0);
        return (
          <section
            key={catNo}
            className={`${styles.catGroup} ${catItems.length === 0 ? styles.catGroupEmpty : ""}`}
          >
            {/* 카테고리 헤더 (sticky) */}
            <div className={styles.catHeader}>
              <span className={styles.catNo}>{catNo}</span>
              <span className={styles.catLabel}>{CATEGORY_SHORT[catNo]}</span>
              {catSum > 0 && (
                <span className={styles.catTotal}>{fmtNum(catSum)}원</span>
              )}
              <span className={styles.catCount}>{catItems.length}건</span>
            </div>

            {/* 항목 카드들 */}
            {catItems.map((item, idx) => (
              <ItemCard
                key={item.id}
                item={item}
                idx={idx}
                deletingId={deletingId}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCancelDelete={() => setDeletingId(null)}
                onStartDelete={setDeletingId}
                onInlineChange={handleInlineChange}
              />
            ))}

            {/* 항목 추가 */}
            <button className={styles.addItemBtn} onClick={() => handleAdd(catNo)}>
              <span className={styles.addItemIcon}>+</span>
              항목 추가
            </button>
          </section>
        );
      })}

      {/* ── 편집 바텀시트 (portal → body) ────────────────── */}
      {editingItem && typeof document !== "undefined" && createPortal(
        <>
          <div className={styles.editBackdrop} onClick={() => setEditingItem(null)} />
          <div className={styles.editSheet}>
            <div className={styles.sheetHandle} />
            <ItemEditForm
              item={editingItem}
              onSave={handleSave}
              onCancel={() => setEditingItem(null)}
            />
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
