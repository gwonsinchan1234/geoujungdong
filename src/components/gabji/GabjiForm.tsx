"use client";

// 좌측 패널 – 갑지 기본정보 입력폼
// 수치 필드: blur 시 쉼표 포맷, focus 시 raw 숫자

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { GabjiDoc } from "./types";
import { fmtWon, parseNum } from "./types";
import styles from "./gabji.module.css";

const sCard = (i: number) => ({
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as number[], delay: i * 0.08 },
});

interface Props {
  doc: GabjiDoc;
  onChange: (doc: GabjiDoc) => void;
}

function NumInput({
  value, onChange, placeholder,
}: { value: number; onChange: (n: number) => void; placeholder?: string }) {
  const [raw, setRaw] = useState(() => value > 0 ? fmtWon(value) : "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(value > 0 ? fmtWon(value) : "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      className={styles.input}
      value={raw}
      placeholder={placeholder ?? "0"}
      onFocus={() => { setFocused(true); setRaw(value > 0 ? String(Math.round(value)) : ""); }}
      onChange={e => {
        const v = e.target.value.replace(/[^\d]/g, "");
        setRaw(v);
        onChange(parseInt(v || "0", 10));
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseInt(raw.replace(/[^\d]/g, "") || "0", 10);
        setRaw(n > 0 ? fmtWon(n) : "");
        onChange(n);
      }}
    />
  );
}

function PctInput({
  value, onChange,
}: { value: number; onChange: (n: number) => void }) {
  const [raw, setRaw] = useState(value > 0 ? String(value) : "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(value > 0 ? String(value) : "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={styles.input}
      placeholder="0"
      value={raw}
      onFocus={() => setFocused(true)}
      onChange={e => {
        const v = e.target.value.replace(/[^\d.]/g, "");
        setRaw(v);
        onChange(parseNum(v));
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseNum(raw);
        setRaw(n > 0 ? String(n) : "");
        onChange(n);
      }}
    />
  );
}

export default function GabjiForm({ doc, onChange }: Props) {
  const set = useCallback(
    (field: keyof GabjiDoc, val: GabjiDoc[keyof GabjiDoc]) =>
      onChange({ ...doc, [field]: val }),
    [doc, onChange],
  );

  const txt = (field: keyof GabjiDoc) => ({
    className: styles.input,
    value: (doc[field] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(field, e.target.value),
  });

  return (
    <div className={styles.formWrap}>
      {/* ── 현장 기본정보 ── */}
      <motion.div className={styles.section} {...sCard(0)}>
        <div className={styles.sectionTitle}>현장 기본정보</div>
        <div className={styles.fieldGrid}>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label className={styles.label}>현장명 *</label>
            <input {...txt("site_name")} placeholder="예: 거우중동 00현장" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>건설업체명</label>
            <input {...txt("construction_company")} placeholder="건설업체명" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>대표자</label>
            <input {...txt("representative_name")} placeholder="홍길동" />
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label className={styles.label}>공사명</label>
            <input {...txt("project_name")} placeholder="공사명" />
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label className={styles.label}>소재지</label>
            <input {...txt("address")} placeholder="주소" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>발주자</label>
            <input {...txt("client_name")} placeholder="발주자" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>누계 공정율 (%)</label>
            <PctInput
              value={doc.cumulative_progress_rate}
              onChange={n => set("cumulative_progress_rate", n)}
            />
          </div>
        </div>
      </motion.div>

      {/* ── 공사 기간 · 금액 ── */}
      <motion.div className={styles.section} {...sCard(1)}>
        <div className={styles.sectionTitle}>공사 기간 · 금액</div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.label}>작성기준월 *</label>
            <input
              type="month"
              className={styles.input}
              value={doc.year_month}
              onChange={e => set("year_month", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>작성일</label>
            <input
              type="date"
              className={styles.input}
              value={doc.write_date}
              onChange={e => set("write_date", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>공사 시작일</label>
            <input
              type="date"
              className={styles.input}
              value={doc.start_date}
              onChange={e => set("start_date", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>공사 종료일</label>
            <input
              type="date"
              className={styles.input}
              value={doc.end_date}
              onChange={e => set("end_date", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>공사금액 (원)</label>
            <NumInput
              value={doc.contract_amount}
              onChange={n => set("contract_amount", n)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>금액 부기</label>
            <input {...txt("contract_amount_note")} placeholder="VAT 포함" />
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label className={styles.label}>계산된 안전관리비 (원)</label>
            <NumInput
              value={doc.budgeted_safety_cost}
              onChange={n => set("budgeted_safety_cost", n)}
            />
          </div>
        </div>
      </motion.div>

      {/* ── 확인자 서명 ── */}
      <motion.div className={styles.section} {...sCard(2)}>
        <div className={styles.sectionTitle}>확인자 서명</div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.label}>확인자1 직책</label>
            <input {...txt("checker1_position")} placeholder="안전담당" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>확인자1 성명</label>
            <input {...txt("checker1_name")} placeholder="홍길동" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>확인자2 직책</label>
            <input {...txt("checker2_position")} placeholder="현장소장" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>확인자2 성명</label>
            <input {...txt("checker2_name")} placeholder="홍길동" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
