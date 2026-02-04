"use client";

import React from "react";
import Link from "next/link";
import styles from "./AppShell.module.css";

type AppShellProps = {
  brand?: React.ReactNode;
  brandHref?: string;
  headerActions?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({
  brand = "PhotoSheet",
  brandHref = "/",
  headerActions,
  sidebar,
  children,
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href={brandHref} className={styles.headerBrand} aria-current={brandHref === "/" ? "page" : undefined}>
          {brand}
        </Link>
        {headerActions && <div className={styles.headerActions}>{headerActions}</div>}
      </header>
      <div className={styles.body}>
        {sidebar && <aside className={styles.sidebar} aria-label="사이드 패널">{sidebar}</aside>}
        <main className={styles.main} id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
