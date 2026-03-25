import type { ReactNode } from "react";

/**
 * 홈 히어로 배경 동영상을 문서 초기에 프리로드해 첫 화면에서 재생까지 시간을 줄입니다.
 */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
