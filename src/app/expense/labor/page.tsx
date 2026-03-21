"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./labor.module.css";

type Row = {
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

export default function SafetyLaborHistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(todayMonth());
  const [person, setPerson] = useState("");

  const [newPerson, setNewPerson] = useState("");
  const [newPaymentDate, setNewPaymentDate] = useState(todayDate());
  const [newAmount, setNewAmount] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("search", search.trim());
      if (month.trim()) qs.set("month", month.trim());
      if (person.trim()) qs.set("person", person.trim());
      const res = await fetch(`/api/safety-labor/documents?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "목록 조회 실패");
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalAmount = useMemo(() => rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0), [rows]);

  const createDoc = async () => {
    try {
      const res = await fetch("/api/safety-labor/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personName: newPerson,
          paymentDate: newPaymentDate,
          amount: Number(newAmount),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "문서 생성 실패");
      setNewPerson("");
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "문서 생성 실패");
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>안전관리자 인건비 히스토리</h1>
        <Link className={styles.link} href="/expense">기존 화면으로 이동</Link>
      </div>

      <section className={styles.card}>
        <h2>신규 문서 생성</h2>
        <div className={styles.row}>
          <input className={styles.input} placeholder="이름" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} />
          <input className={styles.input} type="date" value={newPaymentDate} onChange={(e) => setNewPaymentDate(e.target.value)} />
          <input className={styles.input} type="number" min={0} value={newAmount} onChange={(e) => setNewAmount(Number(e.target.value || 0))} />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={createDoc}>문서 생성</button>
        </div>
      </section>

      <section className={styles.card}>
        <h2>히스토리 조회</h2>
        <div className={styles.row} style={{ marginBottom: 10 }}>
          <input className={styles.input} placeholder="검색(이름/상태)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <input className={styles.input} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <input className={styles.input} placeholder="사람 필터" value={person} onChange={(e) => setPerson(e.target.value)} />
          <button className={styles.btn} onClick={load}>검색</button>
        </div>

        <div className={styles.muted}>총 {rows.length}건 / 합계 {totalAmount.toLocaleString()}원 {loading ? "(로딩 중)" : ""}</div>

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
              {rows.map((row, idx) => (
                <tr key={row.id} className={styles.rowLink} onClick={() => router.push(`/expense/labor/${row.id}`)}>
                  <td>{idx + 1}</td>
                  <td>{row.person_name}</td>
                  <td>{row.payment_date}</td>
                  <td>{Number(row.amount ?? 0).toLocaleString()}</td>
                  <td>{row.attachment_count ?? 0}</td>
                  <td className={row.status === "완료" ? styles.statusDone : styles.statusTodo}>{row.status}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>데이터가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
