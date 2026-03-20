"use client";

// 항목별세부내역 에디터
// GabjiEditor와 완전 동일한 레이아웃:
//   다크 툴바(toolbarLeft/Right) → 모바일탭(tabBar/tabBtn/active)
//   → 에디터바디(좌: 카테고리표 | 우: A4 미리보기)

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";

// 데스크탑 전용 PDF 뷰어 (SSR 불가)
const ItemListPdfViewer = dynamic(() => import("./ItemListPdfViewer"), {
  ssr: false,
  loading: () => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", color: "#94a3b8", fontSize: 13,
      flexDirection: "column", gap: 10,
    }}>
      <div style={{
        width: 28, height: 28,
        border: "3px solid rgba(148,163,184,.3)", borderTopColor: "#94a3b8",
        borderRadius: "50%", animation: "spin 0.75s linear infinite",
      }} />
      PDF 준비 중…
    </div>
  ),
});

function initIsMobile() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768;
}
import type { ItemData } from "./types";
import {
  CATEGORY_LABELS, UNIT_SUGGESTIONS,
  makeNewItem, fmtNum, parseNum, calcAmount,
} from "./types";
import styles from "./item-list.module.css";

// ── 숫자 인라인 입력 (포커스: raw값, blur: 포맷) ──────────────────
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
// A4 미리보기 (우측 패널) — GabjiHtmlPreview 동일 구조
// ══════════════════════════════════════════════════════════════════════
const A4_PX = 794;

