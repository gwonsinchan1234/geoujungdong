"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import PhotoSheetView from "@/components/photo-sheet/PhotoSheetView";
import type { PhotoBlock, BlockPhoto, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "@/components/photo-sheet/types";
import { parseExcelBuffer } from "@/lib/parseExcel";
import type { ParsedSheet } from "@/lib/parseExcel";
import { photoDraft } from "@/lib/photoDraft";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";
import GabjiFormView from "@/components/gabji-form/GabjiFormView";
import { makeEmptyGabji, DEFAULT_ITEMS } from "@/components/gabji-form/types";
import type { GabjiData } from "@/components/gabji-form/types";
import ItemListView from "@/components/item-list/ItemListView";
import type { ItemData } from "@/components/item-list/types";
import { parseNum as parseItemNum, sumByCategory } from "@/components/item-list/types";

// ── 이미지 압축 ──────────────────────────────────────────────────
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB (직접 Supabase 업로드 — Vercel 제한 없음)

async function compressImage(file: File, maxPx: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error("compress failed")),
        "image/jpeg", quality
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

function colLetter(col: number): string {
  let r = "";
  while (col > 0) { col--; r = String.fromCharCode(65 + (col % 26)) + r; col = Math.floor(col / 26); }
  return r;
}

/** 셀/폼 값이 객체일 때 "[object Object]" 대신 빈 문자열 등 안전한 문자열로 표시 */
function toCellDisplayString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("text" in v && typeof (v as { text: unknown }).text === "string") return (v as { text: string }).text;
    if ("value" in v) return String((v as { value: unknown }).value ?? "");
    return "";
  }
  return String(v);
}

function trimSheet(sheet: ParsedSheet, sheetIdx: number, formValues: Record<string, string>) {
  // 갑지(커버) 시트는 인쇄영역/내용기준 트리밍 없이 전체 시트를 그대로 사용
  if (isCoverSheet(sheet.name)) {
    const trimmedRows = sheet.rows;
    const usedCols = sheet.colWidths.length;
    const colWidths = sheet.colWidths;
    return { trimmedRows, usedCols, colWidths, rowOffset: 0, colOffset: 0 };
  }

  const pa = sheet.printArea;
  if (pa) {
    // Restrict to print area (1-based r1/c1/r2/c2 → 0-based slicing)
    const rowStart = pa.r1 - 1;
    const colStart = pa.c1 - 1;
    const trimmedRows = sheet.rows
      .slice(rowStart, Math.min(pa.r2, sheet.rows.length))
      .map(row => ({ ...row, cells: row.cells.slice(colStart, pa.c2) }));
    const usedCols  = pa.c2 - colStart;
    const colWidths = sheet.colWidths.slice(colStart, pa.c2);
    return { trimmedRows, usedCols, colWidths, rowOffset: rowStart, colOffset: colStart };
  }

  let lastRow = sheet.rows.length - 1;
  while (lastRow >= 0) {
    const row = sheet.rows[lastRow];
    const has = row.cells.some((c, ci) => {
      if (c.skip) return false;
      return toCellDisplayString(formValues[`${sheetIdx}__${colLetter(ci + 1)}${lastRow + 1}`] ?? c.value).trim() !== "";
    });
    if (has) break;
    lastRow--;
  }
  const trimmedRows = sheet.rows.slice(0, lastRow + 1);
  let lastCol = sheet.colWidths.length - 1;
  while (lastCol >= 0) {
    const has = trimmedRows.some((row, ri) => {
      const c = row.cells[lastCol];
      if (!c || c.skip) return false;
      return toCellDisplayString(formValues[`${sheetIdx}__${colLetter(lastCol + 1)}${ri + 1}`] ?? c.value).trim() !== "";
    });
    if (has) break;
    lastCol--;
  }
  const usedCols  = lastCol + 1;
  const colWidths = sheet.colWidths.slice(0, usedCols);
  return { trimmedRows, usedCols, colWidths, rowOffset: 0, colOffset: 0 };
}

/** A4 세로 기준 (72dpi): 210mm × 297mm */
const A4_W = 595;
const A4_H = 842;

const PHOTO_KEYWORDS = ["사진대지", "사진", "보호구", "시설물", "위험성", "건강관리", "교육"];
const isPhotoSheet = (name: string) => PHOTO_KEYWORDS.some(k => name.includes(k));

/** 수당·인건비 시트: 문서형 레이아웃(파란 테두리, 지급 내역 등) 적용 */
const ALLOWANCE_KEYWORDS = ["수당", "인건비", "업무수당"];
const isAllowanceSheet = (name: string) => ALLOWANCE_KEYWORDS.some(k => name.includes(k));

/** 갑지(커버) 시트 */
const isCoverSheet = (name: string) => name.trim() === "갑지" || name.includes("갑지");

/** 항목별세부내역 시트 */
const isItemSheet = (name: string) => name.includes("항목별세부내역") || name.includes("항목별") || name === "항목";


