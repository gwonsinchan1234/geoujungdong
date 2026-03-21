"use client";

import dynamic from "next/dynamic";
import styles from "./MobilePdfOpenPanel.module.css";

const MobilePdfJsViewer = dynamic(() => import("./MobilePdfJsViewer"), {
  ssr: false,
  loading: () => (
    <div className={styles.viewerLoading}>
      <div className={styles.spinner} aria-hidden />
      <span>뷰어 준비 중…</span>
    </div>
  ),
});

type Props = {
  generating: boolean;
  error: string | null;
  blobUrl: string | null;
  /** 갑지 / 항목별 등 짧은 구분 문구 */
  docLabel: string;
};

export default function MobilePdfOpenPanel({
  generating,
  error,
  blobUrl,
  docLabel,
}: Props) {
  return (
    <div className={styles.shell}>
      {generating && (
        <div className={styles.spinnerWrap}>
          <div className={styles.spinner} aria-hidden />
          <span className={styles.spinnerText}>PDF 생성 중…</span>
        </div>
      )}

      {error && !generating && (
        <div className={styles.errorWrap}>
          <p className={styles.error}>{error}</p>
        </div>
      )}

      {!generating && blobUrl && (
        <div className={styles.viewer}>
          <MobilePdfJsViewer
            key={blobUrl}
            blobUrl={blobUrl}
            docLabel={docLabel}
          />
        </div>
      )}
    </div>
  );
}
