"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getAnswer } from "./getAnswer";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type HelpTopicId = "photo" | "giseong" | "tbm" | "flow";

const WELCOME_TEXT = `안녕하세요 👷
프로그램 사용을 도와드립니다.

아래에서 선택하세요:

1. 사진대지 기능 설명
2. 기성검증 기능 설명
3. TBM 기능 설명
4. 전체 흐름 보기`;

const QUICK_ACTIONS: { id: HelpTopicId; label: string; userEcho: string }[] = [
  { id: "photo", label: "1. 사진대지", userEcho: "사진대지 기능 설명해줘" },
  { id: "giseong", label: "2. 기성검증", userEcho: "기성검증 기능 설명해줘" },
  { id: "tbm", label: "3. TBM", userEcho: "TBM 기능 설명해줘" },
  { id: "flow", label: "4. 전체 흐름", userEcho: "전체 흐름 보여줘" },
];

/** 최근 사용자↔봇 왕복 5회(10개)까지 유지 */
const HISTORY_CAP = 10;

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function enrichQuestion(current: string, prev: string) {
  if (
    current.includes("그거") ||
    current.includes("이거") ||
    current.includes("아까")
  ) {
    return prev + " 관련해서 " + current;
  }
  return current;
}

/** 서버: getAnswer → (복잡 질문 시 aiGenerate / 단순 시 aiRewrite) + 질문 유도. 실패 시 클라이언트 getAnswer */
async function resolveHelpAnswer(
  question: string,
  chatHistory: { role: "user" | "bot"; text: string }[],
): Promise<string> {
  try {
    const res = await fetch("/api/help-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: chatHistory }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { answer?: string };
    if (typeof data.answer === "string" && data.answer.trim()) return data.answer.trim();
  } catch {
    /* 네트워크/서버 오류 시 기존 MOCK */
  }
  return getAnswer(question).trim();
}

function logChatTurn(question: string, answer: string) {
  void fetch("/api/chat-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, answer }),
  }).catch(() => {});
}

export type HelpChatProps = {
  onClose: () => void;
};

export function HelpChat({ onClose }: HelpChatProps) {
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: uid("a"), role: "assistant", content: WELCOME_TEXT },
  ]);
  const [history, setHistory] = useState<{ role: "user" | "bot"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages, scrollToEnd]);

  const pushPair = useCallback(
    async (userEcho: string) => {
      const lastUserMessage =
        history.filter((m) => m.role === "user").slice(-1)[0]?.text || "";
      const enriched = enrichQuestion(userEcho, lastUserMessage);

      setMessages((prev) => [
        ...prev,
        { id: uid("u"), role: "user", content: userEcho },
      ]);
      setBusy(true);
      await new Promise((r) => setTimeout(r, 120));
      const answer = await resolveHelpAnswer(enriched, history);
      setMessages((prev) => [
        ...prev,
        { id: uid("a"), role: "assistant", content: answer },
      ]);
      setHistory((prev) =>
        [
          ...prev,
          { role: "user" as const, text: userEcho },
          { role: "bot" as const, text: answer },
        ].slice(-HISTORY_CAP),
      );
      logChatTurn(userEcho, answer);
      setBusy(false);
    },
    [history],
  );

  const onQuick = (userEcho: string) => {
    if (busy) return;
    void pushPair(userEcho);
  };

  const onSend = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const lastUserMessage =
      history.filter((m) => m.role === "user").slice(-1)[0]?.text || "";
    const enriched = enrichQuestion(text, lastUserMessage);

    setDraft("");
    setMessages((prev) => [...prev, { id: uid("u"), role: "user", content: text }]);
    setBusy(true);
    const answer = await resolveHelpAnswer(enriched, history);
    await new Promise((r) => setTimeout(r, 80));
    setMessages((prev) => [...prev, { id: uid("a"), role: "assistant", content: answer }]);
    setHistory((prev) =>
      [
        ...prev,
        { role: "user" as const, text },
        { role: "bot" as const, text: answer },
      ].slice(-HISTORY_CAP),
    );
    logChatTurn(text, answer);
    setBusy(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const node = (
    <div
      className="fixed inset-0 z-100 flex items-end justify-center sm:items-end sm:justify-end sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="채팅 닫기 배경"
        onClick={onClose}
      />
      <div
        className="relative flex h-[min(85dvh,640px)] w-full max-w-[100vw] flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl transition-shadow duration-300 ease-out hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] motion-reduce:transition-none sm:mb-0 sm:max-h-[min(80dvh,620px)] sm:max-w-md sm:rounded-3xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            사용 도움말
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 min-w-11 items-center justify-center rounded-full text-slate-500 transition-all duration-200 ease-out hover:scale-110 hover:bg-slate-100 hover:text-slate-800 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100"
            aria-label="닫기"
          >
            ✕
          </button>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex w-full ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[min(92%,20rem)] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-sky-600 text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500">
                입력 중…
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <p className="mb-2 text-xs font-medium text-slate-500">빠른 선택</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => onQuick(a.userEcho)}
                className="min-h-11 touch-manipulation rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                {a.label}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void onSend();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="키워드 입력 (사진·기성·TBM·전체)"
              className="min-h-11 min-w-0 flex-1 touch-manipulation rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm transition-colors duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
              enterKeyHint="send"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="min-h-11 min-w-18 touch-manipulation rounded-2xl bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-out hover:bg-sky-500 hover:shadow-md enabled:hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 motion-reduce:transition-none motion-reduce:enabled:hover:scale-100"
            >
              보내기
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
