"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import styles from "./page.module.css";

type Lang = "KOR" | "ENG";

// ─────────────────────────────────────────────
// 📸 사진 증빙 섹션 예시 사진 — 여기서만 바꾸면 됩니다.
//
// - src: 이미지 URL (외부 URL or /public 안에 넣은 파일 경로)
//   예) "/photos/before-1.jpg"  또는  "https://example.com/img.jpg"
// - labelKor / labelEng: 사진 아래 표시될 뱃지
// ─────────────────────────────────────────────
const EVIDENCE_PHOTOS = [
  {
    src: "https://picsum.photos/seed/site-before-a/300/300",
    labelKor: "사전",
    labelEng: "Before",
    alt: "설치 전 예시",
  },
  {
    src: "https://picsum.photos/seed/site-after-a/300/300",
    labelKor: "사후",
    labelEng: "After",
    alt: "설치 후 예시",
  },
  {
    src: "https://picsum.photos/seed/site-before-b/300/300",
    labelKor: "사전",
    labelEng: "Before",
    alt: "설치 전 예시 2",
  },
  {
    src: "https://picsum.photos/seed/site-after-b/300/300",
    labelKor: "사후",
    labelEng: "After",
    alt: "설치 후 예시 2",
  },
] as const;
// ─────────────────────────────────────────────

const kakaoEase = [0, 0.21, 0.03, 1.01] as const;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function useReducedMotionSafe() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const fn = () => setReduced(!!mq.matches);
    fn();
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);
  return reduced;
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotionSafe();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 1.0, ease: kakaoEase, delay }}
    >
      {children}
    </motion.div>
  );
}

