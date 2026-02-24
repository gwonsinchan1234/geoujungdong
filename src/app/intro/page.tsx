"use client";

import Link from "next/link";
import { useMemo } from "react";
import ScrollUnlock from "./ScrollUnlock";
import styles from "./IntroPage.module.css";

export default function IntroPage(): React.ReactElement {
  // 이유: 경로 문자열 재생성 방지(불필요 렌더/리소스 힌트 최소화)
  const videoSrc = useMemo(() => "/intro.mp4", []);

  return (
    <div className={styles.page}>
      <ScrollUnlock />

      <div className={styles.bg} aria-hidden>
        <video className={styles.video} autoPlay muted loop playsInline preload="metadata">
          <source src={videoSrc} type="video/mp4" />
        </video>

        {/* 흰/멀건 레이어 제거 유지 */}
        <div className={styles.fallback} />
        <div className={styles.overlay} />
      </div>

      <main className={styles.content}>
        <div className={styles.hero}>
          <p className={styles.kicker}>EXPENSE PHOTO PLATFORM</p>

          <h1 className={styles.title}>
            사진대지 자동 출력,
            <br />
            엑셀 행 기준으로 정확하게.
          </h1>

          <p className={styles.subtitle}>NO.x · 품명 · 수량 선택 → 반입/지급·설치 사진 업로드 → 템플릿대로 즉시 출력</p>

          <div className={styles.actions}>
            <Link className={styles.primaryBtn} href="/workspace">
              시작하기
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
