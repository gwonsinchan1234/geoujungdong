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

// ─── 추가 섹션 데이터 ─────────────────────────────────────────────
const BADGES     = [".xlsx 지원", "셀병합 완벽 지원", "사진대지", "A4 인쇄 최적화", "모바일 편집", "키보드 탐색", "실시간 미리보기", "xlsx 다운로드"];
const BADGES_EN  = [".xlsx support", "Merged cells", "Photo sheets", "A4 print", "Mobile editing", "Keyboard nav", "Live preview", "xlsx download"];

const STEPS_KOR = [
  { num: "01", title: "엑셀 업로드",    desc: "기존 양식(.xlsx)을 그대로 업로드하세요.\n폰트·색상·셀병합이 모두 유지됩니다." },
  { num: "02", title: "셀 수정",        desc: "셀을 탭하면 바텀시트가 올라옵니다.\nPC에서는 키보드로 엑셀처럼 탐색하세요." },
  { num: "03", title: "출력 · 다운로드", desc: "A4 미리보기로 확인 후 바로 인쇄하거나\n수정된 xlsx 파일을 다운로드하세요." },
];
const STEPS_EN = [
  { num: "01", title: "Upload Excel",   desc: "Upload your existing .xlsx file.\nFonts, colors, merged cells all preserved." },
  { num: "02", title: "Edit cells",     desc: "Tap any cell to open the bottom sheet.\nOn desktop, navigate like Excel." },
  { num: "03", title: "Print · Save",   desc: "Preview on A4, then print or download\nthe updated xlsx file." },
];

const FEATURES_KOR = [
  { icon: "⊞",  title: "셀병합 완벽 지원",   desc: "rowSpan·colSpan 구조 그대로 렌더링.\n병합 셀이 깨지지 않습니다." },
  { icon: "📐", title: "사진대지 크기 통일", desc: "동일 형식 시트의 열 너비를 자동 통일해\n출력물 레이아웃을 일관되게 유지합니다." },
  { icon: "📱", title: "모바일 바텀시트",    desc: "터치 한 번으로 바텀시트가 올라와\n셀 값을 빠르게 입력할 수 있습니다." },
  { icon: "🖨️", title: "A4 인쇄 최적화",    desc: "모든 시트를 A4 비율로 자동 스케일해\n실제 인쇄 결과를 미리 확인합니다." },
  { icon: "⬇️", title: "xlsx 다운로드",     desc: "수정 내용이 반영된 엑셀 파일을\n즉시 로컬로 저장합니다." },
  { icon: "⌨️", title: "키보드 단축키",     desc: "방향키·Tab·F2·Ctrl+PageDown으로\n엑셀처럼 시트를 탐색합니다." },
];
const FEATURES_EN = [
  { icon: "⊞",  title: "Merged cells",        desc: "rowSpan·colSpan rendered perfectly.\nNo broken merged cells." },
  { icon: "📐", title: "Uniform layouts",      desc: "Column widths auto-synced across sheets\nfor consistent print output." },
  { icon: "📱", title: "Mobile bottom sheet",  desc: "One tap opens a bottom sheet\nfor fast cell value input." },
  { icon: "🖨️", title: "A4 print preview",    desc: "All sheets auto-scaled to A4.\nSee the exact result before printing." },
  { icon: "⬇️", title: "xlsx download",       desc: "Edited content saved immediately\nto a local xlsx file." },
  { icon: "⌨️", title: "Keyboard shortcuts",  desc: "Navigate with Arrow·Tab·F2·Ctrl+PageDown\njust like Excel." },
];

