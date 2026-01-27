"use client";

import { useEffect, useState } from "react";
import styles from "./PhotoSection.module.css";

type SlotKey = "inbound" | "install0" | "install1" | "install2" | "install3";

type SlotState = {
  file: File | null;
  url: string | null;
  name: string | null;
};

const empty = (): Record<SlotKey, SlotState> => ({
  inbound: { file: null, url: null, name: null },
  install0: { file: null, url: null, name: null },
  install1: { file: null, url: null, name: null },
  install2: { file: null, url: null, name: null },
  install3: { file: null, url: null, name: null },
});

export default function PhotoSection({ expenseItemId }: { expenseItemId: string }) {
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>(empty());

  // item 바뀌면 초기화
  useEffect(() => {
    Object.values(slots).forEach((s) => s.url && URL.revokeObjectURL(s.url));
    setSlots(empty());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseItemId]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      Object.values(slots).forEach((s) => s.url && URL.revokeObjectURL(s.url));
    };
  }, [slots]);

  const setFile = (key: SlotKey, file: File | null) => {
    setSlots((prev) => {
      const old = prev[key];
      if (old.url) URL.revokeObjectURL(old.url);

      if (!file) return { ...prev, [key]: { file: null, url: null, name: null } };

      const url = URL.createObjectURL(file);
      return { ...prev, [key]: { file, url, name: file.name } };
    });
  };

  const onPick = (key: SlotKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 선택 가능합니다.");
      e.currentTarget.value = "";
      return;
    }
    setFile(key, file);
    e.currentTarget.value = "";
  };

  const Slot = ({ title, k }: { title: string; k: SlotKey }) => {
    const s = slots[k];
    const has = !!s.file;

    return (
      <div style={{ border: "1px solid #333", borderRadius: 14, overflow: "hidden", background: "#111" }}>
        <div style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <b style={{ fontSize: 13 }}>{title}</b>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{has ? "선택됨" : "미선택"}</span>
        </div>

        <div style={{ width: "100%", height: 160, background: "#0d0d0d", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {s.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.url} alt={s.name ?? "preview"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 12, opacity: 0.6 }}>미리보기 없음</span>
          )}
        </div>

        <div style={{ padding: 10, fontSize: 12, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.name ?? "파일 없음"}
        </div>

        <div style={{ display: "flex", gap: 8, padding: 10 }}>
          <label style={{ flex: 1, border: "1px solid #444", borderRadius: 12, padding: 10, textAlign: "center", cursor: "pointer" }}>
            {has ? "교체" : "선택"}
            <input type="file" accept="image/*" onChange={onPick(k)} style={{ display: "none" }} />
          </label>

          <button
            type="button"
            onClick={() => setFile(k, null)}
            disabled={!has}
            style={{
              flex: 1,
              border: "1px solid #444",
              borderRadius: 12,
              padding: 10,
              opacity: has ? 1 : 0.4,
              cursor: has ? "pointer" : "not-allowed",
              background: "transparent",
              color: "#fff",
            }}
          >
            삭제
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className={styles.wrapper}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 800 }}>사진 업로드 (item.id 기준)</div>
        <div style={{ fontSize: 12, opacity: 0.75, wordBreak: "break-all" }}>{expenseItemId}</div>
      </div>

      <div style={{ marginTop: 12, marginBottom: 8, fontWeight: 800, fontSize: 13 }}>반입 사진 (1장)</div>
      <Slot title="반입" k="inbound" />

      <div style={{ marginTop: 12, marginBottom: 8, fontWeight: 800, fontSize: 13 }}>지급·설치 사진 (최대 4장)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Slot title="slot 0" k="install0" />
        <Slot title="slot 1" k="install1" />
        <Slot title="slot 2" k="install2" />
        <Slot title="slot 3" k="install3" />
      </div>
    </section>
  );
}
