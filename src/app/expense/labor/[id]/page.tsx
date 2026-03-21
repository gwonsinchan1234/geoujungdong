"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../labor.module.css";

type Doc = {
  id: string;
  person_name: string;
  payment_date: string;
  month_key: string;
  amount: number;
  status: "미완료" | "완료";
  attachment_count: number;
};

type Attachment = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  created_at: string;
  url?: string | null;
};

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SafetyLaborDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const router = useRouter();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [copyMonth, setCopyMonth] = useState(thisMonth());
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");

  const [personName, setPersonName] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState<number>(0);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [docRes, attRes] = await Promise.all([
        fetch(`/api/safety-labor/documents/${id}`, { cache: "no-store" }),
        fetch(`/api/safety-labor/documents/${id}/attachments`, { cache: "no-store" }),
      ]);
      const docJson = await docRes.json();
      const attJson = await attRes.json();

      if (!docRes.ok || !docJson?.ok) throw new Error(docJson?.error ?? "상세 조회 실패");
      if (!attRes.ok || !attJson?.ok) throw new Error(attJson?.error ?? "첨부 조회 실패");

      setDoc(docJson.doc as Doc);
      setPersonName(String(docJson.doc.person_name ?? ""));
      setPaymentDate(String(docJson.doc.payment_date ?? ""));
      setAmount(Number(docJson.doc.amount ?? 0));
      setAttachments(Array.isArray(attJson.rows) ? attJson.rows : []);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveDoc = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/safety-labor/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personName, paymentDate, amount }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "저장 실패");
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "저장 실패");
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!id || !files || files.length === 0) return;
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch(`/api/safety-labor/documents/${id}/attachments`, {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? "첨부 업로드 실패");
      }
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "첨부 업로드 실패");
    }
  };

  const copyPrev = async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/safety-labor/documents/${id}/copy-prev`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMonth: copyMonth }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "이전월 복사 실패");
      router.push(`/expense/labor/${json.row.id}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "이전월 복사 실패");
    }
  };

  return (
    <main className={styles.editor}>
      <div className={styles.mobileTabs}>
        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tabBtn} ${mobileTab === "edit" ? styles.active : ""}`}
            onClick={() => setMobileTab("edit")}
          >
            문서 편집
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${mobileTab === "preview" ? styles.active : ""}`}
            onClick={() => setMobileTab("preview")}
          >
            미리보기
          </button>
        </div>
      </div>

      <div className={styles.editorBody}>
        <div className={`${styles.leftPanel} ${mobileTab === "preview" ? styles.mobileHidden : ""}`}>
          <div className={styles.leftSummary}>
            <span className={styles.leftSummaryTitle}>안전관리자 인건비</span>
            <span className={styles.leftSummarySep} />
            <span className={styles.leftSummaryCount}>첨부 {attachments.length}건</span>
            <span className={styles.leftSummaryTotal}>{Number(amount || 0).toLocaleString()}원</span>
          </div>

          <div className={styles.formWrap}>
            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionLeft}>
                  <span className={styles.catNum}>1</span>
                  <span className={styles.catName}>문서 정보</span>
                </div>
                <div className={styles.sectionRight}>
                  <span className={styles.catCount}>{doc?.status ?? "-"}</span>
                </div>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <input className={styles.input} placeholder="이름" value={personName} onChange={(e) => setPersonName(e.target.value)} />
                  <input className={styles.input} type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                  <input className={styles.input} type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value || 0))} />
                </div>
                <div className={styles.row}>
                  <button className={`${styles.btnPrimary}`} onClick={saveDoc}>저장</button>
                  <Link className={styles.btnSecondary} href="/expense/labor">히스토리 이동</Link>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.muted}>문서 ID: {id}</span>
                  {loading && <span className={styles.muted}>로딩 중</span>}
                </div>
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionLeft}>
                  <span className={styles.catNum}>2</span>
                  <span className={styles.catName}>첨부 업로드</span>
                </div>
                <div className={styles.sectionRight}>
                  <span className={styles.catCount}>자동 저장</span>
                </div>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <label className={styles.btnSecondary}>
                    이미지 선택
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        void uploadFiles(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className={styles.attachList}>
                  {attachments.map((att) => (
                    <div className={styles.attachItem} key={att.id}>
                      {att.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.attachThumb} src={att.url} alt={att.file_name} />
                      ) : (
                        <div className={styles.attachThumb} />
                      )}
                      <div>{att.file_name}</div>
                      <div className={styles.muted}>{Number(att.size_bytes ?? 0).toLocaleString()} bytes</div>
                    </div>
                  ))}
                  {attachments.length === 0 && <div className={styles.muted}>첨부가 없습니다.</div>}
                </div>
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionLeft}>
                  <span className={styles.catNum}>3</span>
                  <span className={styles.catName}>이전월 복사</span>
                </div>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <input className={styles.input} type="month" value={copyMonth} onChange={(e) => setCopyMonth(e.target.value)} />
                  <button className={styles.btnSecondary} onClick={copyPrev}>이전월 구조 복사</button>
                </div>
                <div className={styles.muted}>선택 월 기준 직전월 문서를 같은 사람명으로 찾아 신규 문서를 생성합니다.</div>
              </div>
            </section>
          </div>
        </div>

        <div className={`${styles.rightPanel} ${mobileTab === "edit" ? styles.mobileHidden : ""}`}>
          <div className={styles.previewCanvas}>
            <div className={styles.previewPaper}>
              <div className={styles.previewHead}>안전관리자 인건비 및 업무수당</div>
              <div className={styles.previewTable}>
                <div className={styles.previewRow}><span>이름</span><strong>{personName || "-"}</strong></div>
                <div className={styles.previewRow}><span>지급일</span><strong>{paymentDate || "-"}</strong></div>
                <div className={styles.previewRow}><span>금액</span><strong>{Number(amount || 0).toLocaleString()}원</strong></div>
                <div className={styles.previewRow}><span>상태</span><strong>{doc?.status ?? "-"}</strong></div>
                <div className={styles.previewRow}><span>첨부</span><strong>{attachments.length}개</strong></div>
              </div>
              <div className={styles.previewNote}>* 실제 출력 양식은 기존 기능/엔진을 그대로 사용합니다.</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
