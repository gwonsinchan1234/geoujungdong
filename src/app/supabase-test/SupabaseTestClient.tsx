"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SupabaseTestClient() {
  const [log, setLog] = useState<string>("");

  const insertTestDoc = async () => {
    setLog("저장 시도 중...");

    const { data, error } = await supabase
      .from("expense_docs")
      .insert([{ site_name: "테스트현장", month_key: "2026-01" }])
      .select()
      .single();

    if (error) {
      setLog(`에러: ${error.message}`);
      return;
    }

    setLog(`성공: doc_id=${data.id}`);
  };

  return (
    <main style={{ padding: 16 }}>
      <h1>Supabase 연결 테스트</h1>

      <button onClick={insertTestDoc} style={{ padding: 12, marginTop: 12 }}>
        expense_docs 테스트 저장
      </button>

      <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{log}</pre>
    </main>
  );
}