function xlsxCellStr(ws: XLSX.WorkSheet, r: number, c: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return "";
  if (cell.t === "d" || cell.v instanceof Date) {
    const d = cell.v as Date;
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}.${mm}.${dd}`;
  }
  return String(cell.v ?? "").trim();
}

// rawBuf(xlsx 원본)에서 항목별세부내역 기준으로 전체 사진대지 블록 생성
function parsePhotoBlocksFromRaw(rawBuf: ArrayBuffer, sheetNames: string[]): Record<string, PhotoBlock[]> {
  const wb = XLSX.read(rawBuf, { type: "array", cellDates: true });

  // ① 항목별세부내역 → NO → { itemNumber, date, label } (증빙번호 없으면 내용만 있어도 자동 1,2,3… 부여)
  const detailWs = wb.Sheets["항목별세부내역"];
  if (!detailWs) return {};
  const range = XLSX.utils.decode_range(detailWs["!ref"] ?? "A1");
  type RowInfo = { itemNumber: number; no?: number; r: number; date: string; label: string };
  const rowsByItem = new Map<number, RowInfo[]>();
  let currentItem = 0;

  for (let r = range.s.r; r <= range.e.r; r++) {
    const col0 = xlsxCellStr(detailWs, r, 0);
    const m0 = col0.replace(/\s/g, "").match(/^(\d+)\./);
    if (m0) currentItem = parseInt(m0[1]);
    if (currentItem === 0) continue;

    const date = xlsxCellStr(detailWs, r, 1);
    const name = xlsxCellStr(detailWs, r, 2);
    const unitPrice = xlsxCellStr(detailWs, r, 4); // 단가
    const amount = xlsxCellStr(detailWs, r, 5);   // 금액
    const col6 = xlsxCellStr(detailWs, r, 6);     // 증빙번호
    const mNo = col6.replace(/\s/g, "").toUpperCase().match(/^NO\.?(\d+)$/);
    const no = mNo ? parseInt(mNo[1]) : undefined;
    // 단가·금액에 값이 있으면 행으로 인식 → 증빙번호 자동 넘버링 대상
    const hasContent = unitPrice.trim() !== "" && amount.trim() !== "";
    if (!hasContent) continue;

    if (!rowsByItem.has(currentItem)) rowsByItem.set(currentItem, []);
    rowsByItem.get(currentItem)!.push({ itemNumber: currentItem, no, r, date, label: name });
  }

  // 항목별로 행 순서 유지하면서 증빙번호 비어 있으면 1,2,3… 자동 부여
  const noDetails = new Map<string, { itemNumber: number; no: number; date: string; label: string }>();
  for (const [itemNumber, rows] of rowsByItem) {
    const sorted = [...rows].sort((a, b) => a.r - b.r);
    const existingNos = new Set(sorted.filter(x => x.no != null).map(x => x.no!));
    let nextAuto = 1;
    for (const row of sorted) {
      let no: number;
      if (row.no != null) {
        no = row.no;
      } else {
        while (existingNos.has(nextAuto)) nextAuto++;
        no = nextAuto;
        nextAuto++;
      }
      noDetails.set(`${itemNumber}_${no}`, { itemNumber, no, date: row.date, label: row.label });
    }
  }
  if (!noDetails.size) return {};

  // ② 사진대지 시트 → 항목번호 매핑 + NO별 right_header (col+4 in next row)
  const itemToSheet = new Map<number, string>();
  const sheetHeaders = new Map<string, Map<number, string>>();

  for (const name of sheetNames) {
    if (!isPhotoSheet(name)) continue;
    const mItem = name.match(/^(\d+)\./);
    if (mItem) itemToSheet.set(parseInt(mItem[1]), name);

    const ws = wb.Sheets[name];
    if (!ws) continue;
    const wsRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    const hMap = new Map<number, string>();
    for (let r = wsRange.s.r; r <= wsRange.e.r; r++) {
      for (let c = wsRange.s.c; c <= wsRange.e.c; c++) {
        const v = xlsxCellStr(ws, r, c);
        const mN = v.replace(/\s/g, "").toUpperCase().match(/^NO\.?(\d+)$/);
        if (!mN || hMap.has(parseInt(mN[1]))) continue;
        const ht = xlsxCellStr(ws, r + 1, c + 4);
        hMap.set(parseInt(mN[1]), (ht.includes("설치") || ht.includes("현장")) ? "현장 설치 사진" : "지급 사진");
      }
    }
    sheetHeaders.set(name, hMap);
  }

  // ③ 블록 조립: itemNumber·no 순으로 정렬 후, 사진대지 전체에서 NO.1~N 누적 부여
  const result: Record<string, PhotoBlock[]> = {};
  let cumulativeNo = 0;

  for (const d of [...noDetails.values()].sort((a, b) => a.itemNumber - b.itemNumber || a.no - b.no)) {
    const sheetName = itemToSheet.get(d.itemNumber);
    if (!sheetName) continue;
    cumulativeNo += 1;
    if (!result[sheetName]) result[sheetName] = [];
    const order = result[sheetName].length;
    result[sheetName].push({
      id:           `local_${sheetName}_${cumulativeNo}`,
      doc_id:       "local",
      sheet_name:   sheetName,
      no:           cumulativeNo,
      right_header: sheetHeaders.get(sheetName)?.get(d.no) ?? "지급 사진",
      left_date:    d.date,
      right_date:   d.date,
      left_label:   d.label,
      right_label:  d.label,
      sort_order:   order,
      photos:       [],
    });
  }
  return result;
}

function PreviewSheet({
  sheet, sheetIdx, formValues,
}: { sheet: ParsedSheet; sheetIdx: number; formValues: Record<string, string> }) {
  const { trimmedRows, usedCols, colWidths, rowOffset, colOffset } = trimSheet(sheet, sheetIdx, formValues);
  const totalW = colWidths.reduce((a, b) => a + b, 0) || A4_W;
  // 너비만 A4에 맞춤 — 높이는 자연스럽게 늘어나도록 (미리보기 스크롤)
  const scale  = Math.min(1, A4_W / totalW);
  const isCover = sheet.name.trim() === "갑지" || sheet.name.includes("갑지");

  const tableNode = (
    <table style={{ borderCollapse: "collapse", tableLayout: "fixed", background: "#fff" }}>
      <colgroup>{colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <tbody>
        {trimmedRows.map((row, ri) => (
          <tr key={ri} style={row.height !== null ? { height: row.height } : undefined}>
            {row.cells.slice(0, usedCols).map((cell, ci) => {
              if (cell.skip) return null;
              const ref = `${colLetter(ci + 1 + colOffset)}${ri + 1 + rowOffset}`;
              const ov  = formValues[`${sheetIdx}__${ref}`];
              return (
                <td
                  key={ci}
                  rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                  colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                  style={cell.style as React.CSSProperties}
                  className={ov !== undefined ? styles.cellHighlight : undefined}
                >
                  {toCellDisplayString(ov ?? cell.value)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className={isCover ? styles.previewPageCover : styles.previewPage}>
      <div className={styles.previewPageName}>{sheet.name}</div>
      <div style={{ zoom: scale, width: totalW } as React.CSSProperties}>
        {tableNode}
      </div>
    </div>
  );
}

function FitToWidth(props: {
  contentWidth: number;
  contentHeight: number;
  zoomScale?: number; // Excel 시트 뷰 배율 (기본 100)
  children: React.ReactNode;
}) {
  const { contentWidth, contentHeight, zoomScale = 100, children } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostW, setHostW] = useState<number>(0);

  React.useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHostW(el.clientWidth));
    ro.observe(el);
    setHostW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const availW = Math.max(1, hostW);
  // Excel 배율 우선, 뷰포트보다 넘치면 뷰포트에 맞게 축소
  const naturalScale = zoomScale / 100;
  const fittedScale  = contentWidth > 0 ? availW / contentWidth : 1;
  const scale        = Math.min(naturalScale, fittedScale);

  return (
    <div ref={hostRef} className={styles.fitHost}>
      <div
        className={styles.fitZoom}
        style={{
          width: contentWidth,
          height: contentHeight,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore: zoom은 표준 타입에 없지만 Chromium에서 동작
          zoom: scale,
        }}
      >
        {children}
      </div>
    </div>
  );
}


// ── 갑지 폼 ──────────────────────────────────────────────────────

/** 엑셀 시트에서 갑지 데이터 파싱 (최대한 읽고 없으면 기본값) */
function parseGabjiFromSheet(sheet: ParsedSheet): GabjiData {
  const d = makeEmptyGabji();

  // ① 기본정보 라벨 → 오른쪽 값 셀 스캔
  const BASIC: Array<{ field: keyof GabjiData; keywords: string[] }> = [
    { field: "gongsamyeong",    keywords: ["공사명"] },
    { field: "hyeonjangmyeong", keywords: ["현장명"] },
    { field: "gongsageumaek",   keywords: ["공사금액", "계약금액"] },
    { field: "gongsagigan",     keywords: ["공사기간", "공기"] },
    { field: "baljuja",         keywords: ["발주자"] },
    { field: "gongjungnyul",    keywords: ["공정율", "공정률"] },
    { field: "signDate",        keywords: ["작성일", "작 성 일"] },
    { field: "signRep",         keywords: ["현장대리인"] },
    { field: "signSafety",      keywords: ["안전관리담당자", "안전관리자"] },
  ];

  for (let ri = 0; ri < sheet.rows.length; ri++) {
    const row = sheet.rows[ri];
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      if (!cell || cell.skip) continue;
      const text = toCellDisplayString(cell.value).replace(/[\s\u200b\u3000]/g, "");
      for (const { field, keywords } of BASIC) {
        if (d[field]) continue;
        if (!keywords.some(k => text.includes(k.replace(/\s/g, "")))) continue;
        for (let nc = ci + 1; nc < row.cells.length; nc++) {
          const vc = row.cells[nc];
          if (!vc || vc.skip) continue;
          const val = toCellDisplayString(vc.value).trim();
          if (val) (d as unknown as Record<string, string>)[field] = val;
          break;
        }
      }
    }
  }

  // ② 사용금액 항목 스캔 (표준 9개 항목 키워드)
  const ITEM_KW = [
    "안전관리자",  // 1
    "안전시설비",  // 2
    "개인보호구",  // 3
    "사망사고",    // 4
    "안전진단",    // 5
    "안전보건교육", // 6
    "건강관리",    // 7
    "건설재해예방", // 8
    "기타안전",    // 9
  ];

  const found = new Map<number, { plan: string; use: string }>();

  for (let ri = 0; ri < sheet.rows.length; ri++) {
    const row = sheet.rows[ri];
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      if (!cell || cell.skip) continue;
      const text = toCellDisplayString(cell.value).replace(/[\s\u200b\u3000]/g, "");
      const idx = ITEM_KW.findIndex(k => text.includes(k.replace(/\s/g, "")));
      if (idx === -1 || found.has(idx)) continue;
      // 오른쪽에서 숫자 셀 2개 탐색 (계획금액, 사용금액)
      const nums: string[] = [];
      for (let nc = ci + 1; nc < Math.min(ci + 12, row.cells.length) && nums.length < 2; nc++) {
        const vc = row.cells[nc];
        if (!vc || vc.skip) continue;
        const v = toCellDisplayString(vc.value).trim();
        if (v && !isNaN(parseFloat(v.replace(/,/g, "")))) nums.push(v);
      }
      found.set(idx, { plan: nums[0] ?? "", use: nums[1] ?? "" });
    }
  }

  if (found.size > 0) {
    d.items = DEFAULT_ITEMS.map((def, idx) => {
      const hit = found.get(idx);
      return hit ? { ...def, planAmount: hit.plan, useAmount: hit.use } : { ...def };
    });
  }

  return d;
}

// ── 갑지 인쇄용 셀 오버라이드 계산 ──────────────────────────────
// 기본 헤더 정보(공사명·금액·기간·발주자·공정율)만 안전하게 덮어씀
// 항목별 금액은 항목 레이블이 키워드와 충돌할 수 있어 제외
function gabjiPrintOverrides(
  sheet: ParsedSheet,
  sheetIdx: number,
  data: GabjiData,
  _itemAmounts: Record<number, number>,
): Record<string, string> {
  const overrides: Record<string, string> = {};

  // 항목 레이블("안전관리자등" 등)과 겹치지 않는 고유 키워드만 사용
  const BASIC_FIELDS: Array<{ field: keyof GabjiData; keywords: string[] }> = [
    { field: "gongsamyeong",    keywords: ["공사명"] },
    { field: "gongsageumaek",   keywords: ["공사금액", "계약금액"] },
    { field: "gongsagigan",     keywords: ["공사기간"] },
    { field: "baljuja",         keywords: ["발주자"] },
    { field: "gongjungnyul",    keywords: ["누계공정율", "공정율", "공정률"] },
    { field: "signDate",        keywords: ["작성일"] },
    { field: "signRep",         keywords: ["현장대리인"] },
    { field: "signSafety",      keywords: ["안전관리담당자"] },
  ];
  const matched = new Set<string>();

  for (let ri = 0; ri < sheet.rows.length; ri++) {
    const row = sheet.rows[ri];
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      if (!cell || cell.skip) continue;
      const text = toCellDisplayString(cell.value).replace(/[\s\u200b\u3000]/g, "");

      for (const { field, keywords } of BASIC_FIELDS) {
        if (matched.has(field)) continue;
        if (!keywords.some(k => text.includes(k.replace(/\s/g, "")))) continue;
        // 라벨 오른쪽의 첫 번째 non-skip 셀에 값 기입
        for (let nc = ci + 1; nc < row.cells.length; nc++) {
          const vc = row.cells[nc];
          if (!vc || vc.skip) continue;
          matched.add(field);
          const val = String((data as unknown as Record<string, string>)[field] ?? "");
          if (val) overrides[`${sheetIdx}__${colLetter(nc + 1)}${ri + 1}`] = val;
          break;
        }
      }
    }
  }
  return overrides;
}

// ── 항목별세부내역 → ItemData[] 파싱 ────────────────────────────
function parseItemsFromRaw(rawBuf: ArrayBuffer): ItemData[] {
  const wb = XLSX.read(rawBuf, { type: "array", cellDates: true });
  const ws = wb.Sheets["항목별세부내역"];
  if (!ws) return [];

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const items: ItemData[] = [];
  let currentCategory = 0;
  const noCounters = new Map<number, number>(); // categoryNo → auto-no counter

  for (let r = range.s.r; r <= range.e.r; r++) {
    // col0: 항목번호 헤더 ("1.", "2.", ...)
    const col0 = xlsxCellStr(ws, r, 0);
    const catMatch = col0.replace(/\s/g, "").match(/^(\d+)\./);
    if (catMatch) {
      currentCategory = parseInt(catMatch[1]);
      continue;
    }
    if (currentCategory === 0) continue;

    const usageDate = xlsxCellStr(ws, r, 1);
    const name      = xlsxCellStr(ws, r, 2);
    // col3: 수량(숫자) or 단위(문자) — 숫자면 수량으로 쓰고 단위는 EA 기본
    const col3      = xlsxCellStr(ws, r, 3);
    const col3Num   = parseItemNum(col3);
    const isCol3Num = !isNaN(col3Num) && col3.trim() !== "";
    const quantity  = isCol3Num ? col3Num : 1;
    const unit      = isCol3Num ? "EA" : (col3.trim() || "EA");
    const unitPriceStr = xlsxCellStr(ws, r, 4);
    const amountStr    = xlsxCellStr(ws, r, 5);
    const evidenceStr  = xlsxCellStr(ws, r, 6);

    // 단가·금액이 없으면 데이터 행이 아님
    const unitPrice = parseItemNum(unitPriceStr);
    const amount    = parseItemNum(amountStr);
    if (!unitPriceStr.trim() && !amountStr.trim()) continue;
    if (!name.trim()) continue;

    // 증빙번호: NO.X 형태 or 자동 부여
    let evidenceNo = "";
    const evMatch = evidenceStr.replace(/\s/g, "").toUpperCase().match(/^NO\.?(\d+)$/);
    if (evMatch) {
      evidenceNo = `NO.${evMatch[1]}`;
    } else {
      const cnt = (noCounters.get(currentCategory) ?? 0) + 1;
      noCounters.set(currentCategory, cnt);
      evidenceNo = `NO.${cnt}`;
    }

    items.push({
      id:          `item-${r}-${currentCategory}`,
      categoryNo:  currentCategory,
      evidenceNo,
      usageDate,
      name,
      quantity,
      unit,
      unitPrice,
      amount: amount || quantity * unitPrice,
      note:   evidenceStr && !evMatch ? evidenceStr : "",
      hasPhoto: true, // 기본적으로 사진대지 대상
    });
  }
  return items;
}

/** ItemData[] → 사진대지 PhotoBlock[] 생성 (parsePhotoBlocksFromRaw 대체) */
function buildPhotoBlocksFromItems(
  items: ItemData[],
  sheetNames: string[],
): Record<string, PhotoBlock[]> {
  // categoryNo → 사진대지 시트명 매핑
  const catToSheet = new Map<number, string>();
  for (const name of sheetNames) {
    if (!isPhotoSheet(name)) continue;
    const m = name.match(/^(\d+)\./);
    if (m) catToSheet.set(parseInt(m[1]), name);
  }

  const result: Record<string, PhotoBlock[]> = {};
  let cumNo = 0;

  // categoryNo 순 → 삽입 순서 유지
  const photoItems = [...items]
    .filter(i => i.hasPhoto)
    .sort((a, b) => a.categoryNo - b.categoryNo);

  for (const item of photoItems) {
    const sheetName = catToSheet.get(item.categoryNo);
    if (!sheetName) continue;
    cumNo++;
    if (!result[sheetName]) result[sheetName] = [];
    const label = item.quantity > 1
      ? `${item.name} [${item.quantity}${item.unit}]`
      : item.name;
    result[sheetName].push({
      id:           `local_${sheetName}_${cumNo}`,
      doc_id:       "local",
      sheet_name:   sheetName,
      no:           cumNo,
      right_header: "지급 사진",
      left_date:    item.usageDate,
      right_date:   item.usageDate,
      left_label:   label,
      right_label:  label,
      sort_order:   result[sheetName].length,
      photos:       [],
    });
  }
  return result;
}

/** 기존 photos를 새 블록 구조에 병합 (블록 no 기준 매칭) */
function mergePhotoBlocks(
  newBlocks: Record<string, PhotoBlock[]>,
  prevBlocks: Record<string, PhotoBlock[]>,
): Record<string, PhotoBlock[]> {
  const merged: Record<string, PhotoBlock[]> = {};
  for (const [sheetName, blocks] of Object.entries(newBlocks)) {
    merged[sheetName] = blocks.map(nb => {
      const existing = (prevBlocks[sheetName] ?? []).find(pb => pb.no === nb.no);
      return existing
        ? { ...nb, id: existing.id, doc_id: existing.doc_id, photos: existing.photos }
        : nb;
    });
  }
  return merged;
}

// ── Page ─────────────────────────────────────────────────────────
export default function FillPage() {
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const selectedTdRef = useRef<HTMLTableCellElement>(null);

  const [sheets,       setSheets]       = useState<ParsedSheet[]>([]);
  const [activeSheet,  setActiveSheet]  = useState(0);
  const [formValues,   setFormValues]   = useState<Record<string, string>>({});
  const [gabjiData,    setGabjiData]    = useState<GabjiData>(makeEmptyGabji);
  const [items,        setItems]        = useState<ItemData[]>([]);
  const [rawBuf,       setRawBuf]       = useState<ArrayBuffer | null>(null);
  const [fileName,     setFileName]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [showPreview,  setShowPreview]  = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ ri: number; ci: number } | null>(null);
  const [editingCell,  setEditingCell]  = useState<{
    ref: string; sheetIdx: number; originalValue: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [inAppSaved, setInAppSaved] = useState(false);

  // ── 사진대지 ──────────────────────────────────────────────────
  // docId: 서버 upsert에 쓰이는 UUID (localStorage draft에서 복원 or 신규 생성)
  const docIdRef       = useRef<string>("");
  const saveDraftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [photoBlocks,   setPhotoBlocks]   = useState<Record<string, PhotoBlock[]>>({});
  const [photoSlot,     setPhotoSlot]     = useState<{
    blockId: string; side: "left" | "right"; slotIndex: number;
  } | null>(null);
  // iOS 갤러리 picker 닫힐 때 backdrop click이 먼저 발생해 state가 null이 되는 문제 방어용
  const photoSlotRef = useRef<{ blockId: string; side: "left" | "right"; slotIndex: number } | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoSaving,    setPhotoSaving]    = useState(false);
  const [pdfLoading,     setPdfLoading]     = useState(false);
  const [saveToast,      setSaveToast]      = useState(false);
  const [showPwaGuide,   setShowPwaGuide]   = useState(false);
  const [isStandalone,   setIsStandalone]   = useState(true); // 기본 true → 설치 안내 숨김

  // ── 사진대지 항목 드롭다운: 전체 블록에서 유니크 라벨 수집 ──────
  const availableLabels = useMemo(() => {
    const set = new Set<string>();
    for (const blocks of Object.values(photoBlocks)) {
      for (const b of blocks) {
        if (b.left_label)  set.add(b.left_label);
        if (b.right_label) set.add(b.right_label);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [photoBlocks]);

  const mkKey = (sheetIdx: number, cell: string) => `${sheetIdx}__${cell.toUpperCase()}`;

  // ── PWA 설치 여부 감지 ────────────────────────────────────────────
  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  // ── 사진 업로드 중 body 스크롤 잠금 ──────────────────────────────
  useEffect(() => {
    if (photoUploading) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [photoUploading]);

  // ── PWA Share Target: SW 캐시에서 공유된 엑셀 파일 수신 ──────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("shared")) return;
    // URL 파라미터 제거 (히스토리 오염 방지)
    window.history.replaceState({}, "", "/workspace/fill");
    (async () => {
      try {
        const cache = await caches.open("share-file-v1");
        const res   = await cache.match("/shared-excel");
        if (!res) return;
        const blob     = await res.blob();
        const fileName = decodeURIComponent(res.headers.get("X-File-Name") ?? "shared.xlsx");
        await cache.delete("/shared-excel");
        // handleFile과 동일한 처리
        const fakeEvent = { target: { files: [new File([blob], fileName)], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
        handleFile(fakeEvent);
      } catch (e) {
        console.error("[share-target]", e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 사진대지: 파싱 미완료 시 안전망 (handleFile에서 이미 처리됨) ──
  useEffect(() => {
    if (!rawBuf || !sheets.length) return;
    const hasPhoto = sheets.some(s => isPhotoSheet(s.name));
    if (!hasPhoto) return;
    const alreadyParsed = sheets.filter(s => isPhotoSheet(s.name))
      .some(s => (photoBlocks[s.name]?.length ?? 0) > 0);
    if (alreadyParsed) return;
    // handleFile에서 파싱 실패 시 재시도
    const parsed = parsePhotoBlocksFromRaw(rawBuf, sheets.map(s => s.name));
    if (Object.keys(parsed).length > 0) setPhotoBlocks(prev => ({ ...prev, ...parsed }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawBuf, sheets]);

  // ── 사진대지: photoBlocks 변경 → localStorage 드래프트 자동저장 (debounce 800ms) ──
  useEffect(() => {
    if (!fileName || Object.keys(photoBlocks).length === 0) return;
    if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
    saveDraftTimer.current = setTimeout(() => {
      photoDraft.save(docIdRef.current, fileName, photoBlocks);
    }, 800);
    return () => {
      if (saveDraftTimer.current) clearTimeout(saveDraftTimer.current);
    };
  }, [photoBlocks, fileName]);

  // ── 슬롯 클릭 ────────────────────────────────────────────────
  const handleSlotClick: OnSlotClick = useCallback((blockId, side, slotIndex) => {
    photoSlotRef.current = { blockId, side, slotIndex };
    setPhotoSlot({ blockId, side, slotIndex });
  }, []);

  // ── 사진 삭제: 서버 UUID가 있는 사진은 서버 삭제, 없으면 로컬만 ──
  const handlePhotoDelete: OnPhotoDelete = useCallback(async (photoId, blockId) => {
    // photoId 가 pending_ / local_ 로 시작하지 않으면 DB에 실제 레코드가 있음
    if (!photoId.startsWith("pending_") && !photoId.startsWith("local_")) {
      const { data: photo } = await supabase
        .from("block_photos")
        .select("storage_path")
        .eq("id", photoId)
        .single();
      if (photo?.storage_path) {
        await supabase.storage.from("expense-evidence").remove([photo.storage_path]);
      }
      await supabase.from("block_photos").delete().eq("id", photoId);
    }
    setPhotoBlocks(prev => {
      const next = { ...prev };
      for (const name of Object.keys(next)) {
        next[name] = next[name].map(b =>
          b.id !== blockId ? b : { ...b, photos: b.photos.filter(p => p.id !== photoId) }
        );
      }
      return next;
    });
  }, []);

  // ── 메타 수정: 로컬 즉시 반영, 최종 저장은 handlePhotoSave ──────
  const handleMetaUpdate: OnMetaUpdate = useCallback((blockId, fields) => {
    setPhotoBlocks(prev => {
      const next = { ...prev };
      for (const name of Object.keys(next)) {
        next[name] = next[name].map(b => b.id !== blockId ? b : { ...b, ...fields });
      }
      return next;
    });
  }, []);

  // ── 사진 업로드: private Storage → signed URL ───────────────────
  // 프론트 슬롯 중복 체크(1차) + 서버 중복 체크(2차) + DB UNIQUE(3차)
  const handlePhotoUpload = useCallback(async (file: File) => {
    // ref 우선 (iOS: gallery picker 닫힐 때 backdrop이 먼저 state를 null로 만드는 문제 방어)
    const slot = photoSlotRef.current ?? photoSlot;
    if (!slot) return;
    const { blockId, side, slotIndex } = slot;
    photoSlotRef.current = null;
    setPhotoSlot(null);

    // 현재 블록 찾기
    let block: PhotoBlock | undefined;
    for (const blocks of Object.values(photoBlocks)) {
      block = blocks.find(b => b.id === blockId);
      if (block) break;
    }
    if (!block) return;

    // ① 프론트 슬롯 중복 방어 (1차)
    if (block.photos.some(p => p.side === side && p.slot_index === slotIndex)) {
      alert("이미 사진이 있는 슬롯입니다. 먼저 삭제 후 업로드하세요.");
      return;
    }

    setPhotoUploading(true);
    const UPLOAD_TIMEOUT_MS = 32000;
    const timeoutId = setTimeout(() => {
      setPhotoUploading(false);
      alert("업로드가 너무 오래 걸립니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
    }, UPLOAD_TIMEOUT_MS);

    let pId  = "";    // pending photo id (밖에서 finally가 접근 가능하게)
    let pUrl = "";    // local object URL
    try {
      // ① 로컬 미리보기: 원본 File로 즉시 blob URL 생성
      //    compressImage 결과 blob이 아닌 원본을 사용 → 모바일에서 100% 안전
      //    (canvas.toBlob 결과물은 일부 iOS에서 createObjectURL이 실패할 수 있음)
      pUrl = URL.createObjectURL(file);

      // 업로드용 JPEG 변환 (포맷 통일 + 크기 제한)
      let compressed: Blob;
      try {
        compressed = await compressImage(file, 4096, 0.97);
        if (compressed.size > MAX_UPLOAD_BYTES)
          compressed = await compressImage(file, 2560, 0.92);
        if (compressed.size > MAX_UPLOAD_BYTES)
          compressed = await compressImage(file, 1920, 0.90);
      } catch {
        compressed = file;
      }
      pId  = `pending_${Date.now()}`;
      const pendingPhoto: BlockPhoto = { id: pId, block_id: blockId, side, slot_index: slotIndex, storage_path: "", url: pUrl };
      setPhotoBlocks(prev => {
        const next = { ...prev };
        for (const name of Object.keys(next)) {
          next[name] = next[name].map(b => {
            if (b.id !== blockId) return b;
            const rest = b.photos.filter(p => !(p.side === side && p.slot_index === slotIndex));
            return { ...b, photos: [...rest, pendingPhoto] };
          });
        }
        return next;
      });

      const docId = docIdRef.current;
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? "";

      let uploaded = false;
      if (userId) {
        try {
          const { data: existingBlock } = await supabase
        .from("photo_blocks")
        .select("id")
        .eq("doc_id",     docId)
        .eq("sheet_name", block.sheet_name)
        .eq("no",         block.no)
        .maybeSingle();

          let dbBlockId: string;
          if (existingBlock) {
            await supabase.from("photo_blocks").update({
          right_header: block.right_header,
          left_date:    block.left_date,
          right_date:   block.right_date,
          left_label:   block.left_label,
          right_label:  block.right_label,
          sort_order:   block.sort_order,
        }).eq("id", existingBlock.id);
        dbBlockId = existingBlock.id as string;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("photo_blocks")
          .insert({
            doc_id: docId, user_id: userId,
            sheet_name:   block.sheet_name,
            no:           block.no,
            right_header: block.right_header,
            left_date:    block.left_date,
            right_date:   block.right_date,
            left_label:   block.left_label,
            right_label:  block.right_label,
            sort_order:   block.sort_order,
          })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);
        dbBlockId = inserted.id as string;
      }

          const storagePath = `${userId}/${dbBlockId}/${side}/${slotIndex}.jpg`;
          await supabase.storage.from("expense-evidence").remove([storagePath]);
          const { error: storageErr } = await supabase.storage
            .from("expense-evidence")
            .upload(storagePath, compressed, { contentType: "image/jpeg", upsert: false });
          if (storageErr) throw new Error(storageErr.message);

          const { data: photoRow, error: photoErr } = await supabase
            .from("block_photos")
            .insert({ block_id: dbBlockId, side, slot_index: slotIndex, storage_path: storagePath })
            .select("id")
            .single();
          if (photoErr) {
            await supabase.storage.from("expense-evidence").remove([storagePath]);
            throw new Error(photoErr.message);
          }

          const { data: signed } = await supabase.storage
            .from("expense-evidence")
            .createSignedUrl(storagePath, 3600);

          setPhotoBlocks(prev => {
            const next = { ...prev };
            for (const name of Object.keys(next)) {
              next[name] = next[name].map(b => ({
                ...b,
                photos: b.photos.map(p => p.id !== pId ? p : {
                  id: photoRow.id as string, block_id: dbBlockId, side, slot_index: slotIndex,
                  storage_path: storagePath,
                  // ★ 모바일 깨진 이미지 방지: signed URL(네트워크 요청)을 쓰지 않고
                  //   로컬 blob URL(URL.createObjectURL)을 그대로 사용.
                  //   signed URL은 페이지 재로드 시 GET /api/photo-blocks 에서 재생성됨.
                  url: pUrl,
                }),
              }));
            }
            return next;
          });
          uploaded = true;
        } catch {
          // 직렬 업로드 실패 시 API 폴백
        }
      }

      if (!uploaded) {
        const fd = new FormData();
        fd.append("docId", docId);
        fd.append("sheetName", block.sheet_name);
        fd.append("blockNo", String(block.no));
        fd.append("rightHeader", block.right_header ?? "지급/설치 사진");
        fd.append("leftDate", block.left_date ?? "");
        fd.append("rightDate", block.right_date ?? "");
        fd.append("leftLabel", block.left_label ?? "");
        fd.append("rightLabel", block.right_label ?? "");
        fd.append("sortOrder", String(block.sort_order ?? 0));
        fd.append("side", side);
        fd.append("slotIndex", String(slotIndex));
        fd.append("userId", userId);
        fd.append("file", new File([compressed], "photo.jpg", { type: "image/jpeg" }));

        const res = await fetch("/api/photo-blocks/photos", { method: "POST", body: fd });
        const json = (await res.json()) as { ok: boolean; photoId?: string; blockId?: string; signedUrl?: string; error?: string };
        if (!json.ok) throw new Error(json.error ?? "사진 업로드 실패");

        setPhotoBlocks(prev => {
          const next = { ...prev };
          for (const name of Object.keys(next)) {
            next[name] = next[name].map(b => ({
              ...b,
              photos: b.photos.map(p => p.id !== pId ? p : {
                id: json.photoId!, block_id: json.blockId!, side, slot_index: slotIndex,
                storage_path: "",
                // ★ API 폴백 경로도 동일하게 로컬 blob URL 사용 (모바일 호환)
                url: pUrl,
              }),
            }));
          }
          return next;
        });
      }
    } catch (err) {
      // 에러 시에도 로컬 미리보기(pUrl)는 유지 — 사진은 화면에 남기고 알림만
      const msg = (err as Error)?.message ?? String(err);
      alert((err as Error)?.name === "AbortError"
        ? "업로드 시간 초과 (30초). 네트워크 상태를 확인하거나 다시 시도해주세요."
        : `오류: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
      setPhotoUploading(false);
    }
  }, [photoSlot, photoBlocks]);

  // ── 최종 저장: 현재 사진대지 시트의 블록 메타를 서버에 일괄 upsert ──
  const handlePhotoSave = useCallback(async () => {
    const s = sheets[activeSheet];
    if (!s || !isPhotoSheet(s.name)) return;
    const blocks = photoBlocks[s.name] ?? [];
    if (!blocks.length) return;

    setPhotoSaving(true);
    try {
      await Promise.all(blocks.map(b =>
        fetch("/api/photo-blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc_id:       docIdRef.current,
            sheet_name:   b.sheet_name,
            no:           b.no,
            right_header: b.right_header,
            left_date:    b.left_date,
            right_date:   b.right_date,
            left_label:   b.left_label,
            right_label:  b.right_label,
            sort_order:   b.sort_order,
          }),
        })
      ));
      photoDraft.clear(fileName);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2200);
    } finally {
      setPhotoSaving(false);
    }
  }, [sheets, activeSheet, photoBlocks, fileName]);

  // ── 바텀시트 포커스 + 배경 스크롤 잠금 ──────────────────────────
  useEffect(() => {
    if (editingCell) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [editingCell]);

  useEffect(() => {
    document.body.style.overflow = showPreview ? "hidden" : "";
    if (showPreview) {
      // 뒤로가기가 미리보기 닫기로 동작하도록 히스토리 엔트리 추가
      history.pushState({ preview: true }, "");
    }
    return () => { document.body.style.overflow = ""; };
  }, [showPreview]);

  // 뒤로가기(popstate) → 미리보기 닫기
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (showPreview) {
        setShowPreview(false);
        // 뒤로 더 나가지 않도록 다시 앞으로 밀어두지 않아도 됨
        // (pushState한 엔트리가 이미 소비됨)
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [showPreview]);

  // 선택 셀 스크롤 into view
  useEffect(() => {
    selectedTdRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedCell]);

  // ── 키보드 네비게이션 ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingCell || showPreview) return;
      const sheet = sheets[activeSheet];
      if (!sheet) return;

      if (e.ctrlKey && e.key === "PageDown") {
        e.preventDefault();
        setActiveSheet(p => Math.min(p + 1, sheets.length - 1));
        setSelectedCell(null); return;
      }
      if (e.ctrlKey && e.key === "PageUp") {
        e.preventDefault();
        setActiveSheet(p => Math.max(p - 1, 0));
        setSelectedCell(null); return;
      }
      if (!selectedCell) return;

      // printArea 기반 표시 범위
      const kbPa       = sheet.printArea;
      const kbRowStart = kbPa ? kbPa.r1 - 1 : 0;
      const kbColStart = kbPa ? kbPa.c1 - 1 : 0;
      const rows = kbPa
        ? sheet.rows.slice(kbRowStart, Math.min(kbPa.r2, sheet.rows.length))
            .map(r => ({ ...r, cells: r.cells.slice(kbColStart, kbPa.c2) }))
        : sheet.rows;
      const maxCol = (kbPa ? kbPa.c2 - kbColStart : sheet.colWidths.length) - 1;

      let { ri, ci } = selectedCell;
      const findNextCol = (startCi: number, dir: 1 | -1) => {
        for (let c = startCi + dir; c >= 0 && c <= maxCol; c += dir)
          if (!rows[ri]?.cells[c]?.skip) return c;
        return ci;
      };
      const findNextRow = (startRi: number, dir: 1 | -1) => {
        for (let r = startRi + dir; r >= 0 && r < rows.length; r += dir)
          if (!rows[r]?.cells[ci]?.skip) return r;
        return ri;
      };
      const kbRef = () => `${colLetter(ci + 1 + kbColStart)}${ri + 1 + kbRowStart}`;

      switch (e.key) {
        case "ArrowRight": e.preventDefault(); ci = findNextCol(ci, 1);  break;
        case "ArrowLeft":  e.preventDefault(); ci = findNextCol(ci, -1); break;
        case "ArrowDown":  e.preventDefault(); ri = findNextRow(ri, 1);  break;
        case "ArrowUp":    e.preventDefault(); ri = findNextRow(ri, -1); break;
        case "Tab":
          e.preventDefault();
          ci = findNextCol(ci, e.shiftKey ? -1 : 1); break;
        case "Enter": e.preventDefault(); ri = findNextRow(ri, 1); break;
        case "Escape": e.preventDefault(); setSelectedCell(null); return;
        case "F2": {
          e.preventDefault();
          const ref  = kbRef();
          const cell = rows[ri]?.cells[ci];
          if (cell) { setEditValue(toCellDisplayString(formValues[mkKey(activeSheet, ref)] ?? "")); setEditingCell({ ref, sheetIdx: activeSheet, originalValue: toCellDisplayString(cell.value) }); }
          return;
        }
        case "Delete":
        case "Backspace": {
          e.preventDefault();
          const key = mkKey(activeSheet, kbRef());
          setFormValues(p => { const n = { ...p }; delete n[key]; return n; });
          return;
        }
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const ref  = kbRef();
            const cell = rows[ri]?.cells[ci];
            if (cell) { setEditValue(e.key); setEditingCell({ ref, sheetIdx: activeSheet, originalValue: toCellDisplayString(cell.value) }); }
          }
          return;
      }
      setSelectedCell({ ri, ci });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingCell, showPreview, sheets, activeSheet, selectedCell, formValues]);

  const openSheet = useCallback((ref: string, sheetIdx: number, originalValue: string) => {
    setEditValue(formValues[mkKey(sheetIdx, ref)] ?? "");
    setEditingCell({ ref, sheetIdx, originalValue });
  }, [formValues]);

  const handleSave = useCallback(() => {
    if (!editingCell) return;
    const key = mkKey(editingCell.sheetIdx, editingCell.ref);
    setFormValues(p => {
      if (editValue === "") { const n = { ...p }; delete n[key]; return n; }
      return { ...p, [key]: editValue };
    });
    setEditingCell(null);
  }, [editingCell, editValue]);

  const handleCancel = useCallback(() => setEditingCell(null), []);

  // ── 파일 업로드: localStorage 드래프트 복원 or 신규 docId 생성 ──
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      setRawBuf(buf);
      setFileName(file.name);
      let parsed = await parseExcelBuffer(buf);
      // 갑지 시트를 맨 앞으로 (모바일·웹 동일하게)
      const gabjiIdx = parsed.findIndex(s => s.name.trim() === "갑지" || s.name.includes("갑지"));
      if (gabjiIdx > 0) {
        const gabji = parsed[gabjiIdx];
        parsed = [gabji, ...parsed.slice(0, gabjiIdx), ...parsed.slice(gabjiIdx + 1)];
      }
      // v5 debug
      console.log("[v5] sheets:", parsed.map((s, i) => `${i}:${s.name} printArea=${JSON.stringify(s.printArea)}`));
      const s0 = parsed[0];
      if (s0) console.log("[v5] sheet0 row0 cell0 style:", JSON.stringify(s0.rows[0]?.cells[0]?.style));
      const itemSheet = parsed.find(s => s.name.includes("항목"));
      if (itemSheet) {
        const colored = itemSheet.rows.flatMap(r => r.cells).filter(c => c.style.backgroundColor && c.style.backgroundColor !== "#ffffff").length;
        console.log("[v5] 항목별세부내역 colored cells:", colored);
      }
      setSheets(parsed);
      setActiveSheet(0);
      setFormValues({});
      setSelectedCell(null);

      // 갑지·항목별세부내역: localStorage 저장본 우선, 없으면 엑셀 파싱
      const savedFillData = (() => {
        try { return JSON.parse(localStorage.getItem(`fill_data_${file.name}`) ?? "null"); } catch { return null; }
      })();

      if (savedFillData?.gabjiData && savedFillData?.items) {
        setGabjiData(savedFillData.gabjiData);
        setItems(savedFillData.items);
      } else {
        const gabjiSheet = parsed.find(s => isCoverSheet(s.name));
        if (gabjiSheet) setGabjiData(parseGabjiFromSheet(gabjiSheet));
        const parsedItems = parseItemsFromRaw(buf);
        setItems(parsedItems);
      }

      // ── 사진대지 블록: items 기반 생성 (parsePhotoBlocksFromRaw 대체)
      const resolvedItems: ItemData[] = savedFillData?.items ?? parseItemsFromRaw(buf);
      const freshBlocks = resolvedItems.length > 0
        ? buildPhotoBlocksFromItems(resolvedItems, parsed.map(s => s.name))
        : parsePhotoBlocksFromRaw(buf, parsed.map(s => s.name)); // fallback

      // docId 복원 (사진 서버 연결용) — 블록 구조는 항상 freshBlocks 사용
      const draft = photoDraft.load(file.name);
      if (draft) {
        docIdRef.current = draft.docId;
      } else {
        docIdRef.current = crypto.randomUUID();
      }
      // DB에서 기존 사진 불러와 freshBlocks에 병합 (재업로드 시 슬롯 중복 에러 방지)
      try {
        const res = await fetch(`/api/photo-blocks?docId=${docIdRef.current}`);
        const json = await res.json() as { ok: boolean; blocks?: Array<{
          sheet_name: string; no: number; id: string;
          photos: Array<{ id: string; block_id: string; side: string; slot_index: number; storage_path: string; url: string }>;
        }> };
        if (json.ok && json.blocks?.length) {
          for (const dbBlock of json.blocks) {
            const localArr = freshBlocks[dbBlock.sheet_name];
            if (!localArr) continue;
            const localBlock = localArr.find(b => b.no === dbBlock.no);
            if (!localBlock || !dbBlock.photos.length) continue;
            localBlock.id     = dbBlock.id;   // 로컬 ID → DB UUID로 교체
            localBlock.doc_id = docIdRef.current;
            localBlock.photos = dbBlock.photos.map(p => ({
              id: p.id, block_id: p.block_id,
              side: p.side as "left" | "right",
              slot_index: p.slot_index,
              storage_path: p.storage_path,
              url: p.url,
            }));
          }
        }
      } catch { /* 네트워크 실패 시 빈 사진으로 진행 */ }

      setPhotoBlocks(freshBlocks);
    } catch (err) {
      console.error("[handleFile]", err);
      const detail = err instanceof Error ? err.message : String(err);
      alert(`엑셀 파일을 읽는 중 오류가 났습니다.\n${detail}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 사진대지 새 창 인쇄 (window.print 대신 새 창 HTML 생성) ──
  const handlePhotoSheetPrint = useCallback(async () => {
    const s = sheets[activeSheet];
    if (!s) return;
    const blocks = photoBlocks[s.name] ?? [];

    // PDF용 data URI 변환: 800px / 85% 재압축 (Puppeteer 네트워크 요청 없이 인라인 렌더링)
    const toDataUriForPdf = async (url: string): Promise<string> => {
      if (!url) return "";
      try {
        // Supabase 저장 사진 → signed URL로 먼저 변환
        let fetchUrl = url;
        if (!url.startsWith("blob:") && !url.startsWith("data:")) {
          const match = url.match(/\/expense-evidence\/(.+?)(?:\?|$)/);
          if (match) {
            const { data } = await supabase.storage
              .from("expense-evidence")
              .createSignedUrl(match[1], 300);
            if (data?.signedUrl) fetchUrl = data.signedUrl;
          }
        }
        const res  = await fetch(fetchUrl);
        const blob = await res.blob();
        return await new Promise(resolve => {
          const img    = new Image();
          const objUrl = URL.createObjectURL(blob);
          img.onload = () => {
            URL.revokeObjectURL(objUrl);
            const MAX = 800;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
          };
          img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(""); };
          img.src = objUrl;
        });
      } catch { return ""; }
    };

    const resolvedBlocks = await Promise.all(blocks.map(async b => ({
      ...b,
      photos: await Promise.all(b.photos.map(async p => ({
        ...p, url: await toDataUriForPdf(p.url ?? ""),
      }))),
    })));

    // Puppeteer API로 고품질 PDF 생성 (deviceScaleFactor:3 = ~288dpi)
    const res = await fetch("/api/photo-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetName: s.name, blocks: resolvedBlocks }),
    });

    if (!res.ok) {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, [sheets, activeSheet, photoBlocks]);

  const sheet = sheets[activeSheet];

  // ── 현재 활성 시트 PDF 생성 요청 ──────────────────────────────
  const handlePrintActive = useCallback(async () => {
    if (!sheet) return;
    const { trimmedRows, usedCols, colWidths, rowOffset, colOffset } = trimSheet(sheet, activeSheet, formValues);
    const colgroup = colWidths
      .map(() => `<col style="width:auto">`)
      .join("");
    const tbody = trimmedRows.map((row, ri) =>
      `<tr ${row.height !== null ? `style="height:${row.height}px"` : ""}>${
        row.cells.slice(0, usedCols).map((cell, ci) => {
          if (cell.skip) return "";
          const ref = `${colLetter(ci + 1 + colOffset)}${ri + 1 + rowOffset}`;
          const val = toCellDisplayString(formValues[`${activeSheet}__${ref}`] ?? cell.value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const css = Object.entries(cell.style)
            .map(([k, v]) => `${k.replace(/([A-Z])/g, c => `-${c.toLowerCase()}`)}:${v}`).join(";");
          const rs = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
          const cs = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
          return `<td${rs}${cs} style="${css}">${val}</td>`;
        }).join("")
      }</tr>`
    ).join("");
    const sheetHtml = `<div class="sheet-page">
      <table class="sheet-table"><colgroup>${colgroup}</colgroup><tbody>${tbody}</tbody></table>
    </div>`;
    const fullHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${sheet.name}</title>
<style>
  @page{size:A4 portrait;margin:10mm}
  *{box-sizing:border-box}
  body{margin:0;background:#ffffff;font-family:'Calibri','Apple SD Gothic Neo',sans-serif}
  .sheet-page{
    margin:0 auto;
    padding:0;
  }
  .sheet-table{
    width:100%;
    border-collapse:collapse;
    table-layout:fixed;
    background:#fff;
  }
  .sheet-table td{
    box-sizing:border-box;
  }
</style>
</head><body>${sheetHtml}</body></html>`;

    const res = await fetch("/api/sheet-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetName: sheet.name, html: fullHtml }),
    });
    if (!res.ok) {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, [sheet, activeSheet, formValues]);

  const handleDownload = useCallback(() => {
    if (!rawBuf) return;
    const wb = XLSX.read(rawBuf.slice(0), { type: "array" });
    for (const [key, val] of Object.entries(formValues)) {
      if (!val) continue;
      const [idxStr, cellRef] = key.split("__");
      const wsName = wb.SheetNames[Number(idxStr)];
      if (!wsName) continue;
      const ws = wb.Sheets[wsName];
      const num = Number(val.replace(/,/g, ""));
      ws[cellRef] = isNaN(num) ? { v: val, t: "s" } : { v: num, t: "n" };
    }
    const out  = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `수정_${fileName || "파일.xlsx"}`; a.click();
    URL.revokeObjectURL(url);
  }, [rawBuf, formValues, fileName]);

  const editedCount = Object.keys(formValues).length;
  const isPhotoActive = sheet ? isPhotoSheet(sheet.name) : false;

  const handleGabjiSave = useCallback((data: GabjiData) => {
    setGabjiData(data);
  }, []);

  /** items 변경 → 갑지 useAmount 자동 갱신 + 사진대지 블록 재빌드 */
  const handleItemsChange = useCallback((newItems: ItemData[]) => {
    setItems(newItems);
    // 갑지 items의 useAmount를 카테고리 합계로 자동 업데이트
    setGabjiData(prev => ({
      ...prev,
      items: prev.items.map(gi => ({
        ...gi,
        useAmount: String(sumByCategory(newItems, gi.no)),
      })),
    }));
    // 사진대지 재빌드 (기존 photos 보존)
    if (sheets.length) {
      const newBlocks = buildPhotoBlocksFromItems(newItems, sheets.map(s => s.name));
      setPhotoBlocks(prev => mergePhotoBlocks(newBlocks, prev));
    }
  }, [sheets]);

  const isCoverActive = sheet ? isCoverSheet(sheet.name) : false;
  const isItemActive  = sheet ? isItemSheet(sheet.name)  : false;

  /** 갑지·항목별세부내역: localStorage에 데이터 저장 */
  const handleInAppSave = useCallback(() => {
    if (!fileName) return;
    try {
      localStorage.setItem(
        `fill_data_${fileName}`,
        JSON.stringify({ gabjiData, items, savedAt: Date.now() }),
      );
    } catch { /* 저장 실패 무시 */ }
    setInAppSaved(true);
    setTimeout(() => setInAppSaved(false), 2200);
  }, [fileName, gabjiData, items]);

  /** 상단 저장 버튼:
   *  사진대지    → 서버 저장
   *  갑지·항목별 → 앱 내 저장 (localStorage)
   *  그 외       → 수정본 엑셀 다운로드
   */
  const handleSaveSheet = useCallback(() => {
    if (isPhotoActive)              handlePhotoSave();
    else if (isCoverActive || isItemActive) handleInAppSave();
    else                            handleDownload();
  }, [isPhotoActive, isCoverActive, isItemActive, handlePhotoSave, handleInAppSave, handleDownload]);

  // ── 인쇄 영역(printArea) 기반 표시 범위 계산 ─────────────────────
  const pa        = sheet?.printArea;
  const rowStart  = pa ? pa.r1 - 1 : 0; // 0-based
  const colStart  = pa ? pa.c1 - 1 : 0; // 0-based
  const displayRows = sheet
    ? (pa
        ? sheet.rows.slice(rowStart, Math.min(pa.r2, sheet.rows.length))
            .map(r => ({ ...r, cells: r.cells.slice(colStart, pa.c2) }))
        : sheet.rows)
    : [];
  const displayColWidths = sheet
    ? (pa ? sheet.colWidths.slice(colStart, pa.c2) : sheet.colWidths)
    : [];

  return (
    <div className={styles.page}>

      {/* ── TOP BAR: 업로드가 모바일·웹 모두 맨 앞(갑)에 오도록 순서 고정 ── */}
      <div className={styles.topBar}>
        <label className={styles.uploadBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>업로드</span>
          <input ref={fileInputRef} type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className={styles.hiddenInput} onChange={handleFile} aria-label="엑셀 파일 선택" />
        </label>
        <div className={styles.fileArea}>
          {fileName
            ? <span className={styles.fileName}>{fileName}</span>
            : <span className={styles.filePlaceholder}>엑셀 파일을 업로드하세요</span>}
          {editedCount > 0 && <span className={styles.editBadge}>{editedCount}셀 수정됨</span>}
        </div>
        {!isStandalone && (
          <button type="button" className={styles.pwaBtn} onClick={() => setShowPwaGuide(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/>
              <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>앱 설치</span>
          </button>
        )}
        {sheets.length > 0 && (<>
          {/* 저장: 모든 시트에서 표시. 사진대지 → 서버 저장, 그 외 → 수정본 다운로드 */}
          <button type="button"
            className={`${styles.saveBtn} ${inAppSaved ? styles.saveBtnDone : ""}`}
            onClick={handleSaveSheet} disabled={isPhotoActive && photoSaving}>
            {isPhotoActive && photoSaving
              ? <span className={styles.saveBtnSpinner} />
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
            }
            <span>
              {isPhotoActive && photoSaving ? "저장 중…"
                : inAppSaved ? "저장 완료 ✓"
                : "저장"}
            </span>
          </button>
          {/* 인쇄: 항상 미리보기 먼저 표시 (항목별 세부내역·사진대지 공통) */}
          <button type="button" className={styles.printBtn} onClick={() => setShowPreview(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>인쇄</span>
          </button>
          <button type="button" className={styles.downloadBtn} onClick={handleDownload}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>다운로드</span>
          </button>
        </>)}
      </div>

      {/* ── CONTENT ── */}
      <div className={styles.content}>
        {loading && (
          <div className={styles.overlay}><div className={styles.spinner} /><span>파일 분석 중…</span></div>
        )}
        {!loading && sheets.length === 0 && (
          <div className={styles.empty}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            <p>엑셀 파일을 업로드하면<br />시트 미리보기가 표시됩니다</p>
            <p className={styles.emptyHint}>셀을 탭하면 바로 수정할 수 있어요</p>
          </div>
        )}
        {!loading && sheets.length > 0 && (<>
          <div className={styles.tabs}>
            {sheets.map((s, i) => (
              <button key={i} type="button"
                className={`${styles.tab} ${i === activeSheet ? styles.tabActive : ""}`}
                onClick={() => { setActiveSheet(i); setSelectedCell(null); }}>
                {s.name}
              </button>
            ))}
            {pa && (
              <span style={{ fontSize: "10px", color: "#6b7280", padding: "0 6px", alignSelf: "center", whiteSpace: "nowrap" }}>
                인쇄영역 {`${colLetter(pa.c1)}${pa.r1}:${colLetter(pa.c2)}${pa.r2}`} ({displayRows.length}행)
              </span>
            )}
          </div>

          {sheet && isCoverSheet(sheet.name) ? (
            <div key={`gabji-${activeSheet}`} className={styles.viewport} style={{ overflowY: "auto" }}>
              <GabjiFormView
                data={gabjiData}
                onSave={handleGabjiSave}
                itemAmounts={Object.fromEntries(
                  Array.from({ length: 9 }, (_, i) => [i + 1, sumByCategory(items, i + 1)])
                )}
              />
            </div>
          ) : sheet && isItemSheet(sheet.name) ? (
            <div key={`items-${activeSheet}`} className={styles.viewportPhoto}>
              <ItemListView items={items} onChange={handleItemsChange} />
            </div>
          ) : sheet && isPhotoSheet(sheet.name) ? (
            <div key={`photo-${activeSheet}`} className={styles.viewportPhoto}>
              {photoUploading && (
                <div className={styles.overlay}>
                  <div className={styles.spinner} /><span>사진 업로드 중…</span>
                </div>
              )}
              {/* 저장 완료 토스트 */}
              {saveToast && (
                <div className={styles.saveToast}>저장 완료</div>
              )}
              {(photoBlocks[sheet.name]?.length ?? 0) === 0 ? (
                <div className={styles.photoEmpty}>
                  <p>NO.1, NO.2… 블록을 찾지 못했습니다.</p>
                  <p className={styles.photoEmptyHint}>
                    엑셀 시트에 &quot;NO.1&quot;, &quot;NO.2&quot; 형식의 셀이 있으면 자동으로 블록이 만들어집니다.
                  </p>
                </div>
              ) : (
                <PhotoSheetView
                  sheetName={sheet.name}
                  blocks={photoBlocks[sheet.name] ?? []}
                  availableLabels={availableLabels}
                  onSlotClick={handleSlotClick}
                  onPhotoDelete={handlePhotoDelete}
                  onMetaUpdate={handleMetaUpdate}
                />
              )}
            </div>
          ) : sheet && (
            <div key={`table-${activeSheet}`} className={styles.viewport}>
              <div className={isAllowanceSheet(sheet.name) ? styles.sheetDocument : styles.sheetTableWrap}>
              <FitToWidth
                contentWidth={displayColWidths.reduce((a, b) => a + b, 0) || 1}
                contentHeight={displayRows.reduce((sum, r) => sum + (r.height ?? 20), 0) || 1}
                zoomScale={sheet.zoomScale}
              >
                <table className={`${styles.table} ${styles.tableOuterThick}`}>
                  <colgroup>{displayColWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                  <tbody>
                    {displayRows.map((row, ri) => (
                      <tr key={ri} style={row.height !== null ? { height: row.height } : undefined}>
                        {row.cells.map((cell, ci) => {
                          if (cell.skip) return null;
                          const ref      = `${colLetter(ci + 1 + colStart)}${ri + 1 + rowStart}`;
                          const key      = mkKey(activeSheet, ref);
                          const override = formValues[key];
                          const isSel    = selectedCell?.ri === ri && selectedCell?.ci === ci;
                          let cls = styles.cellEditable;
                          if (override !== undefined) cls = styles.cellHighlight;
                          if (isSel) cls = `${cls ?? ""} ${styles.cellSelected}`.trim();
                          return (
                            <td key={ci}
                              ref={isSel ? selectedTdRef : undefined}
                              rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                              colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                              style={cell.style as React.CSSProperties}
                              className={cls}
                              onClick={() => {
                                setSelectedCell({ ri, ci });
                                openSheet(ref, activeSheet, toCellDisplayString(cell.value));
                              }}
                            >
                              {toCellDisplayString(override ?? cell.value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </FitToWidth>
              </div>
            </div>
          )}
        </>)}
      </div>

      {/* ── 인쇄 미리보기 모달: 현재 활성 시트만 표시 ── */}
      {showPreview && sheet && (
        <div className={styles.previewOverlay}>
          <div className={styles.previewHeader}>
            <span className={styles.previewTitle}>
              인쇄 미리보기 <span className={styles.previewCount}>· {sheet.name}</span>
            </span>
            <div className={styles.previewHeaderActions}>
              <button
                type="button"
                className={styles.previewPrintBtn}
                disabled={pdfLoading}
                onClick={async () => {
                  setPdfLoading(true);
                  try {
                    if (isPhotoSheet(sheet.name)) {
                      await handlePhotoSheetPrint();
                    } else {
                      await handlePrintActive();
                    }
                  } finally {
                    setPdfLoading(false);
                  }
                }}
              >
                {pdfLoading ? (
                  <>
                    <div className={styles.previewPrintSpinner} />
                    PDF 생성 중…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    PDF 열기
                  </>
                )}
              </button>
              <button type="button" className={styles.previewClose} onClick={() => setShowPreview(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          <div className={styles.previewScroll} id="previewScrollContent">
            {isPhotoSheet(sheet.name) ? (
              <div className={styles.previewPhotoWrap}>
                <PhotoSheetView
                  sheetName={sheet.name}
                  blocks={photoBlocks[sheet.name] ?? []}
                  a4Mode
                />
              </div>
            ) : isCoverSheet(sheet.name) ? (
              <PreviewSheet
                sheet={sheet}
                sheetIdx={activeSheet}
                formValues={{
                  ...formValues,
                  ...gabjiPrintOverrides(
                    sheet, activeSheet, gabjiData,
                    Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, sumByCategory(items, i + 1)])),
                  ),
                }}
              />
            ) : (
              <PreviewSheet sheet={sheet} sheetIdx={activeSheet} formValues={formValues} />
            )}
            <button type="button" className={styles.previewCloseBottom} onClick={() => setShowPreview(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {/* ── 사진 바텀시트 ── */}
      {photoSlot && <div className={styles.backdrop} onClick={() => setPhotoSlot(null)} />}
      <div className={`${styles.bottomSheet} ${photoSlot ? styles.bottomSheetOpen : ""}`}>
        <div className={styles.sheetHandle} />
        <div className={styles.sheetHeader}>
          <div className={styles.sheetCellInfo}>
            <span className={styles.sheetCellRef}>사진 추가</span>
            <span className={styles.sheetSheetName}>
              {photoSlot?.side === "left" ? "반입사진" : "지급/설치사진"} · 슬롯 {(photoSlot?.slotIndex ?? 0) + 1}
            </span>
          </div>
          <button type="button" className={styles.sheetClose} onClick={() => setPhotoSlot(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.photoActions}>
          <label className={styles.photoActionBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            카메라 촬영
            <input type="file" accept="image/*" capture="environment" hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handlePhotoUpload(f); }} />
          </label>
          <label className={styles.photoActionBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            갤러리에서 선택
            <input type="file" accept="image/*" hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handlePhotoUpload(f); }} />
          </label>
          <button type="button" className={styles.sheetCancel} onClick={() => setPhotoSlot(null)}>취소</button>
        </div>
      </div>

      {/* ── BACKDROP ── */}
      {editingCell && <div className={styles.backdrop} onClick={handleCancel} />}

      {/* ── BOTTOM SHEET ── */}
      <div className={`${styles.bottomSheet} ${editingCell ? styles.bottomSheetOpen : ""}`}>
        <div className={styles.sheetHandle} />
        <div className={styles.sheetHeader}>
          <div className={styles.sheetCellInfo}>
            <span className={styles.sheetCellRef}>{editingCell?.ref}</span>
            <span className={styles.sheetSheetName}>
              {editingCell ? (sheets[editingCell.sheetIdx]?.name ?? "") : ""}
            </span>
          </div>
          <button type="button" className={styles.sheetClose} onClick={handleCancel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {editingCell?.originalValue && (
          <div className={styles.sheetOriginal}>
            원본값 <strong>{editingCell.originalValue}</strong>
          </div>
        )}
        <input ref={inputRef} type="text" className={styles.sheetInput}
          value={editValue} onChange={e => setEditValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter")  { e.preventDefault(); handleSave(); }
            if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
            if (e.key === "Tab")    { e.preventDefault(); handleSave(); }
          }}
          placeholder="수정할 값 입력 (빈 값이면 원본 유지)"
        />
        <div className={styles.sheetActions}>
          <button type="button" className={styles.sheetReset} onClick={() => setEditValue("")}>초기화</button>
          <div className={styles.sheetActionRight}>
            <button type="button" className={styles.sheetCancel} onClick={handleCancel}>취소</button>
            <button type="button" className={styles.sheetSave} onClick={handleSave}>저장</button>
          </div>
        </div>
      </div>

      {/* ── PWA 설치 안내 모달 ── */}
      {showPwaGuide && (
        <div className={styles.pwaBackdrop} onClick={() => setShowPwaGuide(false)}>
          <div className={styles.pwaModal} onClick={e => e.stopPropagation()}>
            <div className={styles.pwaModalHeader}>
              <span>📲 앱 설치 안내</span>
              <button type="button" onClick={() => setShowPwaGuide(false)} className={styles.pwaClose}>✕</button>
            </div>
            <p className={styles.pwaDesc}>
              설치하면 카카오톡에서 엑셀 파일을 받은 뒤<br />
              <strong>공유 → SafetyCost</strong> 로 바로 열 수 있습니다.
            </p>

            <div className={styles.pwaSection}>
              <div className={styles.pwaSectionTitle}>🤖 Android (크롬)</div>
              <ol className={styles.pwaSteps}>
                <li>크롬 주소창 옆 <strong>⋮ 메뉴</strong> 탭</li>
                <li><strong>"홈 화면에 추가"</strong> 또는 <strong>"앱 설치"</strong> 선택</li>
                <li><strong>설치</strong> 버튼 탭</li>
                <li>홈 화면에 SafetyCost 아이콘 생성 완료</li>
              </ol>
            </div>

            <div className={styles.pwaSection}>
              <div className={styles.pwaSectionTitle}>🍎 iPhone (사파리)</div>
              <ol className={styles.pwaSteps}>
                <li>하단 <strong>공유 버튼</strong> (□↑) 탭</li>
                <li>스크롤해서 <strong>"홈 화면에 추가"</strong> 선택</li>
                <li><strong>추가</strong> 탭</li>
                <li>홈 화면에 SafetyCost 아이콘 생성 완료</li>
              </ol>
            </div>

            <div className={styles.pwaUsage}>
              <div className={styles.pwaUsageTitle}>설치 후 사용법</div>
              <p>카카오톡 파일 수신 → <strong>공유</strong> → <strong>SafetyCost</strong> 선택 → 자동으로 열림</p>
            </div>

            <button type="button" className={styles.pwaConfirm} onClick={() => setShowPwaGuide(false)}>
              확인
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
