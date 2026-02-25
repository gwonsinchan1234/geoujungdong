"use client";

/**
 * Premium white landing (/home)
 * - Google-ish minimal, high typography, strong spacing system
 * - Full-bleed hero video background (optional), with subtle overlay
 * - Sections: consistent layout + reveal motion
 * - Mobile-first: safe tap targets, readable scale
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import styles from "./page.module.css";

type Lang = "KOR" | "ENG";

const easeOut = [0.16, 1, 0.3, 1] as const;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function useReducedMotionSafe() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReduced(!!mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
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
      initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.7, ease: easeOut, delay }}
    >
      {children}
    </motion.div>
  );
}

type Feature = {
  id: string;
  label: string;
  title: string;
  desc: string;
  bullets: string[];
};

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

  const brandEN = "Safety Management Cost Automation System"; // 요청 1
  const heroTitle = "Automate Safety Cost Evidence"; // 임시
  const heroSubtitle =
    "Upload Excel, map items, attach photos, and generate consistent evidence—fast and audit-ready."; // 임시

  const features: Feature[] = useMemo(
    () => [
      {
        id: "f1",
        label: "Import",
        title: "Excel → Items, normalized.",
        desc: "Templates vary. We detect headers, normalize fields, and build stable item rows. (임시)",
        bullets: ["Header detection", "Robust parsing", "No template lock-in"],
      },
      {
        id: "f2",
        label: "Policy",
        title: "Slot rules, enforced twice.",
        desc: "Incoming/Install slots are enforced on client + server to block mistakes. (임시)",
        bullets: ["SSOT rules", "Double validation", "No over-uploads"],
      },
      {
        id: "f3",
        label: "Preview",
        title: "Mobile-first evidence preview.",
        desc: "One row = one item. Photos never mix. Preview instantly on mobile. (임시)",
        bullets: ["Clean UX", "Fast load", "Reliable mapping"],
      },
    ],
    []
  );

  return (
    <div className={styles.page}>
      {/* Topbar */}
      <header className={styles.topbar}>
        <div className={styles.container}>
          <div className={styles.topbarInner}>
            <div className={styles.brand}>
              <div className={styles.logo} aria-hidden />
              <div className={styles.brandText}>
                <div className={styles.brandName}>{brandEN}</div>
                <div className={styles.brandSub}>Evidence automation platform</div>
              </div>
            </div>

            <nav className={styles.nav}>
              <a className={styles.navLink} href="#features">
                Features
              </a>
              <a className={styles.navLink} href="#workflow">
                Workflow
              </a>
              <a className={styles.navLink} href="#footer">
                Policy
              </a>

              <div className={styles.langGroup} role="group" aria-label="Language">
                <button
                  type="button"
                  className={cx(styles.langBtn, lang === "KOR" && styles.langBtnActive)}
                  onClick={() => setLang("KOR")}
                >
                  KOR
                </button>
                <button
                  type="button"
                  className={cx(styles.langBtn, lang === "ENG" && styles.langBtnActive)}
                  onClick={() => setLang("ENG")}
                >
                  ENG
                </button>
              </div>

              <a className={styles.ctaTop} href="#">
                Get started <span className={styles.dim}>(임시)</span>
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className={styles.hero} aria-label="Hero">
        <div className={styles.heroBg} aria-hidden>
          <video
            ref={videoRef}
            className={styles.heroVideo}
            src="/intro.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          <div className={styles.heroOverlay} />
          <div className={styles.heroGrain} />
        </div>

        <div className={styles.container}>
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <Reveal className={styles.heroKicker} delay={0.02}>
                {lang === "KOR" ? "안전관리비 자동화 시스템" : "Safety Cost Automation System"}{" "}
                <span className={styles.dim}>(임시)</span>
              </Reveal>

              <Reveal className={styles.heroTitle} delay={0.06}>
                {heroTitle} <span className={styles.dim}>(임시)</span>
              </Reveal>

              <Reveal className={styles.heroSubtitle} delay={0.1}>
                {heroSubtitle} <span className={styles.dim}>(임시)</span>
              </Reveal>

              <Reveal className={styles.heroCtas} delay={0.14}>
                <a className={styles.primaryBtn} href="#">
                  Start <span className={styles.dim}>(임시)</span>
                </a>
                <a className={styles.secondaryBtn} href="#workflow">
                  See workflow
                </a>

                <button
                  type="button"
                  className={styles.muteBtn}
                  onClick={toggleMute}
                  aria-label="Toggle video sound"
                  title="Toggle video sound"
                  disabled={!videoReady}
                >
                  {videoReady ? (isMuted ? "Sound on" : "Sound off") : "Video not ready"}
                </button>
              </Reveal>

              <Reveal className={styles.heroBadges} delay={0.18}>
                <div className={styles.badge}>Excel</div>
                <div className={styles.badge}>Item mapping</div>
                <div className={styles.badge}>Photo evidence</div>
                <div className={styles.badge}>Mobile preview</div>
              </Reveal>
            </div>

            <div className={styles.heroPanel}>
              <div className={styles.panelCard}>
                <div className={styles.panelTop}>
                  <div className={styles.dot} />
                  <div className={styles.dot} />
                  <div className={styles.dot} />
                  <div className={styles.panelChip}>
                    Live preview <span className={styles.dim}>(임시)</span>
                  </div>
                </div>

                <div className={styles.panelBody}>
                  <div className={styles.panelTitle}>Evidence sheet preview</div>
                  <div className={styles.panelDesc}>
                    Real UI screenshots will go here. For now, we show a premium mock. <span className={styles.dim}>(임시)</span>
                  </div>

                  <div className={styles.panelMock}>
                    <div className={styles.mockRow} />
                    <div className={styles.mockRow} />
                    <div className={styles.mockRowShort} />
                    <div className={styles.mockGrid} />
                  </div>
                </div>
              </div>

              <div className={styles.panelNote}>
                {videoReady ? "Background video enabled." : "Place /public/intro.mp4 to enable video."}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.scrollHint} aria-hidden>
          <div className={styles.scrollPill}>Scroll</div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className={styles.section} aria-label="Features">
        <div className={styles.container}>
          <Reveal className={styles.sectionHead}>
            <div className={styles.sectionKicker}>Features</div>
            <h2 className={styles.sectionTitle}>Designed for speed, consistency, and clarity.</h2>
            <p className={styles.sectionSub}>
              Minimal UI, strict policies, and stable output—so your evidence quality stays consistent. <span className={styles.dim}>(임시)</span>
            </p>
          </Reveal>

          <div className={styles.cards}>
            {features.map((f, i) => (
              <Reveal key={f.id} delay={0.02 + i * 0.05}>
                <article className={styles.card}>
                  <div className={styles.cardLabel}>{f.label}</div>
                  <h3 className={styles.cardTitle}>
                    {f.title} <span className={styles.dim}>(임시)</span>
                  </h3>
                  <p className={styles.cardDesc}>{f.desc}</p>
                  <ul className={styles.cardList}>
                    {f.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section id="workflow" className={styles.sectionAlt} aria-label="Workflow">
        <div className={styles.container}>
          <div className={styles.split}>
            <Reveal className={styles.splitLeft}>
              <div className={styles.sectionKicker}>Workflow</div>
              <h2 className={styles.sectionTitle}>A clean, repeatable pipeline.</h2>
              <p className={styles.sectionSub}>
                Excel upload → item selection → photo matching → evidence preview. Simple steps, predictable result. <span className={styles.dim}>(임시)</span>
              </p>

              <div className={styles.steps}>
                <div className={styles.step}>
                  <div className={styles.stepNum}>1</div>
                  <div className={styles.stepBody}>
                    <div className={styles.stepTitle}>Upload Excel</div>
                    <div className={styles.stepDesc}>Detect headers and normalize rows. (임시)</div>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNum}>2</div>
                  <div className={styles.stepBody}>
                    <div className={styles.stepTitle}>Select item</div>
                    <div className={styles.stepDesc}>Dropdown + typing, fast and stable. (임시)</div>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNum}>3</div>
                  <div className={styles.stepBody}>
                    <div className={styles.stepTitle}>Attach photos</div>
                    <div className={styles.stepDesc}>Slots enforced twice: UI + API. (임시)</div>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNum}>4</div>
                  <div className={styles.stepBody}>
                    <div className={styles.stepTitle}>Preview evidence</div>
                    <div className={styles.stepDesc}>Mobile-first, consistent layout. (임시)</div>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal className={styles.splitRight} delay={0.08}>
              <div className={styles.workflowMock}>
                <div className={styles.workflowHeader}>
                  <div className={styles.workflowChip}>Evidence Builder</div>
                  <div className={styles.workflowChip}>Mobile-ready</div>
                </div>
                <div className={styles.workflowBody}>
                  <div className={styles.wRow} />
                  <div className={styles.wRow} />
                  <div className={styles.wRow} />
                  <div className={styles.wRowShort} />
                  <div className={styles.wCanvas} />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="footer" className={styles.footer} aria-label="Footer">
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <div className={styles.footerLeft}>© {new Date().getFullYear()} {brandEN}</div>
            <div className={styles.footerLinks}>
              <a href="#">Terms <span className={styles.dim}>(임시)</span></a>
              <a href="#">Privacy <span className={styles.dim}>(임시)</span></a>
              <a href="#">Related sites <span className={styles.dim}>(임시)</span></a>
              <a href="#">Download <span className={styles.dim}>(임시)</span></a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}