"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Download,
  FileSpreadsheet,
  FileText,
  Keyboard,
  LayoutGrid,
  Link2,
  Printer,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TableCellsMerge,
} from "lucide-react";
import { LoginFormPanel } from "@/components/auth/LoginFormPanel";
import { safeNextPath } from "@/lib/safeNextPath";
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
    labelKor: "반입 사진",
    labelEng: "Receiving",
    alt: "반입 사진 예시",
    variant: "before" as const,
  },
  {
    src: "https://picsum.photos/seed/site-after-a/300/300",
    labelKor: "지급 사진",
    labelEng: "Handout",
    alt: "지급 사진 예시",
    variant: "after" as const,
  },
  {
    src: "https://picsum.photos/seed/site-before-b/300/300",
    labelKor: "반입 사진",
    labelEng: "Receiving",
    alt: "반입 사진 예시 2",
    variant: "before" as const,
  },
  {
    src: "https://picsum.photos/seed/site-after-b/300/300",
    labelKor: "지급 사진",
    labelEng: "Handout",
    alt: "지급 사진 예시 2",
    variant: "after" as const,
  },
] as const;
// ─────────────────────────────────────────────

const kakaoEase = [0, 0.21, 0.03, 1.01] as const;
const springEase = [0.16, 1, 0.3, 1] as const;

