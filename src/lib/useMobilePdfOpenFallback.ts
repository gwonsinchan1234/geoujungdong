"use client";

import { useSyncExternalStore } from "react";

/** 항목별세부내역·갑지 에디터와 동일한 모바일 브레이크포인트 */
const QUERY = "(max-width: 768px)";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * iOS Safari 등에서 @react-pdf PDFViewer(iframe+blob)가
 * "Open" 영문 UI만 보이고 인라인 표시가 안 되는 경우가 많아,
 * true일 때는 blob URL + 새 탭 열기 UX로 대체한다.
 */
export function useMobilePdfOpenFallback() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
