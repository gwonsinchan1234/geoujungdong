"use client";

/**
 * ExpensePage (최종본)
 * - 문서(doc) 생성/로드
 * - 품목(items) 로드
 * - ✅ 품목 선택: 드롭다운(타이핑 검색) + id 중복 제거
 * - ✅ 수동 추가: evidence_no 자동 증가(중복 409 재발 차단)
 * - PhotoSection에 docId + itemId 전달
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import PhotoSection from "@/components/PhotoSection";
import styles from "./expense.module.css";

type ExpenseDoc = {
  id: string;
  site_name: string;
  month_key: string;
};

type ExpenseItem = {
  id: string;
  doc_id: string;
  evidence_no: number;
  item_name: string;
  qty: number;
  unit_price: number | null;
  amount: number | null;
  used_at: string | null;
  category_no?: number | null;
  source_fingerprint?: string | null;
  source_row_no?: number | null;
};

type SafetyLaborRow = {
  id: string;
  person_name: string;
  payment_date: string;
  amount: number;
  attachment_count: number;
  status: "미완료" | "완료";
};

function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.id, r);
  return Array.from(map.values());
}

function nextEvidenceNo(rows: ExpenseItem[]) {
  // ✅ 현재 doc의 최대 NO를 찾아 +1
  const max = rows.reduce((m, r) => Math.max(m, Number(r.evidence_no ?? 0)), 0);
  return max + 1;
}

export default function ExpensePage() {
  const [doc, setDoc] = useState<ExpenseDoc | null>(null);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // 문서 생성 입력값
  const [siteName, setSiteName] = useState("테스트현장");
  const [monthKey, setMonthKey] = useState("2026-01");

  // ✅ 수동추가 입력값 (NO 자동 증가로 관리)
  const [evidenceNo, setEvidenceNo] = useState<number>(1);
  const [itemName, setItemName] = useState("위험테이프");
  const [qty, setQty] = useState<number>(10);

  // ✅ 드롭다운(검색) 상태
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // 안전관리자 인건비 누적/조회
  const [laborRows, setLaborRows] = useState<SafetyLaborRow[]>([]);
  const [laborLoading, setLaborLoading] = useState(false);
  const [laborSearch, setLaborSearch] = useState("");
  const [laborMonth, setLaborMonth] = useState(todayMonth());
  const [laborPersonFilter, setLaborPersonFilter] = useState("");
  const [laborNewName, setLaborNewName] = useState("");
  const [laborNewDate, setLaborNewDate] = useState(todayDate());
  const [laborNewAmount, setLaborNewAmount] = useState<number>(0);

  /** 최근 문서 로드 */
  const loadLatestDoc = async () => {
    const { data, error } = await supabase
      .from("expense_docs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      alert(`doc 조회 에러: ${error.message}`);
      return;
    }

    setDoc((data as ExpenseDoc) ?? null);
  };

  /** 품목 로드 */
  const loadItems = async (docId: string) => {
    const { data, error } = await supabase
      .from("expense_items")
      .select("*")
      .eq("doc_id", docId)
      .order("evidence_no", { ascending: true });

    if (error) {
      alert(`items 조회 에러: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as ExpenseItem[];
    const deduped = dedupeById(rows);

    // ✅ 꼬임 방지: 항상 덮어쓰기
    setItems(deduped);

    // ✅ 409 재발 방지: 다음 NO로 자동 세팅
    setEvidenceNo(nextEvidenceNo(deduped));
  };

  const loadLaborRows = async () => {
    setLaborLoading(true);
    try {
      const qs = new URLSearchParams();
      if (laborSearch.trim()) qs.set("search", laborSearch.trim());
      if (laborMonth.trim()) qs.set("month", laborMonth.trim());
      if (laborPersonFilter.trim()) qs.set("person", laborPersonFilter.trim());

      const res = await fetch(`/api/safety-labor/documents?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "안전관리자 인건비 조회 실패");
      setLaborRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "안전관리자 인건비 조회 실패");
    } finally {
      setLaborLoading(false);
    }
  };

  const createLaborDoc = async () => {
    try {
      const res = await fetch("/api/safety-labor/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personName: laborNewName,
          paymentDate: laborNewDate,
          amount: Number(laborNewAmount),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "문서 생성 실패");
      setLaborNewName("");
      await loadLaborRows();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "문서 생성 실패");
    }
  };

  useEffect(() => {
    loadLatestDoc();
    void loadLaborRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!doc?.id) return;

    // doc 바뀌면 선택/검색 초기화
    setSelectedItemId(null);
    setQ("");
    setOpen(false);

    loadItems(doc.id);
  }, [doc?.id]);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  /** 문서 생성 */
  const createDoc = async () => {
    const { data, error } = await supabase
      .from("expense_docs")
      .insert([{ site_name: siteName, month_key: monthKey }])
      .select()
      .single();

    if (error) {
      alert(`doc 생성 에러: ${error.message}`);
      return;
    }

    setDoc(data as ExpenseDoc);

    // 새 문서면 NO는 1부터
    setItems([]);
    setEvidenceNo(1);
    setSelectedItemId(null);
    setQ("");
    setOpen(false);
  };

  /** ✅ 품목 수동 추가 (409 방지 포함) */
  const addItem = async () => {
    if (!doc?.id) {
      alert("먼저 문서(doc)를 생성/선택하세요.");
      return;
    }

    // ✅ 프론트에서 1차 방어: 현재 items에 같은 NO 있으면 막기
    if (items.some((x) => Number(x.evidence_no) === Number(evidenceNo))) {
      alert(`증빙번호(NO.${evidenceNo})가 이미 존재합니다. 다음 번호로 자동 설정합니다.`);
      setEvidenceNo(nextEvidenceNo(items));
      return;
    }

    const { error } = await supabase.from("expense_items").insert([
      {
        doc_id: doc.id,
        evidence_no: evidenceNo,
        item_name: itemName,
        qty,
        unit_price: null,
        amount: null,
        used_at: null,
      },
    ]);

    if (error) {
      // ✅ Supabase 중복키는 보통 code=23505 (unique violation)
      const anyErr = error as any;
      if (anyErr?.code === "23505") {
        alert(`중복 등록(409)입니다. NO를 다음 번호로 바꿉니다.`);
        setEvidenceNo(nextEvidenceNo(items));
        return;
      }

      alert(`item 추가 에러: ${error.message}`);
      return;
    }

    // 저장 성공 후 재로드 → 다음 NO 자동 세팅됨
    await loadItems(doc.id);
  };

  // ✅ 옵션: evidence_no + item_name 같이 보여서 "같은 이름"이어도 구분
  const options = useMemo(() => {
    const deduped = dedupeById(items);
    return deduped.map((it) => ({
      id: it.id,
      label: `NO.${it.evidence_no ?? "?"}  ${it.item_name ?? ""}  (수량 ${it.qty ?? ""})`,
      it,
    }));
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s));
  }, [q, options]);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return options.find((o) => o.id === selectedItemId)?.it ?? null;
  }, [selectedItemId, options]);

  const onSelect = (id: string) => {
    setSelectedItemId(id);
    const found = options.find((o) => o.id === id);
    setQ(found?.label ?? "");
    setOpen(false);
  };

  return (
    <main style={{ padding: 16 }}>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>1) 안전관리자 인건비 시트 (누적/조회)</h2>
        <div className={styles.panelDesc}>문서 누적 저장, 검색/월/사람 필터, 상태(미완료/완료), 상세 화면 연결</div>

        <div className={styles.row}>
          <input className={styles.input} placeholder="이름" value={laborNewName} onChange={(e) => setLaborNewName(e.target.value)} />
          <input className={styles.input} type="date" value={laborNewDate} onChange={(e) => setLaborNewDate(e.target.value)} />
          <input className={styles.input} type="number" min={0} value={laborNewAmount} onChange={(e) => setLaborNewAmount(Number(e.target.value || 0))} />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={createLaborDoc}>문서 생성</button>
          <Link className={styles.btn} href="/expense/labor">전용 화면 열기</Link>
        </div>

        <div className={styles.row}>
          <input className={styles.input} placeholder="검색(이름/상태)" value={laborSearch} onChange={(e) => setLaborSearch(e.target.value)} />
          <input className={styles.input} type="month" value={laborMonth} onChange={(e) => setLaborMonth(e.target.value)} />
          <input className={styles.input} placeholder="사람 필터" value={laborPersonFilter} onChange={(e) => setLaborPersonFilter(e.target.value)} />
          <button className={styles.btn} onClick={loadLaborRows}>조회</button>
        </div>

        <div className={styles.meta}>총 {laborRows.length}건 {laborLoading ? "· 조회 중" : ""}</div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>NO</th>
                <th>이름</th>
                <th>지급일</th>
                <th>금액</th>
                <th>첨부수</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {laborRows.map((row, idx) => (
                <tr key={row.id}>
                  <td><Link className={styles.linkRow} href={`/expense/labor/${row.id}`}>{idx + 1}</Link></td>
                  <td><Link className={styles.linkRow} href={`/expense/labor/${row.id}`}>{row.person_name}</Link></td>
                  <td><Link className={styles.linkRow} href={`/expense/labor/${row.id}`}>{row.payment_date}</Link></td>
                  <td><Link className={styles.linkRow} href={`/expense/labor/${row.id}`}>{Number(row.amount ?? 0).toLocaleString()}</Link></td>
                  <td><Link className={styles.linkRow} href={`/expense/labor/${row.id}`}>{row.attachment_count ?? 0}</Link></td>
                  <td>
                    <Link className={styles.linkRow} href={`/expense/labor/${row.id}`}>
                      <span className={row.status === "완료" ? styles.done : styles.todo}>{row.status}</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {laborRows.length === 0 && (
                <tr>
                  <td colSpan={6}>조회 데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <h1>안전관리비 관리(문서/품목 + 사진)</h1>

      {/* 1) 문서 */}
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h2 style={{ margin: 0 }}>1) 문서(doc) 생성</h2>

        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="현장명" />
          <input value={monthKey} onChange={(e) => setMonthKey(e.target.value)} placeholder="월(YYYY-MM)" />
          <button onClick={createDoc}>문서 생성</button>
          <button onClick={loadLatestDoc}>최근 문서 불러오기</button>
        </div>

        <div style={{ marginTop: 8 }}>
          <b>현재 문서:</b> {doc ? `${doc.site_name} / ${doc.month_key}` : "없음"}
        </div>
      </section>

      {/* 2) 엑셀 업로드(임시) */}
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h2 style={{ margin: 0 }}>2) 엑셀 업로드(임시)</h2>
        <div style={{ marginTop: 8, opacity: 0.8 }}>현재는 연결 전입니다.</div>
      </section>

      {/* 3) 품목 수동 추가 */}
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h2 style={{ margin: 0 }}>3) 품목 수동 추가</h2>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="number"
            value={evidenceNo}
            onChange={(e) => setEvidenceNo(Number(e.target.value))}
            style={{ width: 90 }}
          />
          <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="품명" />
          <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} style={{ width: 90 }} />
          <button onClick={addItem} disabled={!doc?.id}>
            품목 추가
          </button>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          ※ 409(중복) 방지를 위해 저장 성공/로드 후 자동으로 다음 NO로 이동합니다.
        </div>
      </section>

      {/* 4) 품목 선택(드롭다운) */}
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h2 style={{ margin: 0 }}>4) 품목 리스트 (행 선택)</h2>

        {!doc?.id ? (
          <div style={{ marginTop: 8, opacity: 0.8 }}>먼저 문서(doc)를 생성/로드하세요.</div>
        ) : (
          <div ref={dropdownRef} style={{ marginTop: 10, position: "relative", maxWidth: 680 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="품목 검색(예: 생명줄 / NO. / 수량)"
                style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #444" }}
              />

              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setSelectedItemId(null);
                  setOpen(false);
                }}
              >
                선택 해제
              </button>
            </div>

            {open && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 50,
                  top: 44,
                  left: 0,
                  right: 0,
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: 12,
                  overflow: "hidden",
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                {filtered.length === 0 ? (
                  <div style={{ padding: 12, opacity: 0.8 }}>검색 결과 없음</div>
                ) : (
                  filtered.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => onSelect(o.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "0",
                        borderTop: "1px solid #222",
                        background: o.id === selectedItemId ? "#1b2a3a" : "transparent",
                        color: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {o.label}
                    </button>
                  ))
                )}
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <b>선택된 품목:</b>{" "}
              {selectedItem ? `NO.${selectedItem.evidence_no} / ${selectedItem.item_name} / ${selectedItem.id}` : "없음"}
            </div>
          </div>
        )}
      </section>

      {/* 5) 사진 업로드 */}
      <section style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h2 style={{ margin: 0 }}>5) 사진 업로드</h2>

        {!doc?.id ? (
          <div style={{ marginTop: 8 }}>문서(doc)부터 선택하세요.</div>
        ) : !selectedItemId ? (
          <div style={{ marginTop: 8 }}>위에서 품목을 선택하세요.</div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <PhotoSection docId={doc.id} itemId={selectedItemId} />
          </div>
        )}
      </section>
    </main>
  );
}