const FAQS_KOR = [
  { q: "기존 엑셀 서식 그대로 써도 되나요?",
    a: "네. xlsx 파일을 그대로 업로드하면 폰트, 색상, 셀병합, 행 높이, 열 너비가 모두 유지됩니다." },
  { q: "인쇄하면 셀이 깨지지 않나요?",
    a: "A4 기준 자동 스케일링으로 실제 인쇄 결과를 미리보기에서 확인할 수 있습니다. 전체 시트를 한 번에 출력합니다." },
  { q: "수정한 내용이 서버에 저장되나요?",
    a: "아니요. 모든 편집은 브라우저에서만 이루어지며, 다운로드 버튼을 누르면 수정된 xlsx 파일이 로컬에 저장됩니다. 서버에는 어떤 파일도 저장되지 않습니다." },
];
const FAQS_EN = [
  { q: "Can I use my existing Excel format?",
    a: "Yes. Upload any .xlsx file and fonts, colors, merged cells, row heights, and column widths are all preserved." },
  { q: "Will cells break when printing?",
    a: "No. All sheets are auto-scaled to A4 proportions. Preview the exact result before printing." },
  { q: "Is my data saved on the server?",
    a: "No. All editing happens in the browser only. The downloaded xlsx file is saved locally. Nothing is stored on the server." },
];
// ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [lang, setLang] = useState<Lang>("KOR");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
            <a className={styles.loginBtn} href="/login">
              {kor ? "로그인" : "Sign in"}
            </a>
            <a className={styles.ctaTop} href="/workspace/fill">
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
            <a className={styles.ctaHero} href="/workspace/fill">
              {kor ? "시작하기" : "Get started"}
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

      {/* ── BADGE STRIP ── */}
      <div className={styles.badgeStrip} aria-hidden>
        <div className={styles.badgeTrack}>
          {[...(kor ? BADGES : BADGES_EN), ...(kor ? BADGES : BADGES_EN)].map((b, i) => (
            <span key={i} className={styles.badge}>{b}</span>
          ))}
        </div>
      </div>

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

      {/* ── HOW IT WORKS ── */}
      <section className={styles.howRow}>
        <div className={styles.howInner}>
          <Reveal>
            <p className={styles.svcKicker}>{kor ? "사용 방법" : "How it works"}</p>
            <h2 className={styles.svcTitle}>{kor ? "3단계로 끝납니다" : "Done in 3 steps"}</h2>
          </Reveal>
          <div className={styles.howSteps}>
            {(kor ? STEPS_KOR : STEPS_EN).map((step, i) => (
              <Reveal key={i} delay={i * 0.1} className={styles.howStep}>
                <div className={styles.howNum}>{step.num}</div>
                <h3 className={styles.howStepTitle}>{step.title}</h3>
                <p className={styles.howStepDesc}>{step.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className={styles.featRow}>
        <div className={styles.featInner}>
          <Reveal>
            <p className={styles.svcKicker}>{kor ? "핵심 기능" : "Features"}</p>
            <h2 className={styles.svcTitle}>{kor ? "꼭 필요한 기능만 담았습니다" : "Only what you need"}</h2>
          </Reveal>
          <div className={styles.featGrid}>
            {(kor ? FEATURES_KOR : FEATURES_EN).map((f, i) => (
              <Reveal key={i} delay={i * 0.06} className={styles.featCard}>
                <span className={styles.featIcon}>{f.icon}</span>
                <h3 className={styles.featTitle}>{f.title}</h3>
                <p className={styles.featDesc}>{f.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className={styles.faqRow}>
        <div className={styles.faqInner}>
          <Reveal>
            <p className={styles.svcKicker}>{kor ? "자주 묻는 질문" : "FAQ"}</p>
            <h2 className={styles.svcTitle}>{kor ? "궁금한 점이 있으신가요?" : "Got questions?"}</h2>
          </Reveal>
          <div className={styles.faqList}>
            {(kor ? FAQS_KOR : FAQS_EN).map((faq, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div
                  className={cx(styles.faqItem, openFaq === i && styles.faqItemOpen)}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <div className={styles.faqQ}>
                    <span>{faq.q}</span>
                    <span className={styles.faqChevron}>{openFaq === i ? "−" : "+"}</span>
                  </div>
                  {openFaq === i && <p className={styles.faqA}>{faq.a}</p>}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className={styles.ctaRow}>
        <Reveal className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>
            {kor ? "지금 바로 시작해보세요" : "Get started today"}
          </h2>
          <p className={styles.ctaDesc}>
            {kor
              ? "업로드 하나로 안전관리비 정산을 끝내세요."
              : "One upload. All your safety docs done."}
          </p>
          <a className={styles.ctaBtn} href="/workspace/fill">
            {kor ? "무료로 시작하기" : "Start for free"}
          </a>
        </Reveal>
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
