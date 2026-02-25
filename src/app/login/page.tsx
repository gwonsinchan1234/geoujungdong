"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type Tab = "login" | "signup";

// Supabase 영문 에러 → 한국어
function toKoreanError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (msg.includes("Email not confirmed"))        return "이메일 인증이 필요합니다. 받은편지함을 확인해 주세요.";
  if (msg.includes("User already registered"))    return "이미 가입된 이메일입니다.";
  if (msg.includes("Password should be"))         return "비밀번호는 6자 이상이어야 합니다.";
  if (msg.includes("Unable to validate"))         return "이메일 형식을 확인해 주세요.";
  if (msg.includes("rate limit"))                 return "잠시 후 다시 시도해 주세요.";
  return msg;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/workspace/fill";

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 이미 로그인된 경우 리다이렉트
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(next);
    });
  }, [next, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    setLoading(true);
    try {
      if (tab === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(toKoreanError(error.message)); return; }
        router.replace(next);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) { setError(toKoreanError(error.message)); return; }
        setSuccess("회원가입 완료! 이메일을 확인하거나 바로 로그인해 보세요.");
        setTab("login");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* 홈으로 */}
        <a href="/home" className={styles.backLink}>
          ← 홈으로
        </a>

        {/* 로고 */}
        <div className={styles.logoArea}>
          <div className={styles.logoIcon} />
          <div className={styles.logoText}>거우중동</div>
          <div className={styles.logoSub}>안전관리 양식 작성 시스템</div>
        </div>

        {/* 탭 */}
        <div className={styles.tabRow}>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === "login" ? styles.tabBtnActive : ""}`}
            onClick={() => { setTab("login"); setError(""); setSuccess(""); }}
          >
            로그인
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === "signup" ? styles.tabBtnActive : ""}`}
            onClick={() => { setTab("signup"); setError(""); setSuccess(""); }}
          >
            회원가입
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>
            이메일
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="이메일 주소"
              required
              autoComplete="email"
            />
          </label>
          <label className={styles.label}>
            비밀번호
            <div className={styles.pwWrap}>
              <input
                type={showPassword ? "text" : "password"}
                className={styles.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호 (6자 이상)"
                required
                minLength={6}
                autoComplete={tab === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className={styles.pwToggle}
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </label>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? "처리 중…" : tab === "login" ? "로그인" : "회원가입"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #e5e7eb", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.65s linear infinite" }} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