// ── 사진 증빙 + 엑셀 입력 슬라이더 목 카드 ──
function PhotoExcelSlider({ kor }: { kor: boolean }) {
  const [slide, setSlide] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = (idx: number) => {
    setSlide(idx);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setSlide(s => (s + 1) % 2), 4000);
  };

  useEffect(() => {
    timerRef.current = setInterval(() => setSlide(s => (s + 1) % 2), 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const TABS = [
    { label: kor ? "사진 증빙" : "Photos" },
    { label: kor ? "엑셀 입력" : "Excel" },
  ];

  const EXCEL_ROWS = [
    { name: kor ? "소화기 설치" : "Fire ext.", price: "50,000", qty: "4",  total: "200,000" },
    { name: kor ? "안전모 지급" : "Helmet",   price: "15,000", qty: "10", total: "150,000" },
    { name: kor ? "안전표지판" : "Sign board", price: "8,000",  qty: "5",  total:  "40,000" },
  ];

  return (
    <div className={styles.mockCard}>
      {/* 브라우저 크롬 */}
      <div className={styles.mockTitleBar}>
        <div className={styles.mockTraffic}>
          <span className={cx(styles.mockDot, styles.dRed)} />
          <span className={cx(styles.mockDot, styles.dYellow)} />
          <span className={cx(styles.mockDot, styles.dGreen)} />
        </div>
        <div className={styles.mockUrlBar} />
      </div>

      {/* 슬라이드 탭 */}
      <div className={styles.sliderTabs}>
        {TABS.map((t, i) => (
          <button
            key={i}
            type="button"
            className={cx(styles.sliderTab, slide === i && styles.sliderTabActive)}
            onClick={() => goTo(i)}
          >
            {t.label}
          </button>
        ))}
        {/* 진행 바 */}
        <div className={styles.sliderProgress}>
          <div
            className={styles.sliderProgressBar}
            style={{ left: `${slide * 50}%` }}
          />
        </div>
      </div>

      {/* 슬라이드 트랙 */}
      <div className={styles.sliderViewport}>
        <div
          className={styles.sliderTrack}
          style={{ transform: `translateX(-${slide * 50}%)` }}
        >
          {/* Slide 0 — 사진 증빙 */}
          <div className={styles.slidePane}>
            <div className={styles.mockContent}>
              <div className={styles.mockPhotoHeader}>
                <span className={styles.mockPhotoHeaderLabel}>{kor ? "항목명" : "Item"}</span>
                <span className={styles.mockPhotoHeaderBadge}>{kor ? "소화기 설치" : "Fire extinguisher"}</span>
              </div>
              <div className={styles.mockPhotoGrid}>
                {EVIDENCE_PHOTOS.map((photo, i) => {
                  const isAfter = photo.labelKor === "사후";
                  return (
                    <div key={i} className={styles.mockPhotoSlot}>
                      <Image
                        src={photo.src}
                        alt={photo.alt}
                        width={300}
                        height={300}
                        className={styles.mockPhotoImg}
                        unoptimized
                      />
                      <span className={cx(styles.mockPhotoBadge, isAfter && styles.mockPhotoBadgeAfter)}>
                        {kor ? photo.labelKor : photo.labelEng}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Slide 1 — 엑셀 입력 */}
          <div className={styles.slidePane}>
            <div className={styles.mockContent}>
              <div className={styles.excelUploadBtn}>
                <span className={styles.excelUploadIcon}>📂</span>
                {kor ? "엑셀 파일 자동 가져오기" : "Import from Excel"}
              </div>
              <div className={styles.excelTable}>
                <div className={styles.excelHeader}>
                  <span>{kor ? "항목명" : "Item"}</span>
                  <span>{kor ? "단가" : "Price"}</span>
                  <span>{kor ? "수량" : "Qty"}</span>
                  <span>{kor ? "금액" : "Total"}</span>
                </div>
                {EXCEL_ROWS.map((row, i) => (
                  <div key={i} className={styles.excelRow}>
                    <span className={styles.excelCell}>{row.name}</span>
                    <span className={styles.excelCellNum}>{row.price}</span>
                    <span className={styles.excelCellNum}>{row.qty}</span>
                    <span className={cx(styles.excelCellNum, styles.excelCellTotal)}>{row.total}</span>
                  </div>
                ))}
                <div className={styles.excelSumRow}>
                  <span>{kor ? "합계" : "Sum"}</span>
                  <span />
                  <span />
                  <span>390,000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 도트 인디케이터 */}
      <div className={styles.sliderDots}>
        {TABS.map((_, i) => (
          <button
            key={i}
            type="button"
            className={cx(styles.sliderDot, slide === i && styles.sliderDotActive)}
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [lang, setLang] = useState<Lang>("KOR");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => setVideoReady(true);
    const onError = () => setVideoReady(false);
    v.addEventListener("loadeddata", onLoaded);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("loadeddata", onLoaded);
      v.removeEventListener("error", onError);
    };
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const kor = lang === "KOR";

  return (
    <div className={styles.page}>

      {/* ── TOPBAR ── */}
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            <div className={styles.logo} aria-hidden />
            <span className={styles.brandName}>
              {kor ? "안전관리비 자동화" : "Safety Cost Automation"}
            </span>
          </div>

          <nav className={styles.nav}>
            <a className={styles.navLink} href="#s1">{kor ? "서비스" : "Services"}</a>
            <a className={styles.navLink} href="#footer">{kor ? "정책" : "Policy"}</a>
            <div className={styles.langSep} aria-hidden />
            <div className={styles.langGroup}>
              <button
                type="button"
                className={cx(styles.langBtn, lang === "KOR" && styles.langBtnActive)}
                onClick={() => setLang("KOR")}
              >KOR</button>
              <button
                type="button"
                className={cx(styles.langBtn, lang === "ENG" && styles.langBtnActive)}
                onClick={() => setLang("ENG")}
              >ENG</button>
            </div>
            <a className={styles.ctaTop} href="#">
              {kor ? "시작하기" : "Get started"}
            </a>
          </nav>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className={styles.hero} aria-label="Hero">
        <div className={styles.heroBg} aria-hidden>
          <video
            ref={videoRef}
            className={styles.heroVideo}
            src="/main.mp4"
            autoPlay muted loop playsInline preload="metadata"
          />
          <div className={styles.heroOverlay} />
        </div>

        <div className={styles.heroCopy}>
          <motion.p
            className={styles.heroKicker}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
          >
            {kor ? "안전관리비 자동화 시스템" : "Safety Cost Automation System"}
          </motion.p>

          <motion.h1
            className={styles.heroTitle}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
          >
            {kor ? <>안전관리비 정산을,<br />체계적으로 관리합니다.</> : <>Evidence docs,<br />automated with ease</>}
          </motion.h1>

          <motion.div
            className={styles.heroCtas}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.5 }}
          >
            <a className={styles.ctaHero} href="#">
              {kor ? "시작하기" : "Get started"}
            </a>
            <a className={cx(styles.ctaHero, styles.ctaHeroOutline)} href="#">
              {kor ? "워크스페이스" : "Workspace"}
            </a>
            {videoReady && (
              <button
                type="button"
                className={styles.muteBtn}
                onClick={toggleMute}
                aria-label="Toggle mute"
              >
                {isMuted ? "🔇" : "🔊"}
              </button>
            )}
          </motion.div>
        </div>

        <div className={styles.scrollHint} aria-hidden>
          <div className={styles.scrollDot} />
          <span className={styles.scrollLabel}>Scroll</span>
        </div>
      </section>

      {/* ── SERVICE 1: 엑셀 자동화 ── */}
      <section id="s1" className={styles.svcRow}>
        <div className={styles.svcInner}>
          <Reveal className={styles.svcText}>
            <p className={styles.svcKicker}>{kor ? "엑셀 자동화" : "Excel import"}</p>
            <h2 className={styles.svcTitle}>
              {kor
                ? <>안전관리비 증빙 편하고 빠르게<br/><mark className={styles.hl}>한 번에</mark> 관리해요</>
                : <>Manage all your docs<br /><mark className={styles.hl}>at once</mark></>
              }
            </h2>
            <p className={styles.svcDesc}>
              {kor
                ? "템플릿이 달라도 걱정 없어요. 헤더를 자동 감지하고 항목을 정규화해 일관된 데이터로 만들어 드려요. (임시)"
                : "Templates vary. We detect headers, normalize fields, and build stable item rows. (임시)"
              }
            </p>
            <a className={styles.svcLink} href="#">{kor ? "자세히 보기 →" : "Learn more →"}</a>
          </Reveal>

          <Reveal className={styles.svcMedia} delay={0.1}>
            <div className={styles.mockCard}>
              <div className={styles.mockTitleBar}>
                <div className={styles.mockTraffic}>
                  <span className={cx(styles.mockDot, styles.dRed)} />
                  <span className={cx(styles.mockDot, styles.dYellow)} />
                  <span className={cx(styles.mockDot, styles.dGreen)} />
                </div>
                <div className={styles.mockUrlBar} />
              </div>
              <div className={styles.mockContent}>
                <div className={styles.mockTableHead} />
                <div className={styles.mockTableRow} />
                <div className={styles.mockTableRow} />
                <div className={styles.mockTableRow} />
                <div className={cx(styles.mockTableRow, styles.mockRowShort)} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SERVICE 2: 사진 증빙 (역방향) ── */}
      <section className={cx(styles.svcRow, styles.svcRowGray)}>
        <div className={cx(styles.svcInner, styles.svcInnerReverse)}>
          <Reveal className={styles.svcText}>
            <p className={styles.svcKicker}>{kor ? "사진 증빙" : "Photo evidence"}</p>
            <h2 className={styles.svcTitle}>
              {kor
                ? <>항목별 사진 첨부,<br /><mark className={styles.hl}>규칙대로</mark> 딱 맞게</>
                : <>Photo per item,<br /><mark className={styles.hl}>exactly right</mark></>
              }
            </h2>
            <p className={styles.svcDesc}>
              {kor
                ? "사전·사후 슬롯이 클라이언트와 서버에서 이중으로 검증돼 실수를 원천 차단합니다. (임시)"
                : "Pre/post slots are validated client + server. Mistakes blocked before they happen. (임시)"
              }
            </p>
            <a className={styles.svcLink} href="#">{kor ? "자세히 보기 →" : "Learn more →"}</a>
          </Reveal>

          <Reveal className={cx(styles.svcMedia, styles.svcMediaLeft)} delay={0.1}>
            <PhotoExcelSlider kor={kor} />
          </Reveal>
        </div>
      </section>

      {/* ── SERVICE 3: 미리보기 (다크) ── */}
      <section className={cx(styles.svcRow, styles.svcRowDark)}>
        <div className={styles.svcInner}>
          <Reveal className={styles.svcText}>
            <p className={cx(styles.svcKicker, styles.svcKickerLight)}>{kor ? "미리보기" : "Preview"}</p>
            <h2 className={cx(styles.svcTitle, styles.svcTitleLight)}>
              {kor
                ? <>조회부터 출력까지<br /><mark className={cx(styles.hl, styles.hlOnDark)}>모바일에서 바로</mark></>
                : <>From preview to print,<br /><mark className={cx(styles.hl, styles.hlOnDark)}>right on mobile</mark></>
              }
            </h2>
            <p className={cx(styles.svcDesc, styles.svcDescLight)}>
              {kor
                ? "한 행 = 한 항목. 사진이 섞이지 않고, 모바일에서 즉시 확인 가능해요. (임시)"
                : "One row = one item. Photos never mix. Preview instantly on mobile. (임시)"
              }
            </p>
            <a className={cx(styles.svcLink, styles.svcLinkLight)} href="#">
              {kor ? "자세히 보기 →" : "Learn more →"}
            </a>
          </Reveal>

          <Reveal className={styles.svcMedia} delay={0.1}>
            <div className={cx(styles.mockCard, styles.mockCardDark)}>
              <div className={cx(styles.mockTitleBar, styles.mockTitleBarDark)}>
                <div className={styles.mockTraffic}>
                  <span className={cx(styles.mockDot, styles.dRed)} />
                  <span className={cx(styles.mockDot, styles.dYellow)} />
                  <span className={cx(styles.mockDot, styles.dGreen)} />
                </div>
                <div className={cx(styles.mockUrlBar, styles.mockUrlBarDark)} />
              </div>
              <div className={styles.mockContent}>
                <div className={cx(styles.mockPreviewCard, styles.mockPreviewCardDark)} />
                <div className={cx(styles.mockPreviewCard, styles.mockPreviewCardDark)} />
                <div className={cx(styles.mockTableRow, styles.mockRowDark)} />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="footer" className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLeft}>
            © {new Date().getFullYear()} {kor ? "안전관리비 자동화 시스템" : "Safety Cost Automation System"}
          </div>
          <div className={styles.footerLinks}>
            <a href="#">{kor ? "이용약관" : "Terms"}</a>
            <a href="#">{kor ? "개인정보처리방침" : "Privacy"}</a>
            <a href="#">{kor ? "관련 사이트" : "Related sites"}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
