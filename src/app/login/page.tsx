"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoginFormPanel } from "@/components/auth/LoginFormPanel";
import { safeNextPath } from "@/lib/safeNextPath";
import styles from "./page.module.css";

function LoginPageInner() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  return (
    <div className={styles.page}>
      <header className={styles.brandRibbon} role="banner">
        <span className={styles.srOnly}>거우중동 — 로그인 및 회원가입</span>
        <div className={styles.ribbonInner}>
          <img
            src="/logo1.png"
            alt="safetycost"
            className={styles.ribbonLogo}
            width={200}
            height={48}
            decoding="async"
          />
          <p className={styles.ribbonTagline}>안전관리 양식 작성 시스템</p>
        </div>
      </header>

      <div className={styles.cardWrap}>
        <LoginFormPanel variant="page" nextPath={next} />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.suspenseRoot}>
          <div className={styles.suspenseSpinner} />
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
