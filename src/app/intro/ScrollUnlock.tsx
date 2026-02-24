"use client";

/**
 * ScrollUnlock
 * 목적: Intro(또는 특정 구간)에서 페이지 스크롤/바운스(오버스크롤)를 잠그기
 * 구현 이유:
 * - body/html overflow, height, touch-action을 조정해 스크롤을 차단
 * - overscroll-behavior는 CSSStyleDeclaration에 타입이 항상 잡히지 않으므로
 *   Record 캐스팅 대신 getPropertyValue / setProperty로 안전 처리 (빌드 통과)
 */

import { useEffect } from "react";

export default function ScrollUnlock(): null {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // 기존 스타일 백업
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.height;
    const prevTouchAction = body.style.touchAction;

    // ✅ 타입 안전: overscroll-behavior는 표준 프로퍼티 접근 대신 CSS property API 사용
    const prevOverscroll = body.style.getPropertyValue("overscroll-behavior");

    // 스크롤 잠금 적용
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.height = "100%";
    body.style.touchAction = "none";
    body.style.setProperty("overscroll-behavior", "none");

    // 언마운트 시 원복
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.height = prevBodyHeight;
      body.style.touchAction = prevTouchAction;

      if (prevOverscroll) {
        body.style.setProperty("overscroll-behavior", prevOverscroll);
      } else {
        body.style.removeProperty("overscroll-behavior");
      }
    };
  }, []);

  return null;
}