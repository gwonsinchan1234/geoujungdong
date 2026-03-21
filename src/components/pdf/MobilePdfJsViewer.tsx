"use client";

/**
 * 모바일 인라인 미리보기: iframe+blob는 iOS에서 막히는 경우가 많아
 * PDF.js(react-pdf)로 페이지를 캔버스에 그려 새 탭 없이 표시한다.
 * worker는 public/pdf.worker.min.mjs (pdfjs-dist 빌드와 버전 맞출 것)
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import styles from "./MobilePdfJsViewer.module.css";

// 워커 파일 서빙 경로 이슈(배포/모바일) 회피를 위해 버전 맞는 CDN 워커 사용
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Props = {
  blobUrl: string;
  docLabel: string;
};

export default function MobilePdfJsViewer({ blobUrl, docLabel }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [docReady, setDocReady] = useState(false);

  // 첫 페인트 전에 폭을 먼저 잡아 "작게 보였다가 커지는 점프"를 줄인다.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setPageWidth(Math.max(220, Math.floor(w - 20)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 문서 교체 시 이전 페이지 상태를 즉시 비워 점프를 줄인다.
  useEffect(() => {
    setNumPages(0);
    setDocReady(false);
  }, [blobUrl]);

  return (
    <div
      ref={scrollRef}
      className={styles.scroll}
      role="region"
      aria-label={`${docLabel} PDF 미리보기`}
    >
      <Document
        key={blobUrl}
        file={{ url: blobUrl }}
        loading={
          <div
            className={styles.docLoadingFrame}
            style={pageWidth > 0 ? { width: pageWidth, minHeight: Math.round(pageWidth * 1.414) } : undefined}
          >
            <div className={styles.inlineStatus}>페이지 그리는 중…</div>
          </div>
        }
        error={
          <div className={styles.inlineError}>
            여기서는 미리보기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        }
        onLoadSuccess={({ numPages: n }) => {
          setNumPages(n);
          setDocReady(true);
        }}
      >
        {docReady && pageWidth > 0 && numPages > 0 &&
          Array.from({ length: numPages }, (_, i) => (
            <div key={i + 1} className={styles.pageWrap}>
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          ))}
      </Document>
    </div>
  );
}
