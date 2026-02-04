"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import styles from "./HomePage.module.css";

/* ─────────────────────────────────────────────
   FAQ 데이터
───────────────────────────────────────────── */
const FAQ_DATA = [
  {
    q: "엑셀 파일 형식은 어떻게 되어야 하나요?",
    a: "xlsx, xls 모두 지원합니다. 첫 번째 행은 헤더(NO., 품명, 규격, 단위, 수량 등)로, 두 번째 행부터 품목 데이터로 인식합니다.",
  },
  {
    q: "한 번에 몇 개 품목까지 처리할 수 있나요?",
    a: "제한 없이 엑셀에 있는 모든 행을 불러올 수 있습니다. 다만 PDF 출력 시 품목당 1페이지씩 생성되므로, 필요한 품목만 선택해 출력하는 것을 권장합니다.",
  },
  {
    q: "사진은 어떤 형식을 지원하나요?",
    a: "JPG, PNG, WEBP 등 일반적인 이미지 형식을 모두 지원합니다. 각 품목당 반입/지급 사진 1장, 설치 사진 1장을 업로드할 수 있습니다.",
  },
  {
    q: "PDF 출력 템플릿을 변경할 수 있나요?",
    a: "현재는 기본 템플릿(품목 정보 + 반입/지급 사진 + 설치 사진)을 제공합니다. 추후 커스텀 템플릿 기능을 추가할 예정입니다.",
  },
  {
    q: "작업 내용이 저장되나요?",
    a: "브라우저 로컬 스토리지에 임시 저장됩니다. 브라우저를 닫아도 같은 브라우저에서 다시 열면 이전 작업을 이어갈 수 있습니다.",
  },
];

