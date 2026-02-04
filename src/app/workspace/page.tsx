"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import styles from "./WorkspacePage.module.css";

type Doc = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
};

type TemplateSpec = {
  incomingSlots: number;
  installSlots: number;
};

type Item = {
  id: string;
  evidenceNo: number;
  name: string;
  qtyLabel: string;
  qty?: number;
  useDate?: string;
  unitPrice?: number | null;
  amount?: number | null;
  proofNo?: string;
  templateName: string;
  templateSpec: TemplateSpec;
};

type PhotoKind = "incoming" | "install";

type PhotoSlot = {
  kind: PhotoKind;
  slotIndex: number;
  file?: File;
  previewUrl?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function parseItemsFromSheet(ws: XLSX.WorkSheet, docId: string): Item[] {
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

function PhotoDropSlot(props: {
  title: string;
  subtitle: string;
  previewUrl?: string;
  onPickFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function onChoose() {
    if (props.disabled) return;
    inputRef.current?.click();
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    props.onPickFile(f);
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

  return (
    <div
      className={`${styles.photoSlot} ${dragging ? styles.photoSlotDragging : ""} ${props.compact ? styles.photoSlotCompact : ""}`}
      role="button"
      tabIndex={0}
      onClick={onChoose}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChoose()}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={onInputChange}
        disabled={props.disabled}
      />

      {props.previewUrl ? (
        <div className={styles.photoSlotPreview}>
          <img src={props.previewUrl} alt={props.title} />
          <div className={styles.photoSlotOverlay}>
            <span className={styles.photoSlotLabel}>{props.title}</span>
            <div className={styles.photoSlotActions}>
              <button type="button" onClick={(e) => { e.stopPropagation(); onChoose(); }}>교체</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); props.onClear(); }}>삭제</button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.photoSlotEmpty}>
          <div className={styles.photoSlotIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <span className={styles.photoSlotTitle}>{props.title}</span>
          {!props.compact && <span className={styles.photoSlotHint}>클릭 또는 드래그</span>}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialDocs: Doc[] = useMemo(
    () => [
      { id: "doc_001", title: "블랑써밋 74", subtitle: "2023_정리검검_점검시각자료.xlsx", updatedAt: "2026-02-02" },
      { id: "doc_002", title: "향담 대리점 리뉴얼", subtitle: "2023_정리검검_점검시각자료.xlsx", updatedAt: "2026-02-01" },
      { id: "doc_003", title: "절강 신축 공사", subtitle: "2023_정리검검_점검시각자료.xlsx", updatedAt: "2026-01-30" },
    ],
    []
  );

  const mockItems: Item[] = useMemo(() => {
    const raw: Item[] = [
      { id: "item_001", evidenceNo: 1, name: "확장", qtyLabel: "1개", qty: 1, useDate: "25.12.27", unitPrice: 25000, amount: 25000, templateName: "반입/지급-설치", templateSpec: DEFAULT_TEMPLATE_SPEC },
      { id: "item_002", evidenceNo: 2, name: "안전난간", qtyLabel: "10m", qty: 10, useDate: "26.01.14", unitPrice: 500, amount: 5000, templateName: "반입/지급-설치", templateSpec: DEFAULT_TEMPLATE_SPEC },
      { id: "item_003", evidenceNo: 3, name: "생명줄", qtyLabel: "2set", qty: 2, useDate: "26.01.14", unitPrice: 26000, amount: 52000, templateName: "반입/지급-설치", templateSpec: DEFAULT_TEMPLATE_SPEC },
    ];
    return uniqueBy(raw, (x) => `${x.evidenceNo}__${x.name}`);
  }, []);

  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [docItems, setDocItems] = useState<Record<string, Item[]>>({});
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocs[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string>(mockItems[0]?.id ?? "");
  const [itemQuery, setItemQuery] = useState("");

  const [rightPanelTab, setRightPanelTab] = useState<"data" | "photo">("data");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);

  const currentItems = useMemo(() => docItems[selectedDocId] ?? mockItems, [docItems, selectedDocId, mockItems]);
  const selectedDoc = useMemo(() => docs.find((d) => d.id === selectedDocId) ?? null, [docs, selectedDocId]);
  const selectedItem = useMemo(() => currentItems.find((it) => it.id === selectedItemId) ?? null, [currentItems, selectedItemId]);

  const [slots, setSlots] = useState<PhotoSlot[]>(() => (selectedItem ? makeSlots(selectedItem.templateSpec) : []));
  const latestSlotsRef = useRef<PhotoSlot[]>([]);

  useEffect(() => {
    latestSlotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    const items = docItems[selectedDocId] ?? mockItems;
    const firstId = items[0]?.id ?? "";
    queueMicrotask(() => {
      setSelectedItemId((prev) => (items.some((it) => it.id === prev) ? prev : firstId));
    });
  }, [selectedDocId, docItems, mockItems]);

  useEffect(() => {
    if (!selectedItem) {
      queueMicrotask(() => setSlots([]));
      return;
    }
    const spec = selectedItem.templateSpec;
    queueMicrotask(() => {
      setSlots((prev) => {
        for (const s of prev) {
          if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
        }
        return makeSlots(spec);
      });
    });
  }, [selectedItemId, selectedItem]);

  useEffect(() => {
    return () => {
      latestSlotsRef.current.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
    };
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return currentItems;
    return currentItems.filter((it) => {
      const a = `${it.evidenceNo} ${it.name} ${it.qtyLabel} ${it.useDate ?? ""}`.toLowerCase();
      return a.includes(q);
    });
  }, [itemQuery, currentItems]);

  const totalQty = useMemo(() => filteredItems.reduce((sum, it) => sum + (it.qty ?? 0), 0), [filteredItems]);
  const totalAmount = useMemo(() => filteredItems.reduce((sum, it) => sum + (it.amount ?? 0), 0), [filteredItems]);

  const progressDone = 0;
  const progressTotal = currentItems.length || 23;

  const incomingFilled = useMemo(() => countFilled(slots, "incoming"), [slots]);
  const installFilled = useMemo(() => countFilled(slots, "install"), [slots]);
  const incomingMax = selectedItem?.templateSpec.incomingSlots ?? 1;
  const installMax = selectedItem?.templateSpec.installSlots ?? 4;

  function updateSlot(kind: PhotoKind, slotIndex: number, file?: File) {
    setSlots((prev) => {
      const next = prev.map((s) => ({ ...s }));
      const idx = next.findIndex((s) => s.kind === kind && s.slotIndex === slotIndex);
      if (idx < 0) return prev;
      if (next[idx].previewUrl) URL.revokeObjectURL(next[idx].previewUrl);
      if (!file) {
        next[idx].file = undefined;
        next[idx].previewUrl = undefined;
        return next;
      }
      if (!file.type.startsWith("image/")) return prev;
      next[idx].file = file;
      next[idx].previewUrl = URL.createObjectURL(file);
      return next;
    });
  }

  useEffect(() => {
    if (searchParams.get("openUpload") === "1") {
      router.replace("/workspace", { scroll: false });
      const t = setTimeout(() => excelInputRef.current?.click(), 100);
      return () => clearTimeout(t);
    }
  }, [searchParams, router]);

  async function handleExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setExcelError("엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.");
      return;
    }

    setExcelError(null);
    setIsExcelLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheetName = wb.SheetNames[0] ?? "";
      const ws = firstSheetName ? wb.Sheets[firstSheetName] : undefined;

      const title = firstSheetName.trim() || file.name.replace(/\.(xlsx|xls)$/i, "").trim() || "새 문서";

      const newDoc: Doc = {
        id: `doc_${Date.now()}`,
        title,
        subtitle: file.name,
        updatedAt: new Date().toISOString().slice(0, 10),
      };

      const items = ws ? parseItemsFromSheet(ws, newDoc.id) : [];

      setDocs((prev) => [...prev, newDoc]);
      setDocItems((prev) => ({ ...prev, [newDoc.id]: items }));
      setSelectedDocId(newDoc.id);
    } catch (err) {
      console.error(err);
      setExcelError("엑셀 파일을 읽는 중 오류가 났습니다.");
    } finally {
      setIsExcelLoading(false);
    }
  }

  function onClickPdf() {
    alert("PDF 출력은 다음 단계에서 연결합니다.");
  }

  return (
    <div className={styles.workspace}>
      {/* 상단 헤더 */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <a href="/" className={styles.logo}>PhotoSheet</a>
          <span className={styles.headerDivider} />
          <span className={styles.headerDocName}>{selectedDoc?.title ?? "문서 선택"}</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.progressBadge}>
            <span className={styles.progressCount}>{progressDone}</span>
            <span className={styles.progressSep}>/</span>
            <span className={styles.progressTotal}>{progressTotal}</span>
            <span className={styles.progressLabel}>완료</span>
          </span>
          <button type="button" className={styles.headerBtn}>미리보기</button>
          <button type="button" className={styles.headerBtnPrimary} onClick={onClickPdf}>PDF 출력</button>
        </div>
      </header>

      {/* 메인 영역 */}
      <div className={styles.main}>
        {/* 좌측: 테이블 + 사진 슬롯 */}
        <div className={styles.content}>
          {/* 툴바 */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <button type="button" className={styles.toolBtn} onClick={() => excelInputRef.current?.click()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <span>새 문서</span>
              </button>

              <div className={styles.toolDivider} />

              <div className={styles.sheetSelect}>
                <label className={styles.sheetSelectLabel}>시트</label>
                <select
                  className={styles.sheetSelectInput}
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                >
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </div>

              <div className={styles.toolDivider} />

              <div className={styles.searchBox}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="품목 검색..."
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.toolbarRight}>
              <span className={styles.itemCount}>{filteredItems.length}개 품목</span>
            </div>
          </div>

          {/* 테이블 */}
          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th className={styles.colSeq}>순번</th>
                  <th className={styles.colDate}>사용일자</th>
                  <th className={styles.colName}>사용내역</th>
                  <th className={styles.colQty}>수량</th>
                  <th className={styles.colPrice}>단가</th>
                  <th className={styles.colAmount}>금액</th>
                  <th className={styles.colProof}>증빙번호</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyRow}>
                      <EmptyState
                        title="품목이 없습니다"
                        description={itemQuery.trim() ? "검색 조건을 변경해 보세요." : "엑셀 파일을 업로드하세요."}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it, idx) => {
                    const isActive = it.id === selectedItemId;
                    return (
                      <tr
                        key={it.id}
                        className={isActive ? styles.rowActive : styles.row}
                        onClick={() => setSelectedItemId(it.id)}
                      >
                        <td className={styles.colSeq}>{idx + 1}</td>
                        <td className={styles.colDate}>{it.useDate ?? "—"}</td>
                        <td className={styles.colName}>{it.name}</td>
                        <td className={styles.colQty}>{it.qty ?? it.qtyLabel}</td>
                        <td className={styles.colPrice}>{it.unitPrice?.toLocaleString("ko-KR") ?? "—"}</td>
                        <td className={styles.colAmount}>{it.amount?.toLocaleString("ko-KR") ?? "—"}</td>
                        <td className={styles.colProof}>{it.proofNo ?? idx + 1}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredItems.length > 0 && (
                <tfoot>
                  <tr className={styles.totalRow}>
                    <td className={styles.colSeq} />
                    <td className={styles.colDate} />
                    <td className={styles.colName}>합계</td>
                    <td className={styles.colQty}>{totalQty.toLocaleString("ko-KR")}</td>
                    <td className={styles.colPrice}>—</td>
                    <td className={styles.colAmount}>{totalAmount.toLocaleString("ko-KR")}</td>
                    <td className={styles.colProof} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 선택된 품목 + 사진 슬롯 */}
          {selectedItem && (
            <div className={styles.photoArea}>
              <div className={styles.photoAreaHeader}>
                <div className={styles.selectedItemInfo}>
                  <span className={styles.selectedItemBadge}>선택됨</span>
                  <span className={styles.selectedItemName}>{selectedItem.name}</span>
                  <span className={styles.selectedItemQty}>{selectedItem.qtyLabel}</span>
                </div>
                <div className={styles.slotStatus}>
                  <span>반입 {incomingFilled}/{incomingMax}</span>
                  <span className={styles.slotStatusDivider}>·</span>
                  <span>설치 {installFilled}/{installMax}</span>
                </div>
              </div>

              <div className={styles.photoGrid}>
                {Array.from({ length: incomingMax }, (_, i) => {
                  const slot = slots.find((s) => s.kind === "incoming" && s.slotIndex === i);
                  return (
                    <PhotoDropSlot
                      key={`incoming_${i}`}
                      title={`반입 ${i + 1}`}
                      subtitle=""
                      previewUrl={slot?.previewUrl}
                      onPickFile={(file) => updateSlot("incoming", i, file)}
                      onClear={() => updateSlot("incoming", i, undefined)}
                    />
                  );
                })}
                {Array.from({ length: installMax }, (_, i) => {
                  const slot = slots.find((s) => s.kind === "install" && s.slotIndex === i);
                  return (
                    <PhotoDropSlot
                      key={`install_${i}`}
                      title={`설치 ${i + 1}`}
                      subtitle=""
                      previewUrl={slot?.previewUrl}
                      onPickFile={(file) => updateSlot("install", i, file)}
                      onClear={() => updateSlot("install", i, undefined)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 우측 패널 */}
        <aside className={`${styles.rightPanel} ${rightPanelOpen ? styles.rightPanelOpen : ""}`}>
          <div className={styles.panelTabs}>
            <button
              type="button"
              className={`${styles.panelTab} ${rightPanelTab === "data" ? styles.panelTabActive : ""}`}
              onClick={() => setRightPanelTab("data")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>Data</span>
            </button>
            <button
              type="button"
              className={`${styles.panelTab} ${rightPanelTab === "photo" ? styles.panelTabActive : ""}`}
              onClick={() => setRightPanelTab("photo")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              <span>사진</span>
            </button>
          </div>

          <div className={styles.panelBody}>
            {rightPanelTab === "data" && (
              <div className={styles.panelSection}>
                <div className={styles.panelSectionTitle}>문서 목록</div>
                <div className={styles.docList}>
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`${styles.docItem} ${d.id === selectedDocId ? styles.docItemActive : ""}`}
                      onClick={() => setSelectedDocId(d.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className={styles.docItemName}>{d.title}</span>
                    </button>
                  ))}
                </div>

                <button type="button" className={styles.panelAddBtn} onClick={() => excelInputRef.current?.click()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  새 문서 업로드
                </button>
              </div>
            )}

            {rightPanelTab === "photo" && selectedItem && (
              <div className={styles.panelSection}>
                <div className={styles.panelSectionTitle}>
                  {selectedItem.name}
                </div>
                <div className={styles.panelPhotoStatus}>
                  <div className={styles.statusItem}>
                    <span className={styles.statusLabel}>반입</span>
                    <span className={styles.statusValue}>{incomingFilled}/{incomingMax}</span>
                  </div>
                  <div className={styles.statusItem}>
                    <span className={styles.statusLabel}>설치</span>
                    <span className={styles.statusValue}>{installFilled}/{installMax}</span>
                  </div>
                </div>

                <div className={styles.panelPhotoGrid}>
                  {Array.from({ length: incomingMax }, (_, i) => {
                    const slot = slots.find((s) => s.kind === "incoming" && s.slotIndex === i);
                    return (
                      <PhotoDropSlot
                        key={`panel_incoming_${i}`}
                        title={`반입 ${i + 1}`}
                        subtitle=""
                        previewUrl={slot?.previewUrl}
                        onPickFile={(file) => updateSlot("incoming", i, file)}
                        onClear={() => updateSlot("incoming", i, undefined)}
                        compact
                      />
                    );
                  })}
                  {Array.from({ length: installMax }, (_, i) => {
                    const slot = slots.find((s) => s.kind === "install" && s.slotIndex === i);
                    return (
                      <PhotoDropSlot
                        key={`panel_install_${i}`}
                        title={`설치 ${i + 1}`}
                        subtitle=""
                        previewUrl={slot?.previewUrl}
                        onPickFile={(file) => updateSlot("install", i, file)}
                        onClear={() => updateSlot("install", i, undefined)}
                        compact
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* 패널 토글 */}
        <button
          type="button"
          className={styles.panelToggle}
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          aria-label={rightPanelOpen ? "패널 닫기" : "패널 열기"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {rightPanelOpen ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      {/* 히든 파일 인풋 */}
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls"
        className={styles.hiddenInput}
        onChange={handleExcelFile}
      />

      {/* 로딩 오버레이 */}
      {isExcelLoading && (
        <div className={styles.loadingOverlay}>
          <LoadingState label="엑셀 파일 불러오는 중…" />
        </div>
      )}

      {/* 에러 토스트 */}
      <AnimatePresence>
        {excelError && (
          <motion.div
            className={styles.errorToast}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <span>{excelError}</span>
            <button type="button" onClick={() => setExcelError(null)}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