function ItemListPreview({ items }: { items: ItemData[] }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [zoomVal, setZoomVal] = useState(1);

  useEffect(() => {
    const update = () => {
      if (!outerRef.current) return;
      const cw = outerRef.current.clientWidth;
      setZoomVal(cw > 16 ? Math.min(1, (cw - 32) / A4_PX) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, []);

  const total = items.reduce((s, i) => s + i.amount, 0);

  const grouped = useMemo(() => {
    const map = new Map<number, ItemData[]>();
    for (let i = 1; i <= 9; i++) map.set(i, []);
    for (const item of items) map.get(item.categoryNo)?.push(item);
    return map;
  }, [items]);

  const catSums = useMemo(
    () => Object.fromEntries(
      Array.from(grouped.entries()).map(([no, its]) => [no, its.reduce((s, i) => s + i.amount, 0)])
    ),
    [grouped],
  );

  return (
    <div ref={outerRef} className={styles.htmlPreviewOuter}>
      <div style={{ zoom: zoomVal, width: A4_PX }}>
        <div className={styles.a4Wrap}>
          <div className={styles.a4Title}>항목별 세부내역서</div>
          <table className={styles.previewTable}>
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "9%" }} />
              <col />
              <col style={{ width: "6%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>번호</th>
                <th>사용일자</th>
                <th>품명 / 규격</th>
                <th>수량</th>
                <th>단위</th>
                <th>단가</th>
                <th>금액</th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.previewSumRow}>
                <td colSpan={6} className={styles.previewSumLabel}>합&nbsp;&nbsp;&nbsp;계</td>
                <td className={styles.previewRight}>{fmtNum(total)}</td>
              </tr>
              {Array.from(grouped.entries()).flatMap(([catNo, catItems]) => {
                if (catItems.length === 0) return [];
                return [
                  <tr key={`ch-${catNo}`} className={styles.previewCatRow}>
                    <td colSpan={6}>{catNo}. {CATEGORY_LABELS[catNo]}</td>
                    <td className={styles.previewRight}>{fmtNum(catSums[catNo])}</td>
                  </tr>,
                  ...catItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td>{item.evidenceNo || `NO.${idx + 1}`}</td>
                      <td>{item.usageDate}</td>
                      <td className={styles.previewLeft}>{item.name}</td>
                      <td>{item.quantity || ""}</td>
                      <td>{item.unit}</td>
                      <td className={styles.previewRight}>{item.unitPrice ? fmtNum(item.unitPrice) : ""}</td>
                      <td className={styles.previewRight}>{fmtNum(item.amount)}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// 항목 행 (테이블 row) — GabjiItemsForm과 동일한 인라인 편집 UX
// ══════════════════════════════════════════════════════════════════════
function ItemRow({
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
  const amtProps = useInlineNum(item.amount, v => onInlineChange(item.id, "amount", v));

  return (
    <motion.tr
      className={styles.itemRow}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: idx * 0.03 }}
    >
      {/* NO */}
      <td className={styles.itemNo}>
        {item.evidenceNo || idx + 1}
      </td>

      {/* 품명 (expandable input) */}
      <td className={styles.itemName}>
        <input
          type="text"
          className={styles.itemNameInput}
          value={item.name}
          onChange={e => onInlineChange(item.id, "name", e.target.value)}
          placeholder="품명"
        />
      </td>

      {/* 금액 */}
      <td className={styles.itemAmtCell}>
        <input
          className={styles.itemAmtInput}
          inputMode="numeric"
          placeholder="0"
          {...amtProps}
        />
      </td>

      {/* 액션 */}
      <td className={styles.tdActions}>
        {deletingId === item.id ? (
          <div className={styles.delConfirm}>
            <button className={styles.delNo}  onClick={onCancelDelete}>취소</button>
            <button className={styles.delYes} onClick={() => onDelete(item.id)}>삭제</button>
          </div>
        ) : (
          <div className={styles.rowBtns}>
            <button className={styles.rowEditBtn} onClick={() => onEdit(item)} title="수정">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button className={styles.rowDelBtn} onClick={() => onStartDelete(item.id)} title="삭제">✕</button>
          </div>
        )}
      </td>
    </motion.tr>
  );
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
          <input className={styles.editInput} type="text"
            value={local.usageDate} placeholder="예: 26.01.15"
            onChange={e => setF("usageDate", e.target.value)} />
        </div>

        {/* 품명 */}
        <div className={styles.editField}>
          <label>품명</label>
          <input className={styles.editInput} type="text"
            value={local.name} placeholder="품명 입력"
            onChange={e => setF("name", e.target.value)} />
        </div>

        {/* 수량 + 단위 */}
        <div className={`${styles.editField} ${styles.editFieldRow}`}>
          <div className={styles.editHalf}>
            <label>수량</label>
            <input className={styles.editInput} type="number" min="0"
              value={local.quantity || ""} placeholder="0"
              onChange={e => setF("quantity", parseNum(e.target.value))} />
          </div>
          <div className={styles.editHalf}>
            <label>단위 / 규격</label>
            <input className={styles.editInput} type="text"
              value={local.unit} placeholder="식" list="itemUnitList"
              onChange={e => setF("unit", e.target.value)} />
            <datalist id="itemUnitList">
              {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
            </datalist>
          </div>
        </div>

        {/* 단가 */}
        <div className={styles.editField}>
          <label>단가</label>
          <div className={styles.editInputRow}>
            <input className={styles.editInput} type="text" inputMode="numeric"
              value={local.unitPrice ? fmtNum(local.unitPrice) : ""} placeholder="0"
              onChange={e => setF("unitPrice", parseNum(e.target.value))} />
            <span className={styles.editUnit}>원</span>
          </div>
        </div>

        {/* 금액 */}
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
          <input className={styles.editInput} type="text"
            value={local.note} placeholder="선택사항"
            onChange={e => setF("note", e.target.value)} />
        </div>

        {/* 사진대지 포함 */}
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
// 메인 컴포넌트
// ══════════════════════════════════════════════════════════════════════
interface Props {
  items: ItemData[];
  onChange: (items: ItemData[]) => void;
  onSave?: () => void;
  onPrint?: () => void;
  saved?: boolean;
}

export default function ItemListView({ items, onChange, onSave, onPrint, saved }: Props) {
  const [editingItem, setEditingItem] = useState<ItemData | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [mobileTab,   setMobileTab]   = useState<"list" | "preview">("list");
  const [isMobile,    setIsMobile]    = useState(initIsMobile);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<number, ItemData[]>();
    for (let i = 1; i <= 9; i++) map.set(i, []);
    for (const item of items) map.get(item.categoryNo)?.push(item);
    return map;
  }, [items]);

  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);

  const handleAdd  = useCallback((catNo: number) => setEditingItem(makeNewItem(catNo)), []);
  const handleEdit = useCallback((item: ItemData) => setEditingItem({ ...item }), []);

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
      if (field === "name")      return { ...it, name: raw };
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
    <div className={styles.editor}>

      {/* ── 툴바 — gabji .toolbar 완전 동일 ────────────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarTitle}>항목별세부내역</span>
          <span className={styles.toolbarSep} />
          <span className={styles.toolbarCount}>총 {items.length}건</span>
          <span className={styles.toolbarTotal}>{fmtNum(total)}원</span>
        </div>
        <div className={styles.toolbarRight}>
          {saved && <span className={styles.savedBadge}>✓ 저장됨</span>}
          {onSave && (
            <button type="button" className={styles.btnPrimary} onClick={onSave}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              저장
            </button>
          )}
          {onPrint && (
            <button type="button" className={styles.btnPrint} onClick={onPrint}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              인쇄
            </button>
          )}
        </div>
      </div>

      {/* ── 모바일 탭 — gabji .mobileTabs/.tabBar/.tabBtn/.active 동일 */}
      <div className={styles.mobileTabs}>
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${mobileTab === "list" ? styles.active : ""}`}
            onClick={() => setMobileTab("list")}
          >항목 편집</button>
          <button
            className={`${styles.tabBtn} ${mobileTab === "preview" ? styles.active : ""}`}
            onClick={() => setMobileTab("preview")}
          >미리보기</button>
        </div>
      </div>

      {/* ── 에디터 바디: 좌(항목 표) + 우(A4 미리보기) ──────────── */}
      <div className={styles.editorBody}>

        {/* 좌측 패널 */}
        <div className={`${styles.leftPanel} ${mobileTab === "preview" ? styles.mobileHidden : ""}`}>
          <div className={styles.formWrap}>
            {Array.from(grouped.entries()).map(([catNo, catItems], sectionIdx) => {
              const catSum = catItems.reduce((s, i) => s + i.amount, 0);
              return (
                <motion.div
                  key={catNo}
                  className={styles.sectionCard}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: sectionIdx * 0.06 }}
                >
                  {/* 카테고리 헤더 */}
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionLeft}>
                      <span className={styles.catNum}>{catNo}</span>
                      <span className={styles.catName}>{CATEGORY_LABELS[catNo]}</span>
                    </div>
                    <div className={styles.sectionRight}>
                      {catSum > 0 && <span className={styles.catSum}>{fmtNum(catSum)}원</span>}
                      <span className={styles.catCount}>{catItems.length}건</span>
                    </div>
                  </div>

                  {/* 항목 테이블 */}
                  {catItems.length > 0 && (
                    <div className={styles.tableWrap}>
                      <table className={styles.itemsTable}>
                        <colgroup>
                          <col className={styles.colNo} />
                          <col />
                          <col className={styles.colAmt} />
                          <col style={{ width: "48px" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>NO</th>
                            <th>품명</th>
                            <th>금액</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {catItems.map((item, idx) => (
                            <ItemRow
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
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 항목 추가 */}
                  <button className={styles.addRowBtn} onClick={() => handleAdd(catNo)}>
                    + 항목 추가
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* 우측 패널: 데스크탑 → PDF 뷰어, 모바일 → HTML 미리보기 */}
        <div className={`${styles.rightPanel} ${mobileTab === "list" ? styles.mobileHidden : ""}`}>
          {isMobile
            ? <ItemListPreview items={items} />
            : <ItemListPdfViewer items={items} />
          }
        </div>

      </div>

      {/* ── 편집 바텀시트 (portal → body) ───────────────────────── */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {editingItem && (
            <>
              <motion.div
                key="backdrop"
                className={styles.editBackdrop}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setEditingItem(null)}
              />
              <motion.div
                key="sheet"
                className={styles.editSheet}
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 380 }}
              >
                <div className={styles.sheetHandle} />
                <ItemEditForm
                  item={editingItem}
                  onSave={handleSave}
                  onCancel={() => setEditingItem(null)}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
