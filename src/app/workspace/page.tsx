"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PhotoSheetPage, type PhotoSheetItem } from "@/components/PhotoSheet";
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
  /** 원본 카테고리 (엑셀 셀 그대로) */
  category_raw?: string;
  /** 정규화된 카테고리 키 (그룹핑/필터용) */
  category_key?: string;
  /** 표시용 카테고리 라벨 (key + suffix 결합) */
  category_label?: string;
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
  incomingSlots: 4,
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

/** category_key 문자열에서 정렬용 번호 파싱 (예: "2. 안전시설비 등" → 2) */
function parseCategorySortKey(cat: string): number {
  if (!cat || !cat.trim()) return 9999;
  const m = cat.trim().match(/^(\d+)/);
  return m ? Number(m[1]) : 9999;
}

/**
 * 카테고리 문자열 정규화
 * - 줄바꿈으로 split하여 "^\d+\." 번호가 있는 라인을 key로
 * - 나머지 라인들은 suffix로 합쳐 label 생성
 * @returns { key, label, hasNumber }
 */
function normalizeCategoryKey(raw: string): { key: string; label: string; hasNumber: boolean } {
  if (!raw) return { key: "", label: "", hasNumber: false };

  // 줄바꿈으로 split (병합셀에서 여러 줄이 올 수 있음)
  const lines = raw.split(/[\r\n]+/).map((l) => l.replace(/\t/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);

  if (lines.length === 0) return { key: "", label: "", hasNumber: false };

  // 첫 번째로 "^\d+\."로 시작하는 라인 찾기
  const keyLineIdx = lines.findIndex((l) => /^\d+\./.test(l));

  if (keyLineIdx >= 0) {
    const keyLine = lines[keyLineIdx];
    // key 이외의 라인들을 suffix로 결합
    const suffixLines = lines.filter((_, i) => i !== keyLineIdx);
    const suffix = suffixLines.join(" ").trim();
    const label = suffix ? `${keyLine} ${suffix}` : keyLine;
    return { key: keyLine, label, hasNumber: true };
  }

  // 번호가 없는 경우 (조각 텍스트)
  const combined = lines.join(" ").trim();
  return { key: combined, label: combined, hasNumber: false };
}

function parseItemsFromSheet(ws: XLSX.WorkSheet, docId: string): Item[] {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (string | number)[][];
  const norm = (v: string) => String(v ?? "").replace(/\s/g, "");

  let headerRowIndex = -1;
  let colCategory = -1;
  let colUsageDate = -1;
  let colDesc = -1;
  let colQty = -1;
  let colUnitPrice = -1;
  let colAmount = -1;
  let colEvidenceNo = -1;

  for (let r = 0; r < Math.min(data.length, 50); r++) {
    colCategory = colUsageDate = colDesc = colQty = colUnitPrice = colAmount = colEvidenceNo = -1;
    const row = data[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = norm(String(row[c] ?? ""));
      if (cell === "항목") colCategory = c;
      else if (cell === "사용일자") colUsageDate = c;
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
  // forward-fill: 번호가 있는 대표 카테고리 키/라벨 유지
  let lastCategoryKey = "";
  let lastCategoryLabel = "";

  for (let r = headerRowIndex + 1; r < data.length; r++) {
    const row = data[r] ?? [];
    const categoryRaw = colCategory >= 0 ? String(row[colCategory] ?? "").trim() : "";

    // 카테고리 정규화 및 번호 확인
    const { key: normalizedKey, label: normalizedLabel, hasNumber } = normalizeCategoryKey(categoryRaw);

    if (normalizedKey && hasNumber) {
      // 번호가 있는 항목이면 새 대표 키/라벨 시작
      lastCategoryKey = normalizedKey;
      lastCategoryLabel = normalizedLabel;
    } else if (normalizedKey && lastCategoryKey) {
      // 번호 없는 조각(예: "구입비 등")은 이전 대표 라벨에 suffix로 합침
      // 단, "계"는 제외
      if (normalizedKey !== "계" && !normalizedKey.includes("합계")) {
        lastCategoryLabel = `${lastCategoryLabel} ${normalizedKey}`;
      }
    }
    // 번호 없는 조각은 단독 키로 쓰지 않고 이전 대표 키에 귀속

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
      category_raw: categoryRaw || undefined,
      category_key: lastCategoryKey || undefined,
      category_label: lastCategoryLabel || undefined,
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

  const initialDocs: Doc[] = useMemo(() => [], []);

  const mockItems: Item[] = useMemo(() => {
    const raw: Item[] = [
      { id: "item_001", evidenceNo: 1, name: "확장", qtyLabel: "1개", qty: 1, useDate: "25.12.27", unitPrice: 25000, amount: 25000, templateName: "반입/지급-설치", templateSpec: DEFAULT_TEMPLATE_SPEC, category_key: "1. 공사비 등", category_label: "1. 공사비 등" },
      { id: "item_002", evidenceNo: 2, name: "안전난간", qtyLabel: "10m", qty: 10, useDate: "26.01.14", unitPrice: 500, amount: 5000, templateName: "반입/지급-설치", templateSpec: DEFAULT_TEMPLATE_SPEC, category_key: "2. 안전시설비 등", category_label: "2. 안전시설비 등 구매비 등" },
      { id: "item_003", evidenceNo: 3, name: "생명줄", qtyLabel: "2set", qty: 2, useDate: "26.01.14", unitPrice: 26000, amount: 52000, templateName: "반입/지급-설치", templateSpec: DEFAULT_TEMPLATE_SPEC, category_key: "2. 안전시설비 등", category_label: "2. 안전시설비 등 구매비 등" },
    ];
    return uniqueBy(raw, (x) => `${x.evidenceNo}__${x.name}`);
  }, []);

  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [docItems, setDocItems] = useState<Record<string, Item[]>>({});
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocs[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string>(mockItems[0]?.id ?? "");
  const [itemQuery, setItemQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const [rightPanelTab, setRightPanelTab] = useState<"data" | "photo">("data");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const currentItems = useMemo(() => docItems[selectedDocId] ?? mockItems, [docItems, selectedDocId, mockItems]);
  const selectedDoc = useMemo(() => docs.find((d) => d.id === selectedDocId) ?? null, [docs, selectedDocId]);
  const selectedItem = useMemo(() => currentItems.find((it) => it.id === selectedItemId) ?? null, [currentItems, selectedItemId]);

  // 모든 품목의 사진 슬롯 저장 (품목ID -> 슬롯 배열)
  const [allItemSlots, setAllItemSlots] = useState<Record<string, PhotoSlot[]>>({});

  // 현재 선택된 품목의 슬롯 (없으면 빈 슬롯 생성)
  const slots = useMemo(() => {
    if (!selectedItem) return [];
    const existing = allItemSlots[selectedItemId];
    if (existing) return existing;
    return makeSlots(selectedItem.templateSpec);
  }, [selectedItem, selectedItemId, allItemSlots]);

  useEffect(() => {
    const items = docItems[selectedDocId] ?? mockItems;
    const firstId = items[0]?.id ?? "";
    queueMicrotask(() => {
      setSelectedItemId((prev) => (items.some((it) => it.id === prev) ? prev : firstId));
    });
  }, [selectedDocId, docItems, mockItems]);

  // 품목 선택 시 슬롯이 없으면 초기화
  useEffect(() => {
    if (!selectedItem) return;
    if (!allItemSlots[selectedItemId]) {
      setAllItemSlots((prev) => ({
        ...prev,
        [selectedItemId]: makeSlots(selectedItem.templateSpec),
      }));
    }
  }, [selectedItemId, selectedItem, allItemSlots]);

  // cleanup: 컴포넌트 언마운트 시 모든 previewUrl 해제
  useEffect(() => {
    return () => {
      Object.values(allItemSlots).forEach((slots) => {
        slots.forEach((s) => {
          if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
        });
      });
    };
  }, []);

  // 사진이 등록된 품목 수 계산
  const itemsWithPhotos = useMemo(() => {
    return currentItems.filter((item) => {
      const slots = allItemSlots[item.id];
      if (!slots) return false;
      return slots.some((s) => s.file);
    });
  }, [currentItems, allItemSlots]);

  // PhotoSheetItem 배열 생성 (미리보기/출력용)
  const photoSheetItems: PhotoSheetItem[] = useMemo(() => {
    return itemsWithPhotos.map((item, idx) => {
      const slots = allItemSlots[item.id] ?? [];
      const inboundPhotos = slots
        .filter((s) => s.kind === "incoming" && s.previewUrl)
        .map((s) => s.previewUrl!);
      const installPhotos = slots
        .filter((s) => s.kind === "install" && s.previewUrl)
        .map((s) => s.previewUrl!);

      return {
        no: idx + 1,
        date: item.useDate ?? "",
        itemName: `${item.name} [${item.qtyLabel}]`,
        inboundPhotos,
        installPhotos,
      };
    });
  }, [itemsWithPhotos, allItemSlots]);

  const filteredItems = useMemo(() => {
    let list = currentItems;
    if (categoryFilter) {
      list = list.filter((it) => (it.category_key ?? "") === categoryFilter);
    }
    const q = itemQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((it) => {
      const a = `${it.evidenceNo} ${it.name} ${it.qtyLabel} ${it.useDate ?? ""} ${it.category_key ?? ""}`.toLowerCase();
      return a.includes(q);
    });
  }, [itemQuery, categoryFilter, currentItems]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of currentItems) {
      const c = it.category_key?.trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => parseCategorySortKey(a) - parseCategorySortKey(b));
  }, [currentItems]);

  const groupedItems = useMemo(() => {
    const groups: { category: string; label: string; items: Item[] }[] = [];
    const seen = new Map<string, { items: Item[] }>();
    for (const it of filteredItems) {
      const cat = it.category_key?.trim() || "(미분류)";
      if (!seen.has(cat)) seen.set(cat, { items: [] });
      seen.get(cat)!.items.push(it);
    }
    const keys = Array.from(seen.keys()).sort((a, b) => {
      if (a === "(미분류)") return 1;
      if (b === "(미분류)") return -1;
      return parseCategorySortKey(a) - parseCategorySortKey(b);
    });
    for (const k of keys) {
      const { items } = seen.get(k)!;
      // 그룹 내 마지막 아이템의 label 사용 (가장 완전한 label)
      const label = items[items.length - 1]?.category_label?.trim() || k;
      groups.push({ category: k, label, items });
    }
    return groups;
  }, [filteredItems]);

  const totalQty = useMemo(() => filteredItems.reduce((sum, it) => sum + (it.qty ?? 0), 0), [filteredItems]);
  const totalAmount = useMemo(() => filteredItems.reduce((sum, it) => sum + (it.amount ?? 0), 0), [filteredItems]);

  const progressDone = itemsWithPhotos.length;
  const progressTotal = currentItems.length || 1;

  const incomingFilled = useMemo(() => countFilled(slots, "incoming"), [slots]);
  const installFilled = useMemo(() => countFilled(slots, "install"), [slots]);
  const incomingMax = selectedItem?.templateSpec.incomingSlots ?? 1;
  const installMax = selectedItem?.templateSpec.installSlots ?? 4;

  function updateSlot(kind: PhotoKind, slotIndex: number, file?: File) {
    if (!selectedItemId) return;

    setAllItemSlots((prev) => {
      const currentSlots = prev[selectedItemId] ?? makeSlots(selectedItem?.templateSpec ?? DEFAULT_TEMPLATE_SPEC);
      const next = currentSlots.map((s) => ({ ...s }));
      const idx = next.findIndex((s) => s.kind === kind && s.slotIndex === slotIndex);
      if (idx < 0) return prev;
      if (next[idx].previewUrl) URL.revokeObjectURL(next[idx].previewUrl);
      if (!file) {
        next[idx].file = undefined;
        next[idx].previewUrl = undefined;
        return { ...prev, [selectedItemId]: next };
      }
      if (!file.type.startsWith("image/")) return prev;
      next[idx].file = file;
      next[idx].previewUrl = URL.createObjectURL(file);
      return { ...prev, [selectedItemId]: next };
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

  // 엑셀 내보내기 (A4 세로 형식 사진대지 - 3개 품목 = 1페이지)
  const exportToExcel = useCallback(async () => {
    if (itemsWithPhotos.length === 0) {
      alert("사진이 등록된 품목이 없습니다.");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("사진대지");

      // A4 세로 페이지 설정
      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.3, right: 0.3,
          top: 0.3, bottom: 0.3,
          header: 0.2, footer: 0.2,
        },
      };

      // 열 너비 설정 (8열: A~H)
      // 반입: B,C,D,E (4칸) / 설치: F,G,H,I (4칸) 대신
      // 반입: B,C (2x2) / 설치: D,E (2x2) 로 단순화
      worksheet.columns = [
        { width: 6 },   // A: 라벨 (날짜/항목)
        { width: 11 },  // B: 반입1
        { width: 11 },  // C: 반입2
        { width: 6 },   // D: 라벨
        { width: 11 },  // E: 설치1
        { width: 11 },  // F: 설치2
      ];

      // 스타일 정의
      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };

      const headerFill: ExcelJS.FillPattern = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE8E8E8" },
      };

      // 각 품목당 행 수: NO(1) + 헤더(1) + 사진2행(각60px) + 사진2행(각60px) + 날짜(1) + 항목(1) = 8행
      const ROWS_PER_ITEM = 8;
      const PHOTO_ROW_HEIGHT = 60; // 사진 셀 높이

      // 사진이 있는 품목들을 순회
      for (let idx = 0; idx < itemsWithPhotos.length; idx++) {
        const item = itemsWithPhotos[idx];
        const itemSlots = allItemSlots[item.id] ?? [];
        const startRow = idx * ROWS_PER_ITEM + 1;

        // ═══ NO 행 ═══
        worksheet.mergeCells(startRow, 1, startRow, 6);
        const noCell = worksheet.getCell(startRow, 1);
        noCell.value = `NO.${idx + 1}`;
        noCell.font = { bold: true, size: 12 };
        noCell.alignment = { horizontal: "center", vertical: "middle" };
        noCell.border = thinBorder;
        worksheet.getRow(startRow).height = 20;

        // ═══ 헤더 행 (반입사진 / 설치사진) ═══
        const headerRowNum = startRow + 1;
        worksheet.mergeCells(headerRowNum, 1, headerRowNum, 3);
        worksheet.mergeCells(headerRowNum, 4, headerRowNum, 6);

        const incomingHeader = worksheet.getCell(headerRowNum, 1);
        incomingHeader.value = "반입사진";
        incomingHeader.font = { bold: true, size: 10 };
        incomingHeader.fill = headerFill;
        incomingHeader.alignment = { horizontal: "center", vertical: "middle" };
        incomingHeader.border = thinBorder;

        const installHeader = worksheet.getCell(headerRowNum, 4);
        installHeader.value = "현장 설치 사진";
        installHeader.font = { bold: true, size: 10 };
        installHeader.fill = headerFill;
        installHeader.alignment = { horizontal: "center", vertical: "middle" };
        installHeader.border = thinBorder;

        worksheet.getRow(headerRowNum).height = 18;

        // ═══ 사진 영역 (2x2 그리드 x 2) ═══
        // 반입: 행1(B,C) 행2(B,C) = 4칸
        // 설치: 행1(E,F) 행2(E,F) = 4칸
        const photoRow1 = startRow + 2;
        const photoRow2 = startRow + 3;

        // 사진 셀 높이 설정
        worksheet.getRow(photoRow1).height = PHOTO_ROW_HEIGHT;
        worksheet.getRow(photoRow2).height = PHOTO_ROW_HEIGHT;

        // 반입 사진 슬롯 (4칸 고정)
        const incomingSlots = itemSlots.filter(s => s.kind === "incoming");
        // 설치 사진 슬롯 (4칸 고정)
        const installSlots = itemSlots.filter(s => s.kind === "install");

        // 반입 사진 셀 테두리 (2x2)
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 2; c++) {
            const row = photoRow1 + r;
            const col = 2 + c; // B=2, C=3
            const cell = worksheet.getCell(row, col);
            cell.border = thinBorder;
            cell.alignment = { horizontal: "center", vertical: "middle" };
          }
        }

        // 설치 사진 셀 테두리 (2x2)
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 2; c++) {
            const row = photoRow1 + r;
            const col = 5 + c; // E=5, F=6
            const cell = worksheet.getCell(row, col);
            cell.border = thinBorder;
            cell.alignment = { horizontal: "center", vertical: "middle" };
          }
        }

        // 라벨 열 (A, D) 병합
        worksheet.mergeCells(photoRow1, 1, photoRow2, 1);
        worksheet.mergeCells(photoRow1, 4, photoRow2, 4);

        // 반입 사진 삽입 (최대 4장)
        for (let i = 0; i < 4; i++) {
          const slot = incomingSlots[i];
          const row = photoRow1 + Math.floor(i / 2);
          const col = 2 + (i % 2); // B=2, C=3

          if (slot?.file) {
            const base64 = await fileToBase64(slot.file);
            const imageId = workbook.addImage({
              base64,
              extension: slot.file.type.includes("png") ? "png" : "jpeg",
            });
            worksheet.addImage(imageId, {
              tl: { col: col - 1 + 0.05, row: row - 1 + 0.05 },
              br: { col: col - 0.05, row: row - 0.05 },
            });
          }
        }

        // 설치 사진 삽입 (최대 4장)
        for (let i = 0; i < 4; i++) {
          const slot = installSlots[i];
          const row = photoRow1 + Math.floor(i / 2);
          const col = 5 + (i % 2); // E=5, F=6

          if (slot?.file) {
            const base64 = await fileToBase64(slot.file);
            const imageId = workbook.addImage({
              base64,
              extension: slot.file.type.includes("png") ? "png" : "jpeg",
            });
            worksheet.addImage(imageId, {
              tl: { col: col - 1 + 0.05, row: row - 1 + 0.05 },
              br: { col: col - 0.05, row: row - 0.05 },
            });
          }
        }

        // ═══ 날짜 행 ═══
        const dateRowNum = startRow + 4;

        const dateLabelCell1 = worksheet.getCell(dateRowNum, 1);
        dateLabelCell1.value = "날짜";
        dateLabelCell1.font = { bold: true, size: 9 };
        dateLabelCell1.fill = headerFill;
        dateLabelCell1.alignment = { horizontal: "center", vertical: "middle" };
        dateLabelCell1.border = thinBorder;

        worksheet.mergeCells(dateRowNum, 2, dateRowNum, 3);
        const dateValueCell1 = worksheet.getCell(dateRowNum, 2);
        dateValueCell1.value = item.useDate ?? "";
        dateValueCell1.alignment = { horizontal: "center", vertical: "middle" };
        dateValueCell1.border = thinBorder;

        const dateLabelCell2 = worksheet.getCell(dateRowNum, 4);
        dateLabelCell2.value = "날짜";
        dateLabelCell2.font = { bold: true, size: 9 };
        dateLabelCell2.fill = headerFill;
        dateLabelCell2.alignment = { horizontal: "center", vertical: "middle" };
        dateLabelCell2.border = thinBorder;

        worksheet.mergeCells(dateRowNum, 5, dateRowNum, 6);
        const dateValueCell2 = worksheet.getCell(dateRowNum, 5);
        dateValueCell2.value = item.useDate ?? "";
        dateValueCell2.alignment = { horizontal: "center", vertical: "middle" };
        dateValueCell2.border = thinBorder;

        worksheet.getRow(dateRowNum).height = 18;

        // ═══ 항목 행 ═══
        const itemRowNum = startRow + 5;

        const itemLabelCell1 = worksheet.getCell(itemRowNum, 1);
        itemLabelCell1.value = "항목";
        itemLabelCell1.font = { bold: true, size: 9 };
        itemLabelCell1.fill = headerFill;
        itemLabelCell1.alignment = { horizontal: "center", vertical: "middle" };
        itemLabelCell1.border = thinBorder;

        worksheet.mergeCells(itemRowNum, 2, itemRowNum, 3);
        const itemValueCell1 = worksheet.getCell(itemRowNum, 2);
        itemValueCell1.value = `${item.name} [${item.qtyLabel}]`;
        itemValueCell1.alignment = { horizontal: "center", vertical: "middle" };
        itemValueCell1.border = thinBorder;

        const itemLabelCell2 = worksheet.getCell(itemRowNum, 4);
        itemLabelCell2.value = "항목";
        itemLabelCell2.font = { bold: true, size: 9 };
        itemLabelCell2.fill = headerFill;
        itemLabelCell2.alignment = { horizontal: "center", vertical: "middle" };
        itemLabelCell2.border = thinBorder;

        worksheet.mergeCells(itemRowNum, 5, itemRowNum, 6);
        const itemValueCell2 = worksheet.getCell(itemRowNum, 5);
        itemValueCell2.value = `${item.name} [${item.qtyLabel}]`;
        itemValueCell2.alignment = { horizontal: "center", vertical: "middle" };
        itemValueCell2.border = thinBorder;

        worksheet.getRow(itemRowNum).height = 18;

        // ═══ 구분선 ═══
        worksheet.getRow(startRow + 6).height = 5;
        worksheet.getRow(startRow + 7).height = 5;
      }

      // 파일 다운로드
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `사진대지_${itemsWithPhotos.length}건_${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error(err);
      alert("엑셀 내보내기 중 오류가 발생했습니다: " + (err instanceof Error ? err.message : "알 수 없는 오류"));
    }
  }, [itemsWithPhotos, allItemSlots]);

  // File을 Base64로 변환
  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // data:image/jpeg;base64, 부분 제거
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
          <button type="button" className={styles.headerBtn} onClick={() => setShowPreview(true)}>미리보기</button>
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

              <div className={styles.sheetSelect}>
                <label className={styles.sheetSelectLabel}>항목</label>
                <select
                  className={styles.sheetSelectInput}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">전체</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
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
                        description={itemQuery.trim() || categoryFilter ? "검색·필터 조건을 변경해 보세요." : "엑셀 파일을 업로드하세요."}
                      />
                    </td>
                  </tr>
                ) : (
                  (() => {
                    let seqNo = 0;
                    return groupedItems.map((grp) => (
                      <React.Fragment key={grp.category}>
                        <tr className={styles.groupHeaderRow}>
                          <td colSpan={7} className={styles.groupHeaderCell}>
                            {grp.label}
                          </td>
                        </tr>
                        {grp.items.map((it) => {
                          seqNo += 1;
                          const isActive = it.id === selectedItemId;
                          const hasPhoto = allItemSlots[it.id]?.some((s) => s.file) ?? false;
                          return (
                            <tr
                              key={it.id}
                              className={`${isActive ? styles.rowActive : styles.row} ${hasPhoto ? styles.rowDone : ""}`}
                              onClick={() => setSelectedItemId(it.id)}
                            >
                              <td className={styles.colSeq}>
                                {hasPhoto && (
                                  <span className={styles.doneCheck}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </span>
                                )}
                                {seqNo}
                              </td>
                              <td className={styles.colDate}>{it.useDate ?? "—"}</td>
                              <td className={styles.colName}>{it.name}</td>
                              <td className={styles.colQty}>{it.qty ?? it.qtyLabel}</td>
                              <td className={styles.colPrice}>{it.unitPrice?.toLocaleString("ko-KR") ?? "—"}</td>
                              <td className={styles.colAmount}>{it.amount?.toLocaleString("ko-KR") ?? "—"}</td>
                              <td className={styles.colProof}>{it.proofNo ?? it.evidenceNo}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ));
                  })()
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
                <div className={styles.photoRow}>
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
                </div>
                <div className={styles.photoRow}>
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

              {/* 저장 버튼 */}
              <div className={styles.saveButtonArea}>
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={exportToExcel}
                  disabled={itemsWithPhotos.length === 0}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {itemsWithPhotos.length > 0
                    ? `사진대지 저장 (${itemsWithPhotos.length}건)`
                    : "사진대지 저장"}
                </button>
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

      {/* 미리보기 모달 */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            className={styles.previewOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              className={styles.previewModal}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.previewHeader}>
                <h2 className={styles.previewTitle}>사진대지 미리보기</h2>
                <div className={styles.previewActions}>
                  <button
                    type="button"
                    className={styles.previewExportBtn}
                    onClick={exportToExcel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    엑셀로 내보내기
                  </button>
                  <button
                    type="button"
                    className={styles.previewClose}
                    onClick={() => setShowPreview(false)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className={styles.previewContent}>
                <PhotoSheetPage items={photoSheetItems} preview />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
