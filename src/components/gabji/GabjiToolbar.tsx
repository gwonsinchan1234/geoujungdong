"use client";

import React from "react";
import styles from "./gabji.module.css";

interface Props {
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onCopy: (fromYM: string) => void;
  onPrint: () => void;
  yearMonth: string;
  siteName: string;
}

export default function GabjiToolbar({
  saving, saved, onSave, onCopy, onPrint, yearMonth, siteName,
}: Props) {
  const [showCopy, setShowCopy] = React.useState(false);
  const [fromYM, setFromYM] = React.useState(() => {
    // 기본값: 이전 월
    if (!yearMonth) return "";
    const [y, m] = yearMonth.split("-").map(Number);
    if (m === 1) return `${y - 1}-12`;
    return `${y}-${String(m - 1).padStart(2, "0")}`;
  });

  function handleCopyConfirm() {
    if (!fromYM) return;
    onCopy(fromYM);
    setShowCopy(false);
  }

  return (
    <div className={styles.toolbar}>
      {/* 좌측: 제목 + 현장명 */}
      <div className={styles.toolbarLeft}>
        <span className={styles.toolbarTitle}>산업안전보건관리비 사용내역서</span>
        {siteName && (
          <span style={{ fontSize: 11, color: "#64748b" }}>· {siteName}</span>
        )}
        {yearMonth && (
          <span style={{ fontSize: 11, color: "#64748b" }}>{yearMonth}</span>
        )}
      </div>

      {/* 이전월 복사 피커 */}
      {showCopy && (
        <div className={styles.copyPicker}>
          <span className={styles.copyPickerLabel}>복사 기준월</span>
          <input
            type="month"
            className={styles.monthInput}
            value={fromYM}
            onChange={e => setFromYM(e.target.value)}
          />
          <button className={styles.btnConfirm} onClick={handleCopyConfirm}>
            복사
          </button>
          <button className={styles.btnCancel} onClick={() => setShowCopy(false)}>
            취소
          </button>
        </div>
      )}

      {/* 우측 버튼 */}
      <div className={styles.toolbarRight}>
        {/* 이전월 복사 */}
        {!showCopy && (
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => setShowCopy(true)}
            title="이전 월 데이터를 현재 월로 복사 (누계→전월사용, 당월=0)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
            </svg>
            이전월 복사
          </button>
        )}

        {/* 저장 */}
        {saved && !saving && (
          <span className={styles.savedBadge}>✓ 저장됨</span>
        )}
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? (
            <><div className={styles.saveSpinner} /> 저장 중…</>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              저장
            </>
          )}
        </button>

        {/* 인쇄 */}
        <button type="button" className={styles.btnPrint} onClick={onPrint}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          인쇄
        </button>
      </div>
    </div>
  );
}