function WordReveal({
  children,
  baseDelay = 0,
}: {
  children: string;
  baseDelay?: number;
}) {
  const parts = children.split(/(\s+)/);
  let wordIdx = 0;
  return (
    <>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return <span key={i}>&nbsp;</span>;
        const delay = baseDelay + wordIdx++ * 0.11;
        return (
          <span key={i} className={styles.wordWrap}>
            <motion.span
              className={styles.wordInner}
              initial={{ y: "108%", opacity: 0, filter: "blur(10px)" }}
              animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.65, ease: springEase, delay }}
            >
              {part}
            </motion.span>
          </span>
        );
      })}
    </>
  );
}

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

  /* fill 화면 ItemListView(항목별세부내역)과 동일한 NO·품명·금액 구조 */
  const EXCEL_SECTION = {
    catNo: "1",
    title: kor ? "안전시설·보호구" : "Safety facilities",
    sum: "390,000",
    count: kor ? "3건" : "3 items",
  };
  const EXCEL_ROWS = [
    { no: "1", name: kor ? "소화기 설치" : "Fire extinguisher", amt: "200,000" },
    { no: "2", name: kor ? "안전모 지급" : "Safety helmets", amt: "150,000" },
    { no: "3", name: kor ? "안전표지판" : "Safety signs", amt: "40,000" },
  ];

  return (
    <div className={cx(styles.mockCard, styles.mockCardStretch)}>
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
            <div className={cx(styles.mockContent, styles.mockContentSlide)}>
              <div className={styles.mockPhotoHeader}>
                <span className={styles.mockPhotoHeaderLabel}>{kor ? "항목명" : "Item"}</span>
                <span className={styles.mockPhotoHeaderBadge}>{kor ? "소화기 설치" : "Fire extinguisher"}</span>
              </div>
              <div className={styles.mockPhotoGridOuter}>
                <div className={cx(styles.mockPhotoGrid, styles.mockPhotoGridStretch)}>
                {EVIDENCE_PHOTOS.map((photo, i) => {
                  const isAfter = photo.variant === "after";
                  return (
                    <div key={i} className={styles.mockPhotoSlot}>
                      <Image
                        src={photo.src}
                        alt={photo.alt}
                        fill
                        sizes="(max-width: 480px) 160px, 180px"
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
          </div>

          {/* Slide 1 — 엑셀 입력 */}
          <div className={styles.slidePane}>
            <div className={cx(styles.mockContent, styles.mockContentSlide)}>
              <div className={styles.excelUploadBtn}>
                <FileSpreadsheet
                  className={styles.excelUploadLucide}
                  size={18}
                  strokeWidth={1.5}
                  aria-hidden
                />
                {kor ? "엑셀 파일 자동 가져오기" : "Import from Excel"}
              </div>
              <div className={styles.excelItemPanel}>
                <div className={styles.excelSectionBar}>
                  <div className={styles.excelSectionLeft}>
                    <span className={styles.excelCatNum}>{EXCEL_SECTION.catNo}</span>
                    <span className={styles.excelCatTitle}>{EXCEL_SECTION.title}</span>
                  </div>
                  <div className={styles.excelSectionRight}>
                    <span className={styles.excelCatCount}>{EXCEL_SECTION.count}</span>
                    <span className={styles.excelCatSum}>{EXCEL_SECTION.sum}</span>
                  </div>
                </div>
                <div className={styles.excelTableWrap}>
                  <table className={styles.excelItemsTable}>
                    <colgroup>
                      <col className={styles.excelColNo} />
                      <col />
                      <col className={styles.excelColAmt} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">NO</th>
                        <th scope="col">{kor ? "품명" : "Item"}</th>
                        <th scope="col">{kor ? "금액" : "Amount"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {EXCEL_ROWS.map((row) => (
                        <tr key={row.no}>
                          <td className={styles.excelTdNo}>{row.no}</td>
                          <td className={styles.excelTdName}>{row.name}</td>
                          <td className={styles.excelTdAmt}>{row.amt}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className={styles.excelTotalRow}>
                        <td colSpan={2}>{kor ? "소계" : "Subtotal"}</td>
                        <td>{EXCEL_SECTION.sum}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className={styles.excelAddRowMock} aria-hidden>
                  + {kor ? "항목 추가" : "Add item"}
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

/** Lucide 아이콘 — 핵심 기능 그리드 (한·영 공통 순서) */
const FEATURE_DEFS: Array<{
  Icon: LucideIcon;
  titleKor: string;
  titleEng: string;
  descKor: string;
  descEng: string;
}> = [
  {
    Icon: TableCellsMerge,
    titleKor: "셀병합 완벽 지원",
    titleEng: "Merged cells",
    descKor: "rowSpan·colSpan 구조 그대로 렌더링.\n병합 셀이 깨지지 않습니다.",
    descEng: "rowSpan·colSpan rendered perfectly.\nNo broken merged cells.",
  },
  {
    Icon: LayoutGrid,
    titleKor: "사진대지 크기 통일",
    titleEng: "Uniform layouts",
    descKor: "동일 형식 시트의 열 너비를 자동 통일해\n출력물 레이아웃을 일관되게 유지합니다.",
    descEng: "Column widths auto-synced across sheets\nfor consistent print output.",
  },
  {
    Icon: Smartphone,
    titleKor: "모바일 바텀시트",
    titleEng: "Mobile bottom sheet",
    descKor: "터치 한 번으로 바텀시트가 올라와\n셀 값을 빠르게 입력할 수 있습니다.",
    descEng: "One tap opens a bottom sheet\nfor fast cell value input.",
  },
  {
    Icon: Printer,
    titleKor: "A4 인쇄 최적화",
    titleEng: "A4 print preview",
    descKor: "모든 시트를 A4 비율로 자동 스케일해\n실제 인쇄 결과를 미리 확인합니다.",
    descEng: "All sheets auto-scaled to A4.\nSee the exact result before printing.",
  },
  {
    Icon: Download,
    titleKor: "xlsx 다운로드",
    titleEng: "xlsx download",
    descKor: "수정 내용이 반영된 엑셀 파일을\n즉시 로컬로 저장합니다.",
    descEng: "Edited content saved immediately\nto a local xlsx file.",
  },
  {
    Icon: Keyboard,
    titleKor: "키보드 단축키",
    titleEng: "Keyboard shortcuts",
    descKor: "방향키·Tab·F2·Ctrl+PageDown으로\n엑셀처럼 시트를 탐색합니다.",
    descEng: "Navigate with Arrow·Tab·F2·Ctrl+PageDown\njust like Excel.",
  },
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
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [heroVideoReady, setHeroVideoReady] = useState(false);
  const [splashVisible, setSplashVisible] = useState(false);
  const [logoVisible, setLogoVisible] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  /** 로고 페이드아웃 애니 완료 후에만 navigate (빈 정적 구간 제거) */
  const splashExitPendingRef = useRef(false);
  const splashHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const kor = lang === "KOR";

  const handleStart = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (splashHoldTimerRef.current) {
      clearTimeout(splashHoldTimerRef.current);
      splashHoldTimerRef.current = null;
    }
    splashExitPendingRef.current = false;
    setLogoVisible(true);
    setSplashVisible(true);
    void router.prefetch("/workspace/fill");
    const holdMs = reduceMotion ? 480 : 1780;
    splashHoldTimerRef.current = setTimeout(() => {
      splashHoldTimerRef.current = null;
      if (reduceMotion) {
        setLogoVisible(false);
        setTimeout(() => router.push("/workspace/fill"), 50);
        return;
      }
      splashExitPendingRef.current = true;
      setLogoVisible(false);
    }, holdMs);
  }, [router, reduceMotion]);

  useEffect(() => {
    return () => {
      if (splashHoldTimerRef.current) clearTimeout(splashHoldTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // 일부 모바일에서 muted autoplay가 지연될 때 보조
    const tryPlay = () => {
      void v.play().catch(() => {});
    };
    tryPlay();
    v.addEventListener("canplay", tryPlay, { once: true });

    // 네트워크가 느려 canplay/loadedData가 늦게 오면 2s 후 무조건 표시
    const fallback = setTimeout(() => setHeroVideoReady(true), 2000);

    return () => {
      v.removeEventListener("canplay", tryPlay);
      clearTimeout(fallback);
    };
  }, []);

  return (
    <div className={styles.page}>

      {/* ── SPLASH OVERLAY ── */}
      <AnimatePresence>
        {splashVisible && (
          <motion.div
            className={styles.splash}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.48, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <motion.img
              src="/logo1.png"
              alt="safetycost"
              className={styles.splashLogo}
              initial={{ opacity: 0, scale: 0.88, filter: "blur(12px)" }}
              animate={logoVisible
                ? { opacity: 1, scale: 1, filter: "blur(0px)" }
                : { opacity: 0, scale: 0.965, filter: "blur(6px)" }
              }
              transition={
                logoVisible
                  ? {
                      duration: 0.95,
                      ease: [0.2, 0.85, 0.35, 1],
                      delay: 0.16,
                    }
                  : {
                      /* 사라짐: 더 길게·끝으로 갈수록 부드럽게 */
                      duration: 0.88,
                      ease: [0.22, 0.61, 0.36, 1],
                      delay: 0,
                    }
              }
              onAnimationComplete={() => {
                if (splashExitPendingRef.current) {
                  splashExitPendingRef.current = false;
                  router.push("/workspace/fill");
                }
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOPBAR ── */}
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            {/* public 정적 파일은 <img>로 직접 로드 (배포 시 파일이 있어야 함) */}
            <img
              src="/logo1.png"
              alt="safetycost"
              className={styles.brandLogoImg}
              width={400}
              height={80}
              decoding="async"
              fetchPriority="high"
            />
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
            <button
              type="button"
              className={styles.loginBtn}
              onClick={() => setLoginOpen(true)}
            >
              {kor ? "로그인" : "Sign in"}
            </button>
            <a className={styles.ctaTop} href="/workspace/fill" onClick={handleStart}>
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
            data-ready={heroVideoReady ? "true" : "false"}
            src="/main.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedMetadata={() => setHeroVideoReady(true)}
            onLoadedData={() => setHeroVideoReady(true)}
            onCanPlay={() => setHeroVideoReady(true)}
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut", delay: 0.28 }}
          >
            {kor ? (
              <>
                <WordReveal baseDelay={0.32}>안전관리비 정산을,</WordReveal>
                <br />
                <WordReveal baseDelay={0.54}>체계적으로 관리합니다.</WordReveal>
              </>
            ) : (
              <>
                <WordReveal baseDelay={0.32}>Evidence docs,</WordReveal>
                <br />
                <WordReveal baseDelay={0.54}>automated with ease</WordReveal>
              </>
            )}
          </motion.h1>

          <motion.div
            className={styles.heroCtas}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.5 }}
          >
            <a className={styles.ctaHero} href="/workspace/fill" onClick={handleStart}>
              {kor ? "시작하기" : "Get started"}
            </a>
            {/*
              배경 영상 음소거 토글(🔇/🔊) 버튼 제거:
              배포 버전 홈 화면에 불필요한 UI로 보여 사용자 혼선을 유발함.
            */}
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
              <div className={cx(styles.mockContent, styles.mockContentEnterprise)}>
                <div className={styles.entDocHeader}>
                  <Building2 className={styles.entDocHeaderIcon} size={16} strokeWidth={1.5} aria-hidden />
                  <div className={styles.entDocHeaderText}>
                    <div className={styles.entDocHeaderLines}>
                      <span className={styles.entDocBadge}>{kor ? "공사 · 정산" : "Project · settlement"}</span>
                      <span className={styles.entDocTitle}>
                        {kor ? "안전관리비 사용내역서" : "Safety management cost — usage"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.entMetaGrid}>
                  <div className={styles.entMetaItem}>
                    <span className={styles.entMetaKey}>{kor ? "문서번호" : "Document no."}</span>
                    <span className={styles.entMetaVal}>SC-2025-0318</span>
                  </div>
                  <div className={styles.entMetaItem}>
                    <span className={styles.entMetaKey}>{kor ? "작성일" : "Date"}</span>
                    <span className={styles.entMetaVal}>2025.03.18</span>
                  </div>
                  <div className={styles.entMetaItem}>
                    <span className={styles.entMetaKey}>{kor ? "현장명" : "Site"}</span>
                    <span className={styles.entMetaVal}>{kor ? "○○현장" : "Site A-12"}</span>
                  </div>
                </div>
                <div className={styles.entSectionRule} />
                <p className={styles.entSectionTitle}>
                  {kor ? "Ⅰ. 항목별 세부내역" : "Ⅰ. Itemized expenditure"}
                </p>
                <div className={styles.entTable} role="presentation">
                  <div className={styles.entThead}>
                    <span>{kor ? "품목" : "Item"}</span>
                    <span>{kor ? "수량" : "Qty"}</span>
                    <span>{kor ? "금액" : "Amount"}</span>
                    <span>{kor ? "증빙" : "Ref."}</span>
                  </div>
                  <div className={styles.entTbody}>
                    <div className={styles.entTr}>
                      <span>{kor ? "안전시설·보호구" : "Safety equipment"}</span>
                      <span className={styles.entNum}>12</span>
                      <span className={styles.entNum}>390,000</span>
                      <span className={styles.entPill}>NO.1</span>
                    </div>
                    <div className={styles.entTr}>
                      <span>{kor ? "안전교육·홍보" : "Training & PR"}</span>
                      <span className={styles.entNum}>4</span>
                      <span className={styles.entNum}>128,000</span>
                      <span className={styles.entPill}>NO.2</span>
                    </div>
                  </div>
                </div>
                <div className={styles.entFooter}>
                  <span className={styles.entFooterLeft}>
                    <span className={styles.entDot} aria-hidden />
                    {kor ? "서식 검증 · 병합셀 유지" : "Schema OK · merges preserved"}
                  </span>
                  <span className={styles.entFooterRight}>Microsoft Excel · .xlsx</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── SERVICE 2: 사진 증빙 (역방향) ── */}
      <section className={cx(styles.svcRow, styles.svcRowGray, styles.svcRowEvidence)} aria-labelledby="svc-evidence-heading">
        <div className={cx(styles.svcInner, styles.svcInnerReverse, styles.svcInnerMediaTall)}>
          <Reveal className={styles.svcText}>
            <p className={styles.svcKicker}>{kor ? "사진 증빙" : "Photo evidence"}</p>
            <h2 className={styles.svcTitle} id="svc-evidence-heading">
              {kor
                ? <>항목별 사진 첨부,<br /><mark className={styles.hl}>규칙대로</mark> 딱 맞게</>
                : <>Photo per item,<br /><mark className={styles.hl}>exactly right</mark></>
              }
            </h2>
            <p className={styles.svcDesc}>
              {kor
                ? "반입·지급 사진 슬롯이 클라이언트와 서버에서 이중으로 검증돼 실수를 원천 차단합니다. (임시)"
                : "Receiving / handout photo slots are validated client + server. Mistakes blocked before they happen. (임시)"
              }
            </p>
            <ul className={styles.svcEvidencePoints} aria-label={kor ? "사진 증빙 핵심" : "Photo evidence highlights"}>
              <li className={styles.svcEvidencePoint}>
                <span className={styles.svcEvidenceIconWrap} aria-hidden>
                  <ShieldCheck className={styles.svcEvidenceIcon} size={22} strokeWidth={1.65} />
                </span>
                <div className={styles.svcEvidenceBody}>
                  <strong className={styles.svcEvidenceTitle}>
                    {kor ? "선제 검증" : "Up-front validation"}
                  </strong>
                  <span className={styles.svcEvidenceSub}>
                    {kor
                      ? "업로드 직전 슬롯·라벨 규칙을 화면에서 먼저 확인합니다."
                      : "Slot and label rules are checked on screen before upload."}
                  </span>
                </div>
              </li>
              <li className={styles.svcEvidencePoint}>
                <span className={styles.svcEvidenceIconWrap} aria-hidden>
                  <RefreshCw className={styles.svcEvidenceIcon} size={22} strokeWidth={1.65} />
                </span>
                <div className={styles.svcEvidenceBody}>
                  <strong className={styles.svcEvidenceTitle}>
                    {kor ? "이중 검증" : "Dual validation"}
                  </strong>
                  <span className={styles.svcEvidenceSub}>
                    {kor
                      ? "브라우저와 서버가 동일 기준으로 재검증해 불일치를 차단합니다."
                      : "Browser and server re-check with the same rules to block mismatches."}
                  </span>
                </div>
              </li>
              <li className={styles.svcEvidencePoint}>
                <span className={styles.svcEvidenceIconWrap} aria-hidden>
                  <Link2 className={styles.svcEvidenceIcon} size={22} strokeWidth={1.65} />
                </span>
                <div className={styles.svcEvidenceBody}>
                  <strong className={styles.svcEvidenceTitle}>
                    {kor ? "NO. 고정 매핑" : "Fixed NO. mapping"}
                  </strong>
                  <span className={styles.svcEvidenceSub}>
                    {kor
                      ? "항목별 세부내역의 NO.와 사진대지 블록이 1:1로 맞물립니다."
                      : "Item-detail NO. lines up 1:1 with photo sheet blocks."}
                  </span>
                </div>
              </li>
            </ul>
            <p className={styles.svcEvidenceFootnote}>
              {kor
                ? "엑셀 서식을 바꾸지 않고, 기존 양식 흐름을 그대로 따릅니다."
                : "Keeps your existing Excel form flow—no template redesign required."}
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
              <div className={cx(styles.mockContent, styles.mockContentPreviewDark)}>
                {/* 모바일: 시트 탭 + 반입/지급 슬롯 힌트 */}
                <div className={styles.previewMockMobile}>
                  <div className={styles.previewMockMobileTop}>
                    <Smartphone className={styles.previewMockIcon} size={16} strokeWidth={1.5} aria-hidden />
                    <span>{kor ? "모바일에서 그대로" : "Identical on mobile"}</span>
                  </div>
                  <div className={styles.previewMockTabs} role="presentation">
                    <span className={styles.previewMockTabActive}>
                      {kor ? "항목별세부내역" : "Item details"}
                    </span>
                    <span className={styles.previewMockTab}>{kor ? "사진대지" : "Photo sheet"}</span>
                  </div>
                  <div className={styles.previewMockThumbs}>
                    <div className={styles.previewMockThumb}>
                      <span className={styles.previewMockThumbLabel}>{kor ? "반입 사진" : "Receiving"}</span>
                    </div>
                    <div className={cx(styles.previewMockThumb, styles.previewMockThumbAccent)}>
                      <span className={styles.previewMockThumbLabel}>{kor ? "지급 사진" : "Handout"}</span>
                    </div>
                  </div>
                </div>
                {/* A4 출력물 윤곽 */}
                <div className={styles.previewMockA4}>
                  <div className={styles.previewMockA4Chrome}>
                    <FileText className={styles.previewMockIcon} size={15} strokeWidth={1.5} aria-hidden />
                    <span>{kor ? "A4 인쇄 미리보기" : "A4 print preview"}</span>
                    <Printer className={styles.previewMockIcon} size={15} strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className={styles.previewMockA4Body}>
                    <div className={styles.previewMockA4TitleBar} />
                    <div className={styles.previewMockA4Lines}>
                      <div className={styles.previewMockA4Line} />
                      <div className={styles.previewMockA4Line} />
                      <div className={styles.previewMockA4Line} />
                      <div className={cx(styles.previewMockA4Line, styles.previewMockA4LineShort)} />
                    </div>
                    <p className={styles.previewMockA4Meta}>
                      {kor ? "시트 자동 스케일 · 실제 출력과 동일 비율" : "Auto-scaled sheets · print ratio"}
                    </p>
                  </div>
                </div>
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
            {FEATURE_DEFS.map((f, i) => {
              const Icon = f.Icon;
              return (
                <Reveal key={i} delay={i * 0.06} className={styles.featCard}>
                  <div className={styles.featIconWrap}>
                    <Icon
                      className={styles.featLucideIcon}
                      size={24}
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </div>
                  <h3 className={styles.featTitle}>{kor ? f.titleKor : f.titleEng}</h3>
                  <p className={styles.featDesc}>{kor ? f.descKor : f.descEng}</p>
                </Reveal>
              );
            })}
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
          <a className={styles.ctaBtn} href="/workspace/fill" onClick={handleStart}>
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

      {loginOpen && (
        <LoginFormPanel
          variant="dialog"
          nextPath={safeNextPath(null)}
          onClose={() => setLoginOpen(false)}
          closeLabel={kor ? "닫기" : "Close"}
        />
      )}
    </div>
  );
}
