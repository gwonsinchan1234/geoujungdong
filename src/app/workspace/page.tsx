"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./HubPage.module.css";

type RecentItem = {
  path: string;
  label: string;
  time: number;
};

const RECENT_KEY = "workspace_recent";

function saveRecent(path: string, label: string) {
  try {
    const prev: RecentItem[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    const filtered = prev.filter((r) => r.path !== path);
    const next = [{ path, label, time: Date.now() }, ...filtered].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function loadRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

const FEATURES = [
  {
    path: "/workspace/fill",
    label: "엑셀 편집기",
    desc: "현장 서류를 모바일에서 바로 수정·저장",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  {
    path: "/workspace/photo",
    label: "사진대지",
    desc: "안전관리비 증빙 사진 정리 및 인쇄",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M8.5 5V3.5A1.5 1.5 0 0 1 10 2h4a1.5 1.5 0 0 1 1.5 1.5V5" />
      </svg>
    ),
    color: "#2563eb",
    bg: "#eff6ff",
  },
  {
    path: "/workspace/attendance",
    label: "출결 관리",
    desc: "근태 데이터 업로드 및 공수 자동 집계",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <polyline points="9 16 11 18 15 14" />
      </svg>
    ),
    color: "#7c3aed",
    bg: "#f5f3ff",
  },
  {
    path: "/workspace/giseong",
    label: "기성 검증",
    desc: "노무 공수 기반 기성 금액 자동 산출",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    ),
    color: "#ea580c",
    bg: "#fff7ed",
  },
  {
    path: "/workspace/output",
    label: "월간 출력",
    desc: "월별 근무표 PNG·인쇄 출력",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
    ),
    color: "#0891b2",
    bg: "#ecfeff",
  },
];

export default function WorkspaceHub() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? null;
      setUserName(email ? email.split("@")[0] : null);
    });
    setRecent(loadRecent());
  }, []);

  function handleNav(path: string, label: string) {
    saveRecent(path, label);
    router.push(path);
  }

  return (
    <div className={styles.hub}>
      <header className={styles.header}>
        <span className={styles.logo}>거우중동</span>
        <div className={styles.headerRight}>
          {userName && <span className={styles.userChip}>{userName}</span>}
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1 className={styles.title}>
            {userName ? `${userName}님, 안녕하세요` : "안녕하세요"}
          </h1>
          <p className={styles.subtitle}>오늘 어떤 작업을 하시겠어요?</p>
        </div>

        {recent.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>최근 작업</h2>
            <div className={styles.recentList}>
              {recent.map((r) => (
                <button
                  key={r.path}
                  type="button"
                  className={styles.recentChip}
                  onClick={() => handleNav(r.path, r.label)}
                >
                  <span className={styles.recentLabel}>{r.label}</span>
                  <span className={styles.recentTime}>{timeAgo(r.time)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>기능 선택</h2>
          <div className={styles.grid}>
            {FEATURES.map((f) => (
              <button
                key={f.path}
                type="button"
                className={styles.card}
                onClick={() => handleNav(f.path, f.label)}
                style={{ "--card-color": f.color, "--card-bg": f.bg } as React.CSSProperties}
              >
                <span className={styles.cardIcon}>{f.icon}</span>
                <span className={styles.cardLabel}>{f.label}</span>
                <span className={styles.cardDesc}>{f.desc}</span>
                <span className={styles.cardArrow}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
