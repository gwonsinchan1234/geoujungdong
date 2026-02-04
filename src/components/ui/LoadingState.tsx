"use client";

import React from "react";
import styles from "./LoadingState.module.css";

type Props = {
  label?: string;
};

export function LoadingState({ label = "불러오는 중…" }: Props) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.spinner} aria-hidden />
      {label && <p className={styles.label}>{label}</p>}
    </div>
  );
}
