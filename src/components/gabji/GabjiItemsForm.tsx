"use client";

// 좌측 패널 – 안전관리비 항목 입력 테이블
// 9개 항목 × (전월 사용누계 | 금월 사용금액 | 누계 자동)

import React, { useCallback, useEffect, useRef } from "react";
import type { GabjiItem } from "./types";
import { fmtWon, calcTotals } from "./types";
import styles from "./gabji.module.css";

interface Props {
  items: GabjiItem[];
  onChange: (items: GabjiItem[]) => void;
  budgeted: number;
}

function AmtCell({
  value, onChange,
}: { value: number; onChange: (n: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.value = value > 0 ? fmtWon(value) : "";
    }
  }, [value]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      className={styles.itemAmtInput}
      defaultValue={value > 0 ? fmtWon(value) : ""}
      placeholder="0"
      onFocus={e => {
        e.target.value = value > 0 ? String(Math.round(value)) : "";
      }}
      onChange={e => {
        const raw = e.target.value.replace(/[^\d]/g, "");
        onChange(parseInt(raw || "0", 10));
      }}
      onBlur={e => {
        const n = parseInt(e.target.value.replace(/[^\d]/g, "") || "0", 10);
        e.target.value = n > 0 ? fmtWon(n) : "";
        onChange(n);
      }}
    />
  );
}

export default function GabjiItemsForm({ items, onChange, budgeted }: Props) {
  const updateItem = useCallback(
    (idx: number, field: "prev_amount" | "current_amount", val: number) => {
      const next = items.map((item, i) => {
        if (i !== idx) return item;
        const prev    = field === "prev_amount"    ? val : item.prev_amount;
        const current = field === "current_amount" ? val : item.current_amount;
        return { ...item, [field]: val, total_amount: prev + current };
      });
      onChange(next);
    },
    [items, onChange],
  );

  const updateName = useCallback(
    (idx: number, name: string) => {
      onChange(items.map((item, i) => i === idx ? { ...item, item_name: name } : item));
    },
    [items, onChange],
  );

  const { prevTotal, currTotal, total } = calcTotals(items);
  const rate = budgeted > 0 ? (total / budgeted * 100).toFixed(1) : "0.0";
  const isOver = budgeted > 0 && total > budgeted;

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>안전관리비 사용내역</div>

      <table className={styles.itemsTable}>
        <thead>
          <tr>
            <th className={styles.colNo}>No</th>
            <th className={styles.colName}>항목</th>
            <th className={styles.colAmt}>전월 사용누계</th>
            <th className={styles.colAmt}>
              <span className={styles.thMain}>금월</span>
              <span className={styles.thSub}>사용금액</span>
            </th>
            <th className={styles.colAmt}>
              <span className={styles.thMain}>누계</span>
              <span className={styles.thSub}>사용금액</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr
              key={item.item_code}
              className={styles.itemRow}
              style={{ animationDelay: `${idx * 0.03}s` }}
            >
              <td className={styles.itemNo}>{item.item_code}</td>
              <td className={styles.itemName}>
                <input
                  type="text"
                  className={styles.itemNameInput}
                  value={item.item_name}
                  onChange={e => updateName(idx, e.target.value)}
                  placeholder={`항목 ${item.item_code}`}
                />
              </td>
              <td className={styles.itemAmtCell}>
                <AmtCell
                  value={item.prev_amount}
                  onChange={n => updateItem(idx, "prev_amount", n)}
                />
              </td>
              <td className={styles.itemAmtCell}>
                <AmtCell
                  value={item.current_amount}
                  onChange={n => updateItem(idx, "current_amount", n)}
                />
              </td>
              <td className={styles.itemTotal}>
                {item.total_amount > 0 ? fmtWon(item.total_amount) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.totalRow}>
            <td colSpan={2} style={{ textAlign: "center" }}>합 계</td>
            <td style={{ textAlign: "right", padding: "6px 8px" }}>
              {prevTotal > 0 ? fmtWon(prevTotal) : "—"}
            </td>
            <td style={{ textAlign: "right", padding: "6px 8px" }}>
              {currTotal > 0 ? fmtWon(currTotal) : "—"}
            </td>
            <td style={{ textAlign: "right", padding: "6px 8px" }}>
              {total > 0 ? fmtWon(total) : "—"}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className={styles.usageRateRow}>
        <span className={styles.usageRateLabel}>계상액 대비 사용율:</span>
        <span className={styles.usageRateValue}>{rate}%</span>
        {isOver && (
          <span className={styles.usageOverWarn}>⚠ 계상액 초과!</span>
        )}
      </div>
    </div>
  );
}
