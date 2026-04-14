"use client";

import { useCallback, useState } from "react";
import { HelpChat } from "./HelpChat";

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  const handleOpen = useCallback(() => {
    setSessionKey((k) => k + 1);
    setOpen(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-90 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-sky-600 text-2xl text-white shadow-lg ring-2 ring-white/30 transition-all duration-300 ease-out hover:scale-110 hover:bg-sky-500 hover:shadow-xl hover:ring-sky-300/50 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
        aria-label="프로그램 설명 챗봇 열기"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span
          aria-hidden
          className="inline-block transition-transform duration-300 ease-out group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        >
          💬
        </span>
      </button>
      {open && (
        <HelpChat
          key={sessionKey}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
