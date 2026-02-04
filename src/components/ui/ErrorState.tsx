"use client";

import React from "react";
import styles from "./ErrorState.module.css";

type Props = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function ErrorState({ icon, title, description, action }: Props) {
  return (
    <div className={styles.wrap} role="alert">
      {icon && <div className={styles.icon} aria-hidden>{icon}</div>}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.desc}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
