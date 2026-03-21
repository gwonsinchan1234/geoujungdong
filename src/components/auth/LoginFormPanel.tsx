"use client";

import { useState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import cardStyles from "@/app/login/page.module.css";
import modalStyles from "./LoginModal.module.css";

type Tab = "login" | "signup";

const ROLES = [
  "현장소장",
  "안전관리자",
  "안전감시단",
  "공무팀",
  "경리·회계",
  "기타",
] as const;

function toKoreanError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (msg.includes("Email not confirmed")) return "이메일 인증이 필요합니다. 받은편지함을 확인해 주세요.";
  if (msg.includes("User already registered")) return "이미 가입된 이메일입니다.";
  if (msg.includes("Password should be")) return "비밀번호는 6자 이상이어야 합니다.";
  if (msg.includes("Unable to validate")) return "이메일 형식을 확인해 주세요.";
  if (msg.includes("rate limit")) return "잠시 후 다시 시도해 주세요.";
  return msg;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export type LoginFormPanelProps = {
  nextPath: string;
  variant?: "page" | "dialog";
  onClose?: () => void;
  closeLabel?: string;
};

export function LoginFormPanel({
  nextPath,
  variant = "page",
  onClose,
  closeLabel = "닫기",
}: LoginFormPanelProps) {
  const router = useRouter();
  const titleId = useId();
  const [tab, setTab] = useState<Tab>("login");

  // 공통
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // 회원가입 전용
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 이미 로그인된 상태 감지 (자동 리다이렉트 대신 UI로 표시)
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);

  const isDialog = variant === "dialog";

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setAlreadyLoggedIn(true);
    });
  }, []);

  useEffect(() => {
    if (!isDialog) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isDialog, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      if (tab === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(toKoreanError(error.message));
          return;
        }
        router.refresh();
        router.replace(nextPath);
      } else {
        if (!name.trim()) {
          setError("이름을 입력해 주세요.");
          return;
        }
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name.trim(),
              phone: phone.replace(/\D/g, ""),
              role,
            },
          },
        });
        if (error) {
          setError(toKoreanError(error.message));
          return;
        }
        if (data.session) {
          router.refresh();
          router.replace(nextPath);
          return;
        }
        setSuccess("회원가입이 완료되었습니다. 이메일을 확인한 뒤 로그인해 주세요.");
        setTab("login");
        setName(""); setPhone(""); setRole("");
      }
    } finally {
      setLoading(false);
    }
  };

  const cardClass =
    isDialog ? `${cardStyles.card} ${modalStyles.cardInDialog}` : cardStyles.card;

  const cardHeader = (
    <div className={cardStyles.cardTop}>
      <span id={isDialog ? titleId : undefined} className={cardStyles.cardEyebrow}>
        계정 센터
      </span>
      {isDialog ? (
        <button type="button" className={cardStyles.backLink} onClick={onClose}>
          {closeLabel}
        </button>
      ) : (
        <a href="/home" className={cardStyles.backLink}>
          서비스 홈
        </a>
      )}
    </div>
  );

  // ── 이미 로그인된 상태 ──
  if (alreadyLoggedIn) {
    const alreadyCard = (
      <div
        className={cardClass}
        role={isDialog ? "document" : undefined}
        aria-labelledby={isDialog ? titleId : undefined}
      >
        <div className={cardStyles.cardAccent} aria-hidden />
        {cardHeader}
        <div className={cardStyles.cardMain} data-mode="login">
          <header className={cardStyles.modeHeader}>
            <h2 className={cardStyles.modeTitle}>이미 로그인됨</h2>
            <p className={cardStyles.modeDesc}>현재 로그인된 세션이 있습니다.</p>
          </header>
          <div className={cardStyles.alreadyActions}>
            <a href={nextPath} className={cardStyles.submitBtn} style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 52 }}>
              <span className={cardStyles.submitLabel}>워크스페이스로 이동</span>
            </a>
            <button
              type="button"
              className={cardStyles.logoutBtn}
              onClick={async () => {
                await supabase.auth.signOut();
                setAlreadyLoggedIn(false);
              }}
            >
              로그아웃 후 다시 로그인
            </button>
          </div>
          <p className={cardStyles.trustNote}>
            <Lock className={cardStyles.trustIcon} size={13} strokeWidth={2} aria-hidden />
            <span>전송 구간은 암호화되어 보호됩니다.</span>
          </p>
        </div>
      </div>
    );

    if (isDialog) {
      return (
        <div className={modalStyles.backdrop} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
          <div className={modalStyles.dialogShell} onClick={(e) => e.stopPropagation()}>
            {alreadyCard}
          </div>
        </div>
      );
    }
    return alreadyCard;
  }

  // ── 일반 로그인/회원가입 폼 ──
  const card = (
    <div
      className={cardClass}
      role={isDialog ? "document" : undefined}
      aria-labelledby={isDialog ? titleId : undefined}
    >
      <div className={cardStyles.cardAccent} aria-hidden />
      {cardHeader}

      <div className={cardStyles.cardMain} data-mode={tab}>
        <div className={cardStyles.tabRow} role="tablist" aria-label="로그인 또는 회원가입">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            className={`${cardStyles.tabBtn} ${tab === "login" ? cardStyles.tabBtnActive : ""}`}
            onClick={() => { setTab("login"); setError(""); setSuccess(""); }}
          >
            로그인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "signup"}
            className={`${cardStyles.tabBtn} ${tab === "signup" ? cardStyles.tabBtnActive : ""}`}
            onClick={() => { setTab("signup"); setError(""); setSuccess(""); }}
          >
            회원가입
          </button>
        </div>

        <header className={cardStyles.modeHeader}>
          <h2 className={cardStyles.modeTitle}>
            {tab === "login" ? "로그인" : "회원가입"}
          </h2>
          <p className={cardStyles.modeDesc}>
            {tab === "login"
              ? "등록된 계정으로 안전하게 워크스페이스에 접속합니다."
              : "이름과 연락처를 입력하고 계정을 만드세요."}
          </p>
        </header>

        {error && <div className={cardStyles.error}>{error}</div>}
        {success && <div className={cardStyles.success}>{success}</div>}

        <form className={cardStyles.form} onSubmit={handleSubmit} noValidate>
          {/* 회원가입 전용 */}
          {tab === "signup" && (
            <>
              <div className={cardStyles.fieldGroup}>
                <label className={cardStyles.label} htmlFor={`signup-name-${titleId}`}>이름</label>
                <div className={cardStyles.fieldShell}>
                  <input
                    id={`signup-name-${titleId}`}
                    type="text"
                    className={cardStyles.input}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className={cardStyles.fieldGroup}>
                <label className={cardStyles.label} htmlFor={`signup-phone-${titleId}`}>휴대폰 번호</label>
                <div className={cardStyles.fieldShell}>
                  <input
                    id={`signup-phone-${titleId}`}
                    type="tel"
                    className={cardStyles.input}
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="010-0000-0000"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>
              </div>

              <div className={cardStyles.fieldGroup}>
                <label className={cardStyles.label} htmlFor={`signup-role-${titleId}`}>직책</label>
                <div className={`${cardStyles.fieldShell} ${cardStyles.fieldShellSelect}`}>
                  <select
                    id={`signup-role-${titleId}`}
                    className={`${cardStyles.input} ${cardStyles.select}`}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="">선택해 주세요</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* 공통 */}
          <div className={cardStyles.fieldGroup}>
            <label className={cardStyles.label} htmlFor={`login-email-${titleId}`}>이메일 주소</label>
            <div className={cardStyles.fieldShell}>
              <input
                id={`login-email-${titleId}`}
                type="email"
                className={cardStyles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                autoComplete="email"
                inputMode="email"
              />
            </div>
          </div>

          <div className={cardStyles.fieldGroup}>
            <label className={cardStyles.label} htmlFor={`login-pw-${titleId}`}>비밀번호</label>
            <div className={`${cardStyles.fieldShell} ${cardStyles.fieldShellPw}`}>
              <input
                id={`login-pw-${titleId}`}
                type={showPassword ? "text" : "password"}
                className={cardStyles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === "login" ? "비밀번호 입력" : "6자 이상 설정"}
                required
                minLength={6}
                autoComplete={tab === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                className={cardStyles.pwToggle}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              >
                {showPassword ? <EyeOff size={18} strokeWidth={1.65} /> : <Eye size={18} strokeWidth={1.65} />}
              </button>
            </div>
            {tab === "signup" && (
              <p className={cardStyles.fieldHint}>영문·숫자 조합 6자 이상을 권장합니다.</p>
            )}
          </div>

          <button
            type="submit"
            className={cardStyles.submitBtn}
            disabled={loading}
            aria-busy={loading}
          >
            <span className={cardStyles.submitLabel}>
              {loading ? "처리 중…" : tab === "login" ? "로그인" : "가입하고 계속하기"}
            </span>
          </button>
        </form>

        <p className={cardStyles.trustNote}>
          <Lock className={cardStyles.trustIcon} size={13} strokeWidth={2} aria-hidden />
          <span>전송 구간은 암호화되어 보호됩니다.</span>
        </p>
      </div>
    </div>
  );

  if (isDialog) {
    return (
      <div
        className={modalStyles.backdrop}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={onClose}
      >
        <div className={modalStyles.dialogShell} onClick={(e) => e.stopPropagation()}>
          {card}
        </div>
      </div>
    );
  }

  return card;
}
