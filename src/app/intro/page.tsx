"use client";

import Link from "next/link";
import { useMemo } from "react";
import ScrollUnlock from "./ScrollUnlock";
import styles from "./IntroPage.module.css";

export default function IntroPage(): React.ReactElement {
  const videoSrc = useMemo(() => "/background.mp4", []);

  return (
    <div className={styles.page}>
      <ScrollUnlock />

      <div className={styles.bg} aria-hidden>
        <video className={styles.video} autoPlay muted loop playsInline preload="metadata">
          <source src={videoSrc} type="video/mp4" />
        </video>
        <div className={styles.fallback} />
        <div className={styles.overlay} />
      </div>

      <main className={styles.content}>
        <div className={styles.center}>
          <p className={styles.kicker}>EXPENSE PHOTO PLATFORM</p>

          <h1 className={styles.title}>
            사진대지 자동 출력,
            <br />
            엑셀 행 기준으로 정확하게.
          </h1>

          <p className={styles.subtitle}>
            NO.x · 품명 · 수량 선택 → 반입/지급·설치 사진 업로드 → 템플릿대로 즉시 출력
          </p>

          <div className={styles.actions}>
            <Link className={styles.primaryBtn} href="/expense">
              시작하기
            </Link>

            <Link className={styles.secondaryBtn} href="/photos-test">
              미리보기
            </Link>
          </div>

          <p className={styles.footnote}>
            * 영상: <span className={styles.mono}>/public/background.mp4</span>
          </p>
        </div>
      </main>
    </div>
  );
}
