"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import styles from "./WorkspacePage.module.css";

/**
 * [기술/이유]
 * - Next.js App Router Client Component
 * - 드래그&드롭, 파일 미리보기(URL.createObjectURL), 즉시 UI 반응(프리미엄 모션) 때문에 client로 구성
 * - 현재는 UI 완성 → 다음 단계에서 /api/items + Supabase로 실제 데이터/업로드 연결
 */

type Doc = {
  id: string;
  title: string;
  subtitle: string; // 예: 파일명
  updatedAt: string; // 표시용
};

type TemplateSpec = {
  incomingSlots: number; // 반입 사진 슬롯 수
  installSlots: number; // 지급/설치 사진 슬롯 수
};

type Item = {
  id: string;
  evidenceNo: number; // NO.x
  name: string; // 사용내역(품명)
  qtyLabel: string; // "1개" 같은 표시
  qty?: number; // 수량 숫자(테이블 표시용)
  useDate?: string; // 사용일자 (YY.MM.DD)
  unitPrice?: number | null; // 단가
  amount?: number | null; // 금액
  proofNo?: string; // 증빙번호
  templateName: string;
  templateSpec: TemplateSpec;
};

type PhotoKind = "incoming" | "install";

type PhotoSlot = {
  kind: PhotoKind;
  slotIndex: number; // 0-based
  file?: File;
  previewUrl?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatNoX(n: number) {
  return `NO.${n}`;
}

function makeSlots(spec: TemplateSpec): PhotoSlot[] {
  const incoming = Array.from({ length: spec.incomingSlots }, (_, i) => ({
    kind: "incoming" as const,
    slotIndex: i,
  }));
  const install = Array.from({ length: spec.installSlots }, (_, i) => ({
    kind: "install" as const,
    slotIndex: i,
  }));
  return [...incoming, ...install];
}

function countFilled(slots: PhotoSlot[], kind: PhotoKind) {
  return slots.filter((s) => s.kind === kind && !!s.file).length;
}

function uniqueBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

const DEFAULT_TEMPLATE_SPEC: TemplateSpec = {
  incomingSlots: 1,
  installSlots: 4,
};

/** 엑셀 셀 값을 사용일자(YY.MM.DD) 문자열로 반환 */
function formatUseDate(cell: unknown): string | undefined {
  if (cell == null) return undefined;
  const s = String(cell).trim();
  if (!s) return undefined;
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const y = cell.getFullYear() % 100;
    const m = cell.getMonth() + 1;
    const d = cell.getDate();
    return `${String(y).padStart(2, "0")}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    const dc = XLSX.SSF.parse_date_code(cell);
    if (!dc || !dc.y) return undefined;
    const y = dc.y % 100;
    const m = dc.m ?? 0;
    const d = dc.d ?? 0;
    return `${String(y).padStart(2, "0")}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  }
  if (/^\d{2}\.\d{1,2}\.\d{1,2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return undefined;
}

/** 엑셀 항목별사용내역서 형식: 사용일자, 사용내역, 수량, 단가, 금액, 증빙번호 */
function parseItemsFromSheet(
  ws: XLSX.WorkSheet,
  docId: string
): Item[] {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (string | number)[][];
  const norm = (v: string) => String(v ?? "").replace(/\s/g, "");

  let headerRowIndex = -1;
  let colUsageDate = -1;
  let colDesc = -1;
  let colQty = -1;
  let colUnitPrice = -1;
  let colAmount = -1;
  let colEvidenceNo = -1;

  for (let r = 0; r < Math.min(data.length, 50); r++) {
    colUsageDate = colDesc = colQty = colUnitPrice = colAmount = colEvidenceNo = -1;
    const row = data[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = norm(String(row[c] ?? ""));
      if (cell === "사용일자") colUsageDate = c;
      else if (cell === "사용내역") colDesc = c;
      else if (cell === "수량") colQty = c;
      else if (cell === "단가") colUnitPrice = c;
      else if (cell === "금액") colAmount = c;
      else if (cell === "증빙번호") colEvidenceNo = c;
    }
    if (colDesc >= 0 && colQty >= 0) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex < 0 || colDesc < 0) return [];

  const items: Item[] = [];
  for (let r = headerRowIndex + 1; r < data.length; r++) {
    const row = data[r] ?? [];
    const desc = String(row[colDesc] ?? "").trim();
    if (!desc || desc === "계" || norm(desc) === "계") continue;

    const qtyRaw = row[colQty];
    const qtyNum = typeof qtyRaw === "number" ? qtyRaw : Number(String(qtyRaw).replace(/,/g, ""));
    const qtyLabel = Number.isFinite(qtyNum) ? `${qtyNum}개` : String(qtyRaw ?? "").trim() || "—";

    const toNum = (val: unknown): number | null => {
      if (val == null) return null;
      const n = typeof val === "number" ? val : Number(String(val).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    let evidenceNo = r - headerRowIndex;
    if (colEvidenceNo >= 0) {
      const no = row[colEvidenceNo];
      const noStr = String(no ?? "").trim();
      if (noStr !== "") {
        const n = toNum(no);
        if (n !== null && n >= 1) evidenceNo = n;
      }
    }

    items.push({
      id: `item_${docId}_${r}`,
      evidenceNo,
      name: desc,
      qtyLabel,
      qty: Number.isFinite(qtyNum) ? qtyNum : undefined,
      useDate: colUsageDate >= 0 ? formatUseDate(row[colUsageDate]) : undefined,
      unitPrice: colUnitPrice >= 0 ? toNum(row[colUnitPrice]) : undefined,
      amount: colAmount >= 0 ? toNum(row[colAmount]) : undefined,
      proofNo: colEvidenceNo >= 0 ? String(row[colEvidenceNo] ?? "").trim() || undefined : undefined,
      templateName: "반입/지급-설치",
      templateSpec: DEFAULT_TEMPLATE_SPEC,
    });
  }

  return uniqueBy(items, (x) => `${x.evidenceNo}__${x.name}`);
}

/** 업로드한 엑셀 시트를 미리보기용 헤더+행으로 반환 */
export type SheetPreviewData = {
  sheetName: string;
  headers: string[];
  rows: (string | number)[][];
};

function getSheetPreviewData(ws: XLSX.WorkSheet, sheetName: string): SheetPreviewData | null {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (string | number)[][];
  const norm = (v: string) => String(v ?? "").replace(/\s/g, "");

  let headerRowIndex = -1;
  let colDesc = -1;
  let colQty = -1;

  for (let r = 0; r < Math.min(data.length, 50); r++) {
    colDesc = colQty = -1;
    const row = data[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = norm(String(row[c] ?? ""));
      if (cell === "사용내역") colDesc = c;
      else if (cell === "수량") colQty = c;
    }
    if (colDesc >= 0 && colQty >= 0) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex < 0) return null;

  const headerRow = data[headerRowIndex] ?? [];
  const headers = headerRow.map((c) => String(c ?? "").trim() || "");
  const rows = data.slice(headerRowIndex + 1) as (string | number)[][];

  return { sheetName, headers, rows };
}

function PhotoDropSlot(props: {
  title: string;
  subtitle: string;
  previewUrl?: string;
  onPickFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // [프리미엄 모션] 드래그 들어오면 슬롯이 살아 움직이게
  const [dragging, setDragging] = useState(false);

  function onChoose() {
    if (props.disabled) return;
    inputRef.current?.click();
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    props.onPickFile(f);
    // 같은 파일 다시 선택 가능하도록 초기화
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (props.disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    props.onPickFile(f);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  return (
    <div
      className={`${styles.slot} ${dragging ? styles.slotDragging : ""}`}
      role="button"
      tabIndex={0}
      aria-disabled={props.disabled ? "true" : "false"}
      onClick={onChoose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onChoose();
      }}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={onDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={onInputChange}
        disabled={props.disabled}
      />

      {props.previewUrl ? (
        <div className={styles.previewWrap}>
          {/* [이유] 빠른 미리보기용 img (최적화는 추후 Next/Image로 교체 가능) */}
          <img className={styles.previewImg} src={props.previewUrl} alt={props.title} />
          <div className={styles.previewOverlay}>
            <div className={styles.previewMeta}>
              <div className={styles.previewTitle}>{props.title}</div>
              <div className={styles.previewSub}>{props.subtitle}</div>
            </div>
            <div className={styles.previewActions}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onChoose();
                }}
              >
                교체
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClear();
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.slotEmpty}>
          <div className={styles.slotIcon}>📷</div>
          <div className={styles.slotTitle}>{props.title}</div>
          <div className={styles.slotSub}>{props.subtitle}</div>
          <div className={styles.slotHint}>드래그 또는 클릭하여 업로드</div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const initialDocs: Doc[] = useMemo(
    () => [
      {
        id: "doc_001",
        title: "블랑써밋 74",
        subtitle: "2023_정리검검_점검시각자료.xlsx",
        updatedAt: "2026-02-02",
      },
      {
        id: "doc_002",
        title: "향담 대리점 리뉴얼",
        subtitle: "2023_정리검검_점검시각자료.xlsx",
        updatedAt: "2026-02-01",
      },
      {
        id: "doc_003",
        title: "절강 신축 공사",
        subtitle: "2023_정리검검_점검시각자료.xlsx",
        updatedAt: "2026-01-30",
      },
      {
        id: "doc_004",
        title: "학교 사옥 환수 공사",
        subtitle: "2023_정리검검_점검시각자료.xlsx",
        updatedAt: "2026-01-28",
      },
    ],
    []
  );

  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [docItems, setDocItems] = useState<Record<string, Item[]>>({});
  const [docSheetPreview, setDocSheetPreview] = useState<Record<string, SheetPreviewData>>({});
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const mockItems: Item[] = useMemo(() => {
    const raw: Item[] = [
      {
        id: "item_001",
        evidenceNo: 1,
        name: "확장",
        qtyLabel: "1개",
        templateName: "반입/지급-설치",
        templateSpec: { incomingSlots: 1, installSlots: 4 },
      },
      // 일부러 중복 상황 재현 → UI 중복 방지 로직 검증용
      {
        id: "item_001_dup",
        evidenceNo: 1,
        name: "확장",
        qtyLabel: "1개",
        templateName: "반입/지급-설치",
        templateSpec: { incomingSlots: 1, installSlots: 4 },
      },
      {
        id: "item_002",
        evidenceNo: 2,
        name: "안전난간",
        qtyLabel: "10m",
        templateName: "반입/지급-설치",
        templateSpec: { incomingSlots: 1, installSlots: 4 },
      },
      {
        id: "item_003",
        evidenceNo: 3,
        name: "생명줄",
        qtyLabel: "2set",
        templateName: "반입/지급-설치",
        templateSpec: { incomingSlots: 1, installSlots: 4 },
      },
    ];

    // [꼬임 방지] 동일 NO+품명 중복 제거(드롭다운/리스트 중복 노출 방지)
    return uniqueBy(raw, (x) => `${x.evidenceNo}__${x.name}`);
  }, []);

  const [docQuery, setDocQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocs[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string>(mockItems[0]?.id ?? "");

  const currentItems = useMemo(
    () => docItems[selectedDocId] ?? mockItems,
    [docItems, selectedDocId, mockItems]
  );

  useEffect(() => {
    const items = docItems[selectedDocId] ?? mockItems;
    const firstId = items[0]?.id ?? "";
    setSelectedItemId((prev) => (items.some((it) => it.id === prev) ? prev : firstId));
  }, [selectedDocId, docItems, mockItems]);

  const selectedDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId) ?? null,
    [docs, selectedDocId]
  );

  const selectedItem = useMemo(
    () => currentItems.find((it) => it.id === selectedItemId) ?? null,
    [currentItems, selectedItemId]
  );

  // 선택 품목 템플릿에 따라 슬롯 구성
  const [slots, setSlots] = useState<PhotoSlot[]>(() =>
    selectedItem ? makeSlots(selectedItem.templateSpec) : []
  );

  // 품목 변경 시: 템플릿 규격으로 슬롯 재구성(행 섞임 방지)
  useEffect(() => {
    if (!selectedItem) {
      setSlots([]);
      return;
    }
    setSlots((prev) => {
      for (const s of prev) {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      }
      return makeSlots(selectedItem.templateSpec);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId]);

  // 문서 검색 필터
  const filteredDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.subtitle.toLowerCase().includes(q)
    );
  }, [docQuery, docs]);

  // 품목 검색 필터
  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return currentItems;
    return currentItems.filter((it) => {
      const a = `${it.evidenceNo} ${it.name} ${it.qtyLabel} ${it.templateName}`.toLowerCase();
      return a.includes(q);
    });
  }, [itemQuery, currentItems]);

  // 총합계 (수량·금액 합산)
  const totalQty = useMemo(
    () =>
      filteredItems.reduce((sum, it) => sum + (it.qty ?? 0), 0),
    [filteredItems]
  );
  const totalAmount = useMemo(
    () =>
      filteredItems.reduce((sum, it) => sum + (it.amount ?? 0), 0),
    [filteredItems]
  );

  const progressDone = 0;
  const progressTotal = 23;

  const [previewFullOpen, setPreviewFullOpen] = useState(false);
  const [excelPreviewOpen, setExcelPreviewOpen] = useState(false);

  const sheetPreview = selectedDocId
    ? (docSheetPreview[selectedDocId] ?? null)
    : null;

  /** 엑셀 미리보기: 사용내역 있는 행만 1,2,3… 부여 */
  const excelPreviewProofNumbers = useMemo(() => {
    if (!sheetPreview?.rows?.length) return [];
    const nums: (number | null)[] = [];
    let next = 1;
    const descCol = 2;
    for (const row of sheetPreview.rows) {
      const cells = row.slice(0, 7);
      const desc = String(cells[descCol] ?? "").trim();
      const norm = desc.replace(/\s/g, "");
      if (desc && norm !== "계") nums.push(next++);
      else nums.push(null);
    }
    return nums;
  }, [sheetPreview?.rows]);

  const incomingFilled = useMemo(() => countFilled(slots, "incoming"), [slots]);
  const installFilled = useMemo(() => countFilled(slots, "install"), [slots]);

  const incomingMax = selectedItem?.templateSpec.incomingSlots ?? 0;
  const installMax = selectedItem?.templateSpec.installSlots ?? 0;

  function updateSlot(kind: PhotoKind, slotIndex: number, file?: File) {
    setSlots((prev) => {
      const next = prev.map((s) => ({ ...s }));
      const idx = next.findIndex((s) => s.kind === kind && s.slotIndex === slotIndex);
      if (idx < 0) return prev;

      // 기존 preview revoke
      if (next[idx].previewUrl) URL.revokeObjectURL(next[idx].previewUrl);

      if (!file) {
        next[idx].file = undefined;
        next[idx].previewUrl = undefined;
        return next;
      }

      // [프론트 1차 방어] 이미지 파일만 허용
      if (!file.type.startsWith("image/")) return prev;

      next[idx].file = file;
      next[idx].previewUrl = URL.createObjectURL(file);
      return next;
    });
  }

  function openExcelUpload() {
    excelInputRef.current?.click();
  }

  function clearAllUploaded() {
    const hasUploaded = docs.length > initialDocs.length || Object.keys(docItems).length > 0;
    if (!hasUploaded) return;
    if (!confirm("업로드된 문서와 테이블 내역을 모두 삭제할까요?")) return;
    setDocs([...initialDocs]);
    setDocItems({});
    setDocSheetPreview({});
    setSelectedDocId(initialDocs[0]?.id ?? "");
  }

  async function handleExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      alert("엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheetName = wb.SheetNames[0] ?? "";
      const ws = firstSheetName ? wb.Sheets[firstSheetName] : undefined;
      const title =
        firstSheetName.trim() || file.name.replace(/\.(xlsx|xls)$/i, "").trim() || "새 문서";
      const newDoc: Doc = {
        id: `doc_${Date.now()}`,
        title,
        subtitle: file.name,
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      const items = ws ? parseItemsFromSheet(ws, newDoc.id) : [];
      const sheetPreview = ws ? getSheetPreviewData(ws, firstSheetName) : null;
      setDocs((prev) => [...prev, newDoc]);
      setDocItems((prev) => ({ ...prev, [newDoc.id]: items }));
      if (sheetPreview) {
        setDocSheetPreview((prev) => ({ ...prev, [newDoc.id]: sheetPreview }));
      }
      setSelectedDocId(newDoc.id);
    } catch (err) {
      console.error(err);
      alert("엑셀 파일을 읽는 중 오류가 났습니다. 파일 형식을 확인해 주세요.");
    }
  }

  function openPreviewFull() {
    setPreviewFullOpen(true);
  }

  function closePreviewFull() {
    setPreviewFullOpen(false);
  }

  useEffect(() => {
    if (!previewFullOpen && !excelPreviewOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (excelPreviewOpen) setExcelPreviewOpen(false);
        else closePreviewFull();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewFullOpen, excelPreviewOpen]);

  function onClickPdf() {
    alert("PDF 출력은 다음 단계에서 연결합니다. (현재는 UI 완성/모션 적용 단계)");
  }

  return (
    <div className={styles.shell}>
      {/* 상단 바 */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandTitle}>EXPENSE PHOTO PLATFORM</div>
          <div className={styles.brandSub}>엑셀 한 행(품목) 기준으로 사진을 정확히 매칭합니다.</div>
        </div>

        <div className={styles.steps}>
          <div className={styles.stepActive}>문서 선택</div>
          <div className={styles.stepDot} />
          <div className={styles.step}>품목 선택</div>
          <div className={styles.stepDot} />
          <div className={styles.step}>사진 업로드 / 출력</div>
        </div>

        <div className={styles.topActions}>
          <div className={styles.progressText}>
            {progressDone}/{progressTotal} 완료
          </div>
          <button type="button" className={styles.btnSecondary} onClick={openPreviewFull}>
            미리보기 (전체 보기)
          </button>
          <button type="button" className={styles.btn} onClick={onClickPdf}>
            PDF 출력
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {/* 좌측 패널 */}
        <aside className={styles.sidebar}>
          <div className={styles.panelTitle}>문서 선택</div>

          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              value={docQuery}
              onChange={(e) => setDocQuery(e.target.value)}
              placeholder="문서명 또는 파일명으로 검색"
            />
          </div>

          <div className={styles.docList}>
            {filteredDocs.map((d) => {
              const active = d.id === selectedDocId;
              return (
                <button
                  key={d.id}
                  type="button"
                  className={active ? styles.docCardActive : styles.docCard}
                  onClick={() => setSelectedDocId(d.id)}
                >
                  <div className={styles.docTitle}>{d.title}</div>
                  <div className={styles.docSub}>{d.subtitle}</div>
                  <div className={styles.docMeta}>{d.updatedAt}</div>
                </button>
              );
            })}
          </div>

          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            className={styles.fileInput}
            onChange={handleExcelFile}
            aria-hidden
          />
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={openExcelUpload}
          >
            + 새 문서 업로드
          </button>
          <button
            type="button"
            className={styles.btnDelete}
            onClick={clearAllUploaded}
            disabled={docs.length <= initialDocs.length && Object.keys(docItems).length === 0}
          >
            전체삭제
          </button>
        </aside>

        {/* 메인 작업 영역 */}
        <main className={styles.main}>
          <section className={styles.docHeader}>
            <div className={styles.docHeaderTitle}>{selectedDoc?.title ?? "문서를 선택하세요"}</div>
            <div className={styles.docHeaderSub}>{selectedDoc?.subtitle ?? ""}</div>
          </section>

          <section className={styles.itemSection}>
            <div className={styles.itemTop}>
              <div className={styles.sectionTitle}>품목</div>
              <input
                className={styles.searchInputWide}
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="사용일자, 사용내역, 수량으로 검색"
              />
            </div>

            <div className={styles.itemTableHead}>
              <div className={styles.cellNum}>순번</div>
              <div>사용일자</div>
              <div>사용내역</div>
              <div className={styles.cellNum}>수량</div>
              <div className={styles.cellNum}>단가</div>
              <div className={styles.cellNum}>금액</div>
              <div>증빙번호</div>
            </div>

            <div className={styles.itemTable}>
              {filteredItems.map((it, index) => {
                const active = it.id === selectedItemId;
                const qtyDisplay =
                  it.qty != null ? String(it.qty) : it.qtyLabel;
                const unitPriceDisplay =
                  it.unitPrice != null ? it.unitPrice.toLocaleString("ko-KR") : "—";
                const amountDisplay =
                  it.amount != null ? it.amount.toLocaleString("ko-KR") : "—";
                return (
                  <button
                    key={it.id}
                    type="button"
                    className={active ? styles.itemRowActive : styles.itemRow}
                    onClick={() => setSelectedItemId(it.id)}
                  >
                    <div className={styles.cellNum}>{index + 1}</div>
                    <div className={styles.cellMono}>{it.useDate ?? "—"}</div>
                    <div className={styles.cellStrong} title={it.name}>{it.name}</div>
                    <div className={styles.cellNum}>{qtyDisplay}</div>
                    <div className={styles.cellNum}>{unitPriceDisplay}</div>
                    <div className={styles.cellNum}>{amountDisplay}</div>
                    <div className={styles.cellNum}>{it.proofNo ?? index + 1}</div>
                  </button>
                );
              })}
            </div>

            {filteredItems.length > 0 && (
              <div className={styles.itemTableTotal}>
                <div className={styles.cellNum} />
                <div className={styles.cellMuted} />
                <div className={styles.cellStrong}>총합계</div>
                <div className={styles.cellNum}>{totalQty.toLocaleString("ko-KR")}</div>
                <div className={styles.cellMuted}>—</div>
                <div className={styles.cellNum}>{totalAmount.toLocaleString("ko-KR")}</div>
                <div className={styles.cellMuted} />
              </div>
            )}
          </section>

          <section className={styles.photoSection}>
            <div className={styles.photoHeader}>
              <div className={styles.sectionTitle}>사진 슬롯</div>
              <div className={styles.slotCounter}>
                반입 {incomingFilled}/{incomingMax} · 지급·설치 {installFilled}/{installMax}
              </div>
            </div>

            <div className={styles.slotGrid}>
              {/* 반입 */}
              {Array.from({ length: incomingMax }, (_, i) => {
                const slot = slots.find((s) => s.kind === "incoming" && s.slotIndex === i);
                const idxLabel = clamp(i + 1, 1, 99);
                return (
                  <PhotoDropSlot
                    key={`incoming_${i}`}
                    title={`반입 (${idxLabel}/${incomingMax})`}
                    subtitle="드래그 또는 클릭"
                    previewUrl={slot?.previewUrl}
                    onPickFile={(file) => updateSlot("incoming", i, file)}
                    onClear={() => updateSlot("incoming", i, undefined)}
                  />
                );
              })}

              {/* 지급·설치 */}
              {Array.from({ length: installMax }, (_, i) => {
                const slot = slots.find((s) => s.kind === "install" && s.slotIndex === i);
                const idxLabel = clamp(i + 1, 1, 99);
                return (
                  <PhotoDropSlot
                    key={`install_${i}`}
                    title={`지급·설치 (${idxLabel}/${installMax})`}
                    subtitle="드래그 또는 클릭"
                    previewUrl={slot?.previewUrl}
                    onPickFile={(file) => updateSlot("install", i, file)}
                    onClear={() => updateSlot("install", i, undefined)}
                  />
                );
              })}
            </div>

            <div className={styles.bottomActions}>
              {sheetPreview && (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setExcelPreviewOpen(true)}
                >
                  엑셀 미리보기
                </button>
              )}
              <button type="button" className={styles.btnSecondary} onClick={openPreviewFull}>
                미리보기 (전체 보기)
              </button>
              <button type="button" className={styles.btn} onClick={onClickPdf}>
                PDF 출력
              </button>
            </div>
          </section>

          <section className={styles.devNote}>
            <div className={styles.devNoteTitle}>개발 메모</div>
            <div className={styles.devNoteText}>
              현재는 UI+모션 완성 단계입니다. 다음 단계에서 docs/items를 /api로 교체하고, 사진 업로드는
              Storage + (expense_item_id, kind, slot) 유니크 정책으로 upsert 연결합니다.
            </div>
          </section>
        </main>
      </div>

      {/* 엑셀 시트 미리보기 모달 (항목별 사용내역서 형식) */}
      {excelPreviewOpen && sheetPreview && (
        <div
          className={styles.previewFullOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="엑셀 미리보기"
        >
          <div
            className={styles.previewFullBackdrop}
            onClick={() => setExcelPreviewOpen(false)}
            onKeyDown={(e) => e.key === "Enter" && setExcelPreviewOpen(false)}
            role="button"
            tabIndex={0}
            aria-label="닫기"
          />
          <div className={styles.excelPreviewModal}>
            <div className={styles.previewFullHeader}>
              <h2 className={styles.previewFullTitle}>
                {selectedDoc?.title ?? sheetPreview.sheetName} — 엑셀 미리보기
              </h2>
              <button
                type="button"
                className={styles.previewFullCloseBtn}
                onClick={() => setExcelPreviewOpen(false)}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className={styles.excelPreviewBody}>
              <div className={styles.excelPreviewTableWrap}>
                <table className={styles.excelPreviewTable}>
                  <thead>
                    <tr>
                      {sheetPreview.headers.slice(0, 7).map((h: string, i: number) => (
                        <th key={i}>{h || `(열 ${i + 1})`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetPreview.rows.map((row: (string | number)[], ri: number) => {
                      const rowCells = row.slice(0, 7);
                      const proofColIndex = 6;
                      const proofNum = excelPreviewProofNumbers[ri];
                      return (
                        <tr key={ri}>
                          {sheetPreview.headers.slice(0, 7).map((_: string, ci: number) => {
                            const val = rowCells[ci];
                            let display: string =
                              typeof val === "number"
                                ? val.toLocaleString("ko-KR")
                                : String(val ?? "").trim();
                            if (!display || display === "—" || display === "-") display = "—";
                            if (ci === proofColIndex) {
                              display = proofNum != null ? String(proofNum) : display || "—";
                            }
                            return <td key={ci}>{display}</td>;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 업로드 전체 미리보기 모달 */}
      {previewFullOpen && (
        <div
          className={styles.previewFullOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="엑셀 업로드 미리보기"
        >
          <div
            className={styles.previewFullBackdrop}
            onClick={closePreviewFull}
            onKeyDown={(e) => e.key === "Enter" && closePreviewFull()}
            role="button"
            tabIndex={0}
            aria-label="닫기"
          />
          <div className={styles.previewFullModal}>
            <div className={styles.previewFullHeader}>
              <h2 className={styles.previewFullTitle}>엑셀 업로드 미리보기</h2>
              <button
                type="button"
                className={styles.previewFullCloseBtn}
                onClick={closePreviewFull}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className={styles.previewFullBody}>
              <div className={styles.previewFullDoc}>
                <div className={styles.previewFullLabel}>문서</div>
                <div className={styles.previewFullDocTitle}>{selectedDoc?.title ?? "—"}</div>
                <div className={styles.previewFullDocSub}>{selectedDoc?.subtitle ?? ""}</div>
              </div>
              {selectedItem && (
                <div className={styles.previewFullItem}>
                  <div className={styles.previewFullLabel}>품목</div>
                  <div className={styles.previewFullItemRow}>
                    <span>{formatNoX(selectedItem.evidenceNo)}</span>
                    <span className={styles.previewFullItemName}>{selectedItem.name}</span>
                    <span>{selectedItem.qtyLabel}</span>
                    <span className={styles.previewFullItemTemplate}>{selectedItem.templateName}</span>
                  </div>
                </div>
              )}
              <div className={styles.previewFullSlots}>
                <div className={styles.previewFullLabel}>사진 슬롯</div>
                <div className={styles.previewFullSlotGrid}>
                  {slots.map((slot) => {
                    const label =
                      slot.kind === "incoming"
                        ? `반입 (${slot.slotIndex + 1}/${incomingMax})`
                        : `지급·설치 (${slot.slotIndex + 1}/${installMax})`;
                    return (
                      <div key={`${slot.kind}_${slot.slotIndex}`} className={styles.previewFullSlotCard}>
                        <div className={styles.previewFullSlotImgWrap}>
                          {slot.previewUrl ? (
                            <img
                              className={styles.previewFullSlotImg}
                              src={slot.previewUrl}
                              alt={label}
                            />
                          ) : (
                            <div className={styles.previewFullSlotPlaceholder}>미등록</div>
                          )}
                        </div>
                        <div className={styles.previewFullSlotLabel}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
