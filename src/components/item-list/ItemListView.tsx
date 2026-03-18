"use client";

import React, { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { ItemData } from "./types";
import {
  CATEGORY_LABELS, CATEGORY_SHORT, UNIT_SUGGESTIONS,
  makeNewItem, fmtNum, parseNum, calcAmount,
} from "./types";

// 인라인 숫자 입력 — 포커스 중에는 raw 값, blur 시 포맷 표시
function useInlineNum(value: number, onChange: (v: string) => void) {
  const [editing, setEditing] = React.useState(false);
  const [raw, setRaw] = React.useState("");
  return {
    value: editing ? raw : (value || ""),
    onFocus: () => { setEditing(true); setRaw(value ? String(value) : ""); },
    onBlur:  (e: React.FocusEvent<HTMLInputElement>) => { setEditing(false); onChange(e.target.value); },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setRaw(e.target.value),
  };
}
import styles from "./item-list.module.css";

// ── 항목 편집 폼 ──────────────────────────────────────────────────
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
      // 수량 또는 단가 변경 시 금액 자동계산
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
            <label>단위</label>
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

// ── 항목 카드 (인라인 편집) ───────────────────────────────────────
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
  const qtyProps      = useInlineNum(item.quantity,  v => onInlineChange(item.id, "quantity",  v));
  const unitPriceProps = useInlineNum(item.unitPrice, v => onInlineChange(item.id, "unitPrice", v));
  const amountProps   = useInlineNum(item.amount,    v => onInlineChange(item.id, "amount",    v));

  return (
    <div
      className={styles.itemCard}
      style={{ animationDelay: `${idx * 0.02}s` } as React.CSSProperties}
    >
      <div className={styles.itemCardTop}>
        <span className={styles.itemEvNo}>
          {item.evidenceNo || `NO.${idx + 1}`}
        </span>
        <div className={styles.itemBadges}>
          {item.hasPhoto && <span className={styles.photoBadge}>📷</span>}
          {item.note && <span className={styles.noteBadge}>📝</span>}
        </div>
        <button className={styles.itemEditBtn} onClick={() => onEdit(item)} style={{ marginLeft: "auto" }}>
          품명·기타 수정
        </button>
      </div>

      <div className={styles.itemNameRow}>
        <span className={styles.itemName}>{item.name}</span>
        {item.quantity > 1 && (
          <span className={styles.itemQty}>[{item.quantity}{item.unit}]</span>
        )}
      </div>

      {/* 인라인 편집 필드 */}
      <div className={styles.inlineFields}>
        <div className={styles.inlineField}>
          <span className={styles.inlineLabel}>사용일자</span>
          <input
            className={styles.inlineInput}
            value={item.usageDate}
            placeholder="26.01.15"
            onChange={e => onInlineChange(item.id, "usageDate", e.target.value)}
          />
        </div>
        <div className={styles.inlineField}>
          <span className={styles.inlineLabel}>수량</span>
          <input
            className={styles.inlineInput}
            inputMode="numeric"
            placeholder="1"
            {...qtyProps}
          />
        </div>
        <div className={styles.inlineField}>
          <span className={styles.inlineLabel}>단가</span>
          <input
            className={`${styles.inlineInput} ${styles.inlineInputWide}`}
            inputMode="numeric"
            placeholder="0"
            {...unitPriceProps}
          />
        </div>
        <div className={styles.inlineField}>
          <span className={styles.inlineLabel}>금액</span>
          <input
            className={`${styles.inlineInput} ${styles.inlineInputWide}`}
            inputMode="numeric"
            placeholder="0"
            {...amountProps}
          />
        </div>
      </div>

      <div className={styles.itemActions}>
        {deletingId === item.id ? (
          <div className={styles.deleteConfirm}>
            <button className={styles.deleteConfirmYes} onClick={() => onDelete(item.id)}>삭제</button>
            <button className={styles.deleteConfirmNo}  onClick={onCancelDelete}>취소</button>
          </div>
        ) : (
          <button className={styles.itemDeleteBtn} onClick={() => onStartDelete(item.id)}>삭제</button>
        )}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
interface Props {
  items: ItemData[];
  onChange: (items: ItemData[]) => void;
}

export default function ItemListView({ items, onChange }: Props) {
  const [editingItem, setEditingItem] = useState<ItemData | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  // 카테고리별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<number, ItemData[]>();
    for (let i = 1; i <= 9; i++) map.set(i, []);
    for (const item of items) {
      map.get(item.categoryNo)?.push(item);
    }
    return map;
  }, [items]);

  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);

  const handleAdd = useCallback((categoryNo: number) => {
    setEditingItem(makeNewItem(categoryNo));
  }, []);

  const handleEdit = useCallback((item: ItemData) => {
    setEditingItem({ ...item });
  }, []);

  const handleSave = useCallback((saved: ItemData) => {
    const exists = items.some(i => i.id === saved.id);
    if (exists) {
      onChange(items.map(i => i.id === saved.id ? saved : i));
    } else {
      onChange([...items, saved]);
    }
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
      {/* 전체 합계 바 */}
      <div className={styles.summaryBar}>
        <span className={styles.summaryLabel}>총 {items.length}건</span>
        <span className={styles.summaryTotal}>{fmtNum(total)}원</span>
      </div>

      {/* 카테고리별 그룹 */}
      {Array.from(grouped.entries()).map(([catNo, catItems]) => {
        const catSum = catItems.reduce((s, i) => s + i.amount, 0);
        return (
          <section
            key={catNo}
            className={`${styles.catGroup} ${catItems.length === 0 ? styles.catGroupEmpty : ""}`}
          >
            <div className={styles.catHeader}>
              <span className={styles.catNo}>{catNo}</span>
              <span className={styles.catLabel}>{CATEGORY_SHORT[catNo]}</span>
              {catSum > 0 && (
                <span className={styles.catTotal}>{fmtNum(catSum)}원</span>
              )}
              <span className={styles.catCount}>{catItems.length}건</span>
            </div>

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

            <button className={styles.addItemBtn} onClick={() => handleAdd(catNo)}>
              <span>+</span> 항목 추가
            </button>
          </section>
        );
      })}

      {/* 편집 바텀시트 — portal로 body에 렌더링 (transform 조상 영향 방지) */}
      {editingItem && typeof document !== "undefined" && createPortal(
        <>
          <div
            className={styles.editBackdrop}
            onClick={() => setEditingItem(null)}
          />
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