/* ─────────────────────────────────────────────
   FAQ 아코디언 아이템
───────────────────────────────────────────── */
function FaqItem({
  q,
  a,
  isOpen,
  onToggle,
  id,
}: {
  q: string;
  a: string;
  isOpen: boolean;
  onToggle: () => void;
  id: string;
}) {
  return (
    <div className={styles.faqItem}>
      <button
        type="button"
        className={styles.faqQuestion}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`faq-answer-${id}`}
        id={`faq-question-${id}`}
      >
        <span>{q}</span>
        <span className={styles.faqIcon} aria-hidden="true">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      <div
        id={`faq-answer-${id}`}
        role="region"
        aria-labelledby={`faq-question-${id}`}
        className={`${styles.faqAnswer} ${isOpen ? styles.faqAnswerOpen : ""}`}
        hidden={!isOpen}
      >
        <p>{a}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   메인 컴포넌트
───────────────────────────────────────────── */
export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = useCallback((index: number) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className={styles.page}>
      {/* ───── 헤더 ───── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-current="page">
            사진대지
          </Link>
          <nav aria-label="주요 메뉴">
            <Link href="/workspace" className={styles.navLink}>
              작업 공간
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ───── Hero 섹션 ───── */}
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.heroInner}>
            <div className={styles.heroText}>
              <h1 id="hero-heading" className={styles.h1}>
                엑셀 한 행이 곧 하나의 품목.
                <br />
                사진대지, 자동으로 완성됩니다.
              </h1>
              <p className={styles.heroSub}>
                항목별 사용내역서 엑셀을 올리고, 품목마다 반입·설치 사진만 매칭하세요.
                <br />
                별도 편집 없이 PDF 사진대지가 바로 출력됩니다.
              </p>
              {/* 파일 업로드 영역 */}
              <div className={styles.uploadArea}>
                <label className={styles.fileInputLabel}>
                  파일 선택
                  <input type="file" accept=".xlsx,.xls" className={styles.fileInput} />
                  <span className={styles.fileName}>선택된 파일 없음</span>
                </label>
                <button type="button" className={styles.uploadBtn}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  엑셀 업로드
                </button>
              </div>

              <div className={styles.heroCta}>
                <Link href="/workspace" className={styles.btnPrimary}>
                  작업 공간 열기
                </Link>
                <a href="#how-it-works" className={styles.btnSecondary}>
                  사용 방법 보기
                </a>
              </div>
            </div>

            {/* 미니 프리뷰 UI */}
            <div className={styles.heroPreview} aria-hidden="true">
              <div className={styles.miniWorkspace}>
                {/* 미니 테이블 */}
                <div className={styles.miniTable}>
                  <div className={styles.miniTableHeader}>
                    <span>NO.</span>
                    <span>품명</span>
                    <span>규격</span>
                    <span>수량</span>
                  </div>
                  <div className={styles.miniTableRow}>
                    <span>1</span>
                    <span>LED 투광기</span>
                    <span>100W</span>
                    <span>10</span>
                  </div>
                  <div className={`${styles.miniTableRow} ${styles.miniTableRowActive}`}>
                    <span>2</span>
                    <span>배전반</span>
                    <span>3상 4선</span>
                    <span>1</span>
                  </div>
                  <div className={styles.miniTableRow}>
                    <span>3</span>
                    <span>접지동봉</span>
                    <span>Φ14×1500</span>
                    <span>5</span>
                  </div>
                </div>
                {/* 미니 사진 슬롯 */}
                <div className={styles.miniPhotoSlots}>
                  <div className={styles.miniSlot}>
                    <div className={styles.miniSlotIcon}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                    </div>
                    <span className={styles.miniSlotLabel}>반입/지급</span>
                  </div>
                  <div className={`${styles.miniSlot} ${styles.miniSlotFilled}`}>
                    <div className={styles.miniSlotThumb} />
                    <span className={styles.miniSlotLabel}>설치</span>
                    <span className={styles.miniSlotCheck}>✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ───── 신뢰 요소 (Proof) ───── */}
        <section className={styles.proof} aria-label="핵심 특징">
          <div className={styles.proofInner}>
            <div className={styles.proofItem}>
              <div className={styles.proofIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10,9 9,9 8,9" />
                </svg>
              </div>
              <div className={styles.proofText}>
                <strong>엑셀 한 행 = 한 품목</strong>
                <span>행 단위로 품목 자동 인식</span>
              </div>
            </div>
            <div className={styles.proofItem}>
              <div className={styles.proofIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
              <div className={styles.proofText}>
                <strong>사진 슬롯 매핑</strong>
                <span>반입/지급 · 설치 사진 분리</span>
              </div>
            </div>
            <div className={styles.proofItem}>
              <div className={styles.proofIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <path d="M12 18v-6" />
                  <path d="M9 15l3 3 3-3" />
                </svg>
              </div>
              <div className={styles.proofText}>
                <strong>PDF 자동 출력</strong>
                <span>템플릿 기반 즉시 다운로드</span>
              </div>
            </div>
          </div>
        </section>

        {/* ───── 기능 카드 ───── */}
        <section className={styles.features} aria-labelledby="features-heading">
          <div className={styles.featuresInner}>
            <h2 id="features-heading" className={styles.h2}>
              주요 기능
            </h2>
            <div className={styles.featureGrid}>
              <article className={styles.featureCard}>
                <div className={styles.featureIconWrap}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>엑셀 업로드</h3>
                <p className={styles.featureDesc}>
                  xlsx/xls 파일을 드래그하거나 선택하면 품목 목록이 자동으로 불러와집니다.
                </p>
              </article>
              <article className={styles.featureCard}>
                <div className={styles.featureIconWrap}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="9,11 12,14 22,4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>품목 선택</h3>
                <p className={styles.featureDesc}>
                  출력할 품목만 체크박스로 선택하세요. 전체 선택/해제도 한 번에 가능합니다.
                </p>
              </article>
              <article className={styles.featureCard}>
                <div className={styles.featureIconWrap}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>사진 매핑</h3>
                <p className={styles.featureDesc}>
                  각 품목에 반입/지급 사진, 설치 사진을 슬롯에 드래그하여 매칭합니다.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ───── Steps ───── */}
        <section className={styles.steps} id="how-it-works" aria-labelledby="steps-heading">
          <div className={styles.stepsInner}>
            <h2 id="steps-heading" className={styles.h2}>
              사용 방법
            </h2>
            <ol className={styles.stepList}>
              <li className={styles.stepItem}>
                <span className={styles.stepNumber}>1</span>
                <div className={styles.stepContent}>
                  <strong>엑셀 파일 업로드</strong>
                  <span>품목이 정리된 사용내역서 엑셀을 업로드합니다.</span>
                </div>
              </li>
              <li className={styles.stepItem}>
                <span className={styles.stepNumber}>2</span>
                <div className={styles.stepContent}>
                  <strong>출력할 품목 선택</strong>
                  <span>목록에서 사진대지를 만들 품목을 선택합니다.</span>
                </div>
              </li>
              <li className={styles.stepItem}>
                <span className={styles.stepNumber}>3</span>
                <div className={styles.stepContent}>
                  <strong>사진 업로드 및 매칭</strong>
                  <span>각 품목의 반입/지급, 설치 슬롯에 사진을 넣습니다.</span>
                </div>
              </li>
              <li className={styles.stepItem}>
                <span className={styles.stepNumber}>4</span>
                <div className={styles.stepContent}>
                  <strong>PDF 출력</strong>
                  <span>버튼 클릭으로 사진대지 PDF를 다운로드합니다.</span>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* ───── FAQ ───── */}
        <section className={styles.faq} aria-labelledby="faq-heading">
          <div className={styles.faqInner}>
            <h2 id="faq-heading" className={styles.h2}>
              자주 묻는 질문
            </h2>
            <div className={styles.faqList}>
              {FAQ_DATA.map((item, idx) => (
                <FaqItem
                  key={idx}
                  q={item.q}
                  a={item.a}
                  isOpen={openFaq === idx}
                  onToggle={() => toggleFaq(idx)}
                  id={String(idx)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ───── 최종 CTA ───── */}
        <section className={styles.finalCta} aria-labelledby="final-cta-heading">
          <div className={styles.finalCtaInner}>
            <h2 id="final-cta-heading" className={styles.h2Center}>
              지금 바로 시작하세요
            </h2>
            <p className={styles.finalCtaSub}>
              엑셀 업로드부터 PDF 출력까지, 한 화면에서 완료됩니다.
            </p>
            <Link href="/workspace" className={styles.btnPrimary}>
              작업 공간 열기
            </Link>
          </div>
        </section>
      </main>

      {/* ───── 푸터 ───── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerCopy}>© 2025 사진대지 자동 출력</span>
          <Link href="/workspace" className={styles.footerLink}>
            작업 공간
          </Link>
        </div>
      </footer>
    </div>
  );
}
