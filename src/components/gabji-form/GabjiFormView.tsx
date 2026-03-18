"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { GabjiData, GabjiItem } from "./types";
import { sumItems, fmtWon, parseNum } from "./types";
import styles from "./gabji-form.module.css";

// ── 아이콘 ────────────────────────────────────────────────────────
function IconBuilding() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}
function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
}
function IconSum() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}
function IconPen() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

// ── 필드 래퍼 ─────────────────────────────────────────────────────
function Field({
  label, children, span2 = false,
}: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={`${styles.field} ${span2 ? styles.fieldSpan2 : ""}`}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

// ── 합계 행 ───────────────────────────────────────────────────────
function TotalRow({
  label, value, neg,
}: { label: string; value: number; neg?: boolean }) {
  const cls = `${styles.totalValue} ${neg && value !== 0 ? (value < 0 ? styles.totalValueNeg : styles.totalValuePos) : ""}`;
  return (
    <div className={`${styles.totalRow} ${neg ? styles.totalRowHighlight : ""}`}>
      <span className={styles.totalLabel}>{label}</span>
      <span className={cls}>
        {fmtWon(Math.abs(value))}<span className={styles.totalUnit}> 원</span>
        {neg && value < 0 && <span className={styles.totalTag}>초과</span>}
      </span>
    </div>
  );
}

// ── 항목 행 ───────────────────────────────────────────────────────
function ItemRow({
  item, idx, onChange,
}: {
  item: GabjiItem;
  idx: number;
  onChange: (id: string, field: keyof GabjiItem, value: string) => void;
}) {
  return (
    <div className={styles.item} style={{ animationDelay: `${idx * 0.025}s` }}>
      <span className={styles.itemNo}>{item.no}</span>

      <input
        className={`${styles.input} ${styles.itemLabelInput}`}
        value={item.label}
        placeholder="항목명"
        onChange={e => onChange(item.id, "label", e.target.value)}
      />

      {/* 금액 묶음 — 모바일에서 2열, 데스크탑에서 grid contents */}
      <div className={styles.itemAmountRow}>
        <div className={styles.itemAmountField}>
          <span className={styles.itemAmountLabel}>계획금액</span>
          <input
            className={`${styles.input} ${styles.itemAmountInput}`}
            type="text"
            inputMode="numeric"
            value={item.planAmount}
            placeholder="0"
            onChange={e => onChange(item.id, "planAmount", e.target.value)}
          />
        </div>
        <div className={styles.itemAmountField}>
          <span className={styles.itemAmountLabel}>사용금액</span>
          <input
            className={`${styles.input} ${styles.itemAmountInput}`}
            type="text"
            inputMode="numeric"
            value={item.useAmount}
            placeholder="0"
            onChange={e => onChange(item.id, "useAmount", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
interface Props {
  data: GabjiData;
  onSave: (data: GabjiData) => void;
  /** 항목별세부내역에서 계산된 카테고리별 실사용금액 (catNo → 원) */
  itemAmounts?: Record<number, number>;
}

export default function GabjiFormView({ data, onSave, itemAmounts }: Props) {
  const [local, setLocal] = useState<GabjiData>(() => structuredClone(data));
  const [saved, setSaved] = useState(false);

  // 새 파일 업로드 시 재초기화
  useEffect(() => {
    setLocal(structuredClone(data));
  }, [data]);

  const setField = useCallback(<K extends keyof GabjiData>(key: K, value: GabjiData[K]) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  }, []);

  const setItem = useCallback((id: string, field: keyof GabjiItem, value: string) => {
    setLocal(prev => ({
      ...prev,
      items: prev.items.map(it => it.id === id ? { ...it, [field]: value } : it),
    }));
  }, []);

  const planTotal = useMemo(() => sumItems(local.items, "planAmount"), [local.items]);
  // 사용금액: itemAmounts가 있으면 items 합산 우선, 없으면 수동 입력값
  const useTotal = useMemo(() => {
    if (itemAmounts) return Object.values(itemAmounts).reduce((s, v) => s + v, 0);
    return sumItems(local.items, "useAmount");
  }, [local.items, itemAmounts]);
  const balance   = planTotal - useTotal;

  const handleSave = () => {
    onSave(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className={styles.form}>

      {/* ── 섹션 1: 현장 기본정보 ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={`${styles.sectionIcon} ${styles.blue}`}><IconBuilding /></span>
          <h2>현장 기본정보</h2>
        </div>
        <div className={styles.infoGrid}>
          <Field label="공사명" span2>
            <input className={styles.input}
              value={local.gongsamyeong} placeholder="공사명을 입력하세요"
              onChange={e => setField("gongsamyeong", e.target.value)} />
          </Field>
          <Field label="현장명" span2>
            <input className={styles.input}
              value={local.hyeonjangmyeong} placeholder="현장명을 입력하세요"
              onChange={e => setField("hyeonjangmyeong", e.target.value)} />
          </Field>
          <Field label="공사금액">
            <div className={styles.inputRow}>
              <input className={styles.input} type="text" inputMode="numeric"
                value={local.gongsageumaek} placeholder="금액"
                onChange={e => setField("gongsageumaek", e.target.value)} />
              <span className={styles.unit}>원</span>
            </div>
          </Field>
          <Field label="공정율">
            <div className={styles.inputRow}>
              <input className={styles.input} type="number" min="0" max="100"
                value={local.gongjungnyul} placeholder="0"
                onChange={e => setField("gongjungnyul", e.target.value)} />
              <span className={styles.unit}>%</span>
            </div>
          </Field>
          <Field label="공사기간" span2>
            <input className={styles.input}
              value={local.gongsagigan} placeholder="예: 2026.01.01 ~ 2026.12.31"
              onChange={e => setField("gongsagigan", e.target.value)} />
          </Field>
          <Field label="발주자" span2>
            <input className={styles.input}
              value={local.baljuja} placeholder="발주자명"
              onChange={e => setField("baljuja", e.target.value)} />
          </Field>
        </div>
      </section>

      {/* ── 섹션 2: 사용금액 ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={`${styles.sectionIcon} ${styles.green}`}><IconList /></span>
          <h2>안전관리비 사용내역</h2>
          <span className={styles.sectionBadge}>{local.items.length}개 항목</span>
        </div>

        {/* 데스크탑 컬럼 헤더 */}
        <div className={styles.itemsColHeader}>
          <span>번호</span>
          <span>항목명</span>
          <span style={{ textAlign: "right" }}>계획금액</span>
          <span style={{ textAlign: "right" }}>사용금액</span>
        </div>

        <div className={styles.itemsList}>
          {local.items.map((item, idx) => (
            <ItemRow key={item.id} item={item} idx={idx} onChange={setItem} />
          ))}
        </div>
      </section>

      {/* ── 섹션 3: 합계 ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={`${styles.sectionIcon} ${styles.amber}`}><IconSum /></span>
          <h2>합계</h2>
        </div>
        <div className={styles.totalList}>
          <TotalRow label="계획금액 합계" value={planTotal} />
          <TotalRow label="사용금액 합계" value={useTotal} />
          <TotalRow label="잔액 (계획 − 사용)" value={balance} neg />
        </div>
      </section>

      {/* ── 섹션 4: 서명 ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={`${styles.sectionIcon} ${styles.slate}`}><IconPen /></span>
          <h2>서명</h2>
        </div>
        <div className={styles.signGrid}>
          <Field label="작성일" span2>
            <input className={styles.input} type="text"
              value={local.signDate} placeholder="예: 2026.03.17"
              onChange={e => setField("signDate", e.target.value)} />
          </Field>
          <Field label="현장대리인">
            <input className={styles.input}
              value={local.signRep} placeholder="이름"
              onChange={e => setField("signRep", e.target.value)} />
          </Field>
          <Field label="안전관리담당자">
            <input className={styles.input}
              value={local.signSafety} placeholder="이름"
              onChange={e => setField("signSafety", e.target.value)} />
          </Field>
        </div>
      </section>

      {/* ── 저장 ── */}
      <div className={styles.saveRow}>
        <button
          type="button"
          className={`${styles.saveBtn} ${saved ? styles.saveBtnDone : ""}`}
          onClick={handleSave}
        >
          {saved ? "저장 완료 ✓" : "저장"}
        </button>
      </div>
    </div>
  );
}

// 사용하지 않는 import 방지
void parseNum;
