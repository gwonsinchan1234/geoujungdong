"use client";

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Link from "next/link";
import * as XLSX from "xlsx";
import PhotoSheetView from "@/components/photo-sheet/PhotoSheetView";
import PhotoBlockCard from "@/components/photo-sheet/PhotoBlockCard";
import type { PhotoBlock, BlockPhoto, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "@/components/photo-sheet/types";
import { parseExcelBuffer } from "@/lib/parseExcel";
import type { ParsedSheet } from "@/lib/parseExcel";
import { photoDraft } from "@/lib/photoDraft";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";
import GabjiEditor from "@/components/gabji/GabjiEditor";
import type { GabjiDoc, GabjiItem as GNewItem } from "@/components/gabji/types";
import { makeEmptyGabji, DEFAULT_ITEMS } from "@/components/gabji-form/types";
import type { GabjiData } from "@/components/gabji-form/types";
import ItemListView from "@/components/item-list/ItemListView";
import type { ItemData } from "@/components/item-list/types";
import LaborAllowanceSplitLayout from "@/components/labor-allowance/LaborAllowanceSplitLayout";
import { parseNum as parseItemNum, sumByCategory, CATEGORY_LABELS, fmtNum } from "@/components/item-list/types";

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

function pickUploadProfile(file: File): { maxPx: number; quality: number; fallbackMaxPx: number; fallbackQuality: number } {
  const sizeMb = file.size / (1024 * 1024);
  const navConn = (typeof navigator !== "undefined"
    ? (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
    : undefined);
  const effectiveType = navConn?.effectiveType ?? "";
  const isSlowNetwork = effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";

  // 기본: 화질 우선 (WIFI/5G/4G)
  let maxPx = 3000;
  let quality = 0.92;
  let fallbackMaxPx = 2200;
  let fallbackQuality = 0.86;

  // 느린 네트워크는 전송량 우선
  if (isSlowNetwork) {
    maxPx = 2400;
    quality = 0.88;
    fallbackMaxPx = 1800;
    fallbackQuality = 0.82;
  }

  // 원본이 큰 경우만 추가로 한 단계 낮춤
  if (sizeMb >= 8) {
    maxPx = Math.min(maxPx, 2600);
    quality = Math.min(quality, 0.9);
    fallbackMaxPx = Math.min(fallbackMaxPx, 2000);
    fallbackQuality = Math.min(fallbackQuality, 0.84);
  }

  return { maxPx, quality, fallbackMaxPx, fallbackQuality };
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

function applyStateAction<T>(prev: T, action: React.SetStateAction<T>): T {
  return typeof action === "function" ? (action as (p: T) => T)(prev) : action;
}

function trimSheet(sheet: ParsedSheet) {
  return {
    trimmedRows: sheet.rows,
    usedCols: sheet.colWidths.length,
    colWidths: sheet.colWidths,
    rowOffset: sheet.renderRange.r1 - 1,
    colOffset: sheet.renderRange.c1 - 1,
  };
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isKakaoInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /KAKAOTALK/i.test(navigator.userAgent);
}

function buildItemListPrintHtml(items: ItemData[], fileName: string): string {
  const grouped = new Map<number, ItemData[]>();
  for (let n = 1; n <= 9; n++) grouped.set(n, []);
  for (const item of items) grouped.get(item.categoryNo)?.push(item);

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const rows: string[] = [];

  rows.push(`
    <tr class="sum-row">
      <td colspan="6">합 계</td>
      <td class="num">${fmtNum(total)}</td>
    </tr>
  `);

  for (let catNo = 1; catNo <= 9; catNo++) {
    const catItems = grouped.get(catNo) ?? [];
    const catTotal = catItems.reduce((sum, item) => sum + item.amount, 0);
    rows.push(`
      <tr class="cat-row">
        <td colspan="6">${catNo}. ${escapeHtml(CATEGORY_LABELS[catNo] ?? "")}</td>
        <td class="num">${catTotal > 0 ? fmtNum(catTotal) : ""}</td>
      </tr>
    `);
    if (catItems.length === 0) {
      for (let i = 0; i < 2; i++) {
        rows.push(`
          <tr>
            <td></td><td></td><td></td><td class="num"></td><td></td><td class="num"></td><td class="num"></td>
          </tr>
        `);
      }
      continue;
    }
    catItems.forEach((item, idx) => {
      rows.push(`
        <tr>
          <td>${escapeHtml(item.evidenceNo || `NO.${idx + 1}`)}</td>
          <td>${escapeHtml(item.usageDate || "")}</td>
          <td>${escapeHtml(item.name || "")}</td>
          <td class="num">${item.quantity ? fmtNum(item.quantity) : ""}</td>
          <td>${escapeHtml(item.unit || "")}</td>
          <td class="num">${item.unitPrice ? fmtNum(item.unitPrice) : ""}</td>
          <td class="num">${item.amount ? fmtNum(item.amount) : ""}</td>
        </tr>
      `);
    });
  }

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>항목별 세부내역서</title>
<style>
  @page{size:A4 portrait;margin:10mm}
  *{box-sizing:border-box}
  body{margin:0;color:#000;background:#fff;font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .doc{width:100%;max-width:190mm;margin:0 auto}
  .title{font-size:16px;font-weight:800;letter-spacing:0.08em;text-align:center;padding:4px 0 10px}
  .meta{font-size:11px;color:#444;text-align:right;padding-bottom:6px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid #777;font-size:10px;line-height:1.25;padding:4px 4px;vertical-align:middle}
  th{background:#efefef;font-weight:800;text-align:center}
  .cat-row td{background:#f7f7f7;font-weight:700}
  .sum-row td{background:#f2f2f2;font-weight:800}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
  .w-no{width:8%}.w-date{width:10%}.w-name{width:35%}.w-qty{width:7%}.w-unit{width:7%}.w-price{width:16%}.w-amt{width:17%}
</style></head><body><div class="doc">
  <div class="title">항목별 세부내역서</div>
  <div class="meta">${escapeHtml(fileName || "")}</div>
  <table>
    <thead>
      <tr>
        <th class="w-no">번호</th>
        <th class="w-date">사용일자</th>
        <th class="w-name">품명 / 규격</th>
        <th class="w-qty">수량</th>
        <th class="w-unit">단위</th>
        <th class="w-price">단가</th>
        <th class="w-amt">금액</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>
</div><script>window.onload=function(){window.focus();window.setTimeout(function(){window.print();},50);};<\/script></body></html>`;
}

function toAbsoluteRef(sheet: ParsedSheet, ri: number, ci: number): string {
  const absRow = sheet.renderRange.r1 + ri;
  const absCol = sheet.renderRange.c1 + ci;
  return `${colLetter(absCol)}${absRow}`;
}


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
      left_layout:  "auto",
      right_layout: "auto",
      sort_order:   order,
      photos:       [],
    });
  }
  return result;
}

function PreviewSheet({
  sheet, sheetIdx, formValues, formStyles,
}: {
  sheet: ParsedSheet; sheetIdx: number;
  formValues: Record<string, string>;
  formStyles?: Record<string, React.CSSProperties>;
}) {
  const { trimmedRows, usedCols, colWidths, rowOffset, colOffset } = trimSheet(sheet);
  const totalW = colWidths.reduce((a, b) => a + b, 0) || A4_W;
  const totalH = trimmedRows.reduce((sum, r) => sum + (r.height ?? 20), 0);
  const mmToPx = (mm: number) => (mm * 72) / 25.4;
  const availW = A4_W - mmToPx(20);
  const availH = A4_H - mmToPx(26); // page title 영역 포함 여유
  const previewScale = Math.min(1, availW / Math.max(1, totalW), availH / Math.max(1, totalH));
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
              const ovStyle = ov !== undefined ? formStyles?.[`${sheetIdx}__${ref}`] : undefined;
              return (
                <td
                  key={ci}
                  rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                  colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                  style={{ ...(cell.style as React.CSSProperties), ...ovStyle }}
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
      <div className={styles.previewSheetViewport}>
        <div style={{ width: totalW, height: totalH, zoom: previewScale } as React.CSSProperties}>
          {tableNode}
        </div>
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

  /* 첫 프레임 hostW===0 이면 availW=1 → zoom이 극소로 떨어져 표가 안 보이는 현상 방지 */
  const availW = Math.max(
    1,
    hostW > 0 ? hostW : (typeof window !== "undefined" ? window.innerWidth : 960),
  );
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

/** 갑지 파싱 결과 타입 */
type ParsedGabji = {
  data: GabjiData;
  /** 필드명 → 셀 ref (예: "gongsamyeong" → "B5") */
  cellRefs: Record<string, string>;
  /** 항목 9개 각각의 계획금액·전원누계·금월·누계 셀 ref */
  itemRefs: Array<{ planRef: string; prevRef: string; useRef: string; cumRef: string }>;
  /** ref → Excel 원본 셀 스타일 (fontSize 등 참조용) */
  cellStyles: Record<string, React.CSSProperties>;
};

/** 엑셀 갑지 시트에서 데이터 + 셀 ref 동시 파싱
 *  파싱 시 발견한 값 셀 위치를 cellRefs/itemRefs에 기록,
 *  gabjiPrintOverrides가 재스캔 없이 정확한 셀에 값 반영 */
function parseGabjiFromSheet(sheet: ParsedSheet): ParsedGabji {
  const d = makeEmptyGabji();
  const cellRefs: Record<string, string> = {};
  const cellStyles: Record<string, React.CSSProperties> = {};
  const rowOffset = sheet.renderRange.r1 - 1;
  const colOffset = sheet.renderRange.c1 - 1;

  // ① 기본정보 라벨 → 오른쪽 값 셀 스캔
  const BASIC: Array<{ field: keyof GabjiData; keywords: string[] }> = [
    { field: "gongsamyeong",       keywords: ["공사명"] },
    { field: "hyeonjangmyeong",    keywords: ["현장명"] },
    { field: "constructionCompany",keywords: ["건설업체명", "업체명"] },
    { field: "address",            keywords: ["소재지", "현장주소", "주소"] },
    { field: "representative",     keywords: ["대표자"] },
    { field: "gongsageumaek",      keywords: ["공사금액", "계약금액"] },
    { field: "gongsagigan",        keywords: ["공사기간", "공기"] },
    { field: "baljuja",            keywords: ["발주자"] },
    { field: "gongjungnyul",       keywords: ["누계공정율", "공정율", "공정률"] },
    { field: "signDate",           keywords: ["작성일", "작 성 일"] },
    { field: "signRep",            keywords: ["현장대리인", "현장소장"] },
    { field: "signSafety",         keywords: ["안전관리담당자", "안전담당", "안전관리자"] },
  ];

  for (let ri = 0; ri < sheet.rows.length; ri++) {
    const row = sheet.rows[ri];
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      if (!cell || cell.skip) continue;
      const text = toCellDisplayString(cell.value).replace(/[\s\u200b\u3000]/g, "");
      for (const { field, keywords } of BASIC) {
        if (cellRefs[field]) continue; // 이미 ref 확보됨
        if (!keywords.some(k => text.includes(k.replace(/\s/g, "")))) continue;
        for (let nc = ci + 1; nc < row.cells.length; nc++) {
          const vc = row.cells[nc];
          if (!vc || vc.skip) continue;
          // ref는 항상 기록 (빈 셀이어도 사용자 편집 대상 셀 위치로 사용)
          const ref = `${colLetter(nc + 1 + colOffset)}${ri + 1 + rowOffset}`;
          cellRefs[field] = ref;
          cellStyles[ref] = vc.style as React.CSSProperties;
          const val = toCellDisplayString(vc.value).trim();
          if (val) (d as unknown as Record<string, string>)[field] = val;
          break;
        }
      }
    }
  }

  // ② 항목 스캔 — 계획금액·사용금액 셀 ref도 동시 기록
  // 실제 서식 기준 (2024 산업안전보건관리비 계상 및 사용기준)
  const ITEM_KW = [
    "안전관리자",   // 1 안전관리자 등 인건비 및 각종 업무수당 등
    "안전시설비",   // 2 안전시설비 등
    "개인보호구",   // 3 개인보호구 및 안전장구 구입비 등
    "안전진단",     // 4 안전진단비 등
    "안전보건교육", // 5 안전보건교육비 및 행사비 등
    "건강진단",     // 6 근로자 건강진단비 등
    "건설재해예방", // 7 건설재해예방 기술지도비
    "본사",         // 8 본사 사용비
    "위험성평가",   // 9 위험성평가 등에 따른 소요비용 등
  ];

  const found = new Map<number, { plan: string; prev: string; cur: string; cum: string; planRef: string; prevRef: string; useRef: string; cumRef: string }>();

  for (let ri = 0; ri < sheet.rows.length; ri++) {
    const row = sheet.rows[ri];
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      if (!cell || cell.skip) continue;
      const text = toCellDisplayString(cell.value).replace(/[\s\u200b\u3000]/g, "");
      const idx = ITEM_KW.findIndex(k => text.includes(k.replace(/\s/g, "")));
      if (idx === -1 || found.has(idx)) continue;
      const numHits: Array<{ v: string; ref: string; style: React.CSSProperties }> = [];
      for (let nc = ci + 1; nc < Math.min(ci + 12, row.cells.length) && numHits.length < 4; nc++) {
        const vc = row.cells[nc];
        if (!vc || vc.skip) continue;
        const v = toCellDisplayString(vc.value).trim();
        if (v && !isNaN(parseFloat(v.replace(/,/g, "")))) {
          numHits.push({ v, ref: `${colLetter(nc + 1 + colOffset)}${ri + 1 + rowOffset}`, style: vc.style as React.CSSProperties });
        }
      }
      if (numHits[0]) cellStyles[numHits[0].ref] = numHits[0].style;
      if (numHits[1]) cellStyles[numHits[1].ref] = numHits[1].style;
      found.set(idx, {
        plan: numHits[0]?.v ?? "", prev: numHits[1]?.v ?? "",
        cur:  numHits[2]?.v ?? "", cum:  numHits[3]?.v ?? "",
        planRef: numHits[0]?.ref ?? "", prevRef: numHits[1]?.ref ?? "",
        useRef:  numHits[2]?.ref ?? "", cumRef:  numHits[3]?.ref ?? "",
      });
    }
  }

  const itemRefs: Array<{ planRef: string; prevRef: string; useRef: string; cumRef: string }> = DEFAULT_ITEMS.map((_, idx) => {
    const hit = found.get(idx);
    return hit
      ? { planRef: hit.planRef, prevRef: hit.prevRef, useRef: hit.useRef, cumRef: hit.cumRef }
      : { planRef: "", prevRef: "", useRef: "", cumRef: "" };
  });

  if (found.size > 0) {
    d.items = DEFAULT_ITEMS.map((def, idx) => {
      const hit = found.get(idx);
      return hit ? { ...def, planAmount: hit.plan, prevAmount: hit.prev, useAmount: hit.cur } : { ...def };
    });
  }

  // ③ 특수 처리: 서명 날짜 / 확인자 성명 (라벨+값이 하나의 셀에 합쳐진 구조)
  for (let ri2 = 0; ri2 < sheet.rows.length; ri2++) {
    for (const cell of sheet.rows[ri2].cells) {
      if (!cell || cell.skip) continue;
      const raw  = toCellDisplayString(cell.value);
      const flat = raw.replace(/[\s\u200b\u3000]/g, "");

      // 날짜: "YYYY년 M월 D일" 패턴 (라벨 없이 독립된 셀)
      if (!d.signDate && /\d{4}년/.test(flat) && /월/.test(flat) && /일/.test(flat)
          && !flat.includes("공사기간") && !flat.includes("공사기")) {
        d.signDate = raw.trim();
      }

      // 현장소장 성명 추출 ("직책...현장소장...성명..." 한 셀)
      if (!d.signRep && flat.includes("현장소장") && flat.includes("성명")) {
        const name = flat.split("성명").pop()?.replace(/\(서.*/, "").replace(/\(\s*$/, "").trim();
        if (name) d.signRep = name;
      }

      // 안전담당 성명 추출
      if (!d.signSafety && (flat.includes("안전담당") || flat.includes("안전관리담당자")) && flat.includes("성명")) {
        const name = flat.split("성명").pop()?.replace(/\(서.*/, "").replace(/\(\s*$/, "").trim();
        if (name) d.signSafety = name;
      }
    }
  }

  return { data: d, cellRefs, itemRefs, cellStyles };
}

// ── 갑지 인쇄용 셀 오버라이드 계산 ──────────────────────────────
// parseGabjiFromSheet에서 기록한 cellRefs/itemRefs를 직접 사용
// → 키워드 불일치·재스캔 없이 정확한 셀에 값+스타일 반영
function gabjiPrintOverrides(
  cellRefs: Record<string, string>,
  itemRefs: Array<{ planRef: string; prevRef: string; useRef: string; cumRef: string }>,
  excelCellStyles: Record<string, React.CSSProperties>,
  sheetIdx: number,
  data: GabjiData,
): { overrides: Record<string, string>; formStyles: Record<string, React.CSSProperties> } {
  const overrides: Record<string, string> = {};
  const formStyles: Record<string, React.CSSProperties> = {};

  // 기본 필드 (공사명, 현장명, 공사금액, …)
  // Excel 원본 셀 스타일(fontSize 등) 참조 + center/bold 강제
  for (const [field, ref] of Object.entries(cellRefs)) {
    if (!ref) continue;
    const val = String((data as unknown as Record<string, string>)[field] ?? "");
    if (val) {
      overrides[`${sheetIdx}__${ref}`]  = val;
      formStyles[`${sheetIdx}__${ref}`] = {
        ...excelCellStyles[ref],
        textAlign: "center",
        fontWeight: "bold",
      };
    }
  }

  // 항목 9개 계획금액·전원누계·금월·누계
  data.items.forEach((item, idx) => {
    const ref = itemRefs[idx];
    if (!ref) return;
    const applyOverride = (r: string, v: string) => {
      if (!r || !v) return;
      overrides[`${sheetIdx}__${r}`]  = v;
      formStyles[`${sheetIdx}__${r}`] = { ...excelCellStyles[r], textAlign: "center", fontWeight: "bold" };
    };
    applyOverride(ref.planRef, item.planAmount);
    applyOverride(ref.prevRef, item.prevAmount);
    applyOverride(ref.useRef,  item.useAmount);
    const cum = parseItemNum(item.prevAmount) + parseItemNum(item.useAmount);
    if (cum > 0) applyOverride(ref.cumRef, fmtNum(cum));
  });

  return { overrides, formStyles };
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

    // 단가·금액이 없거나 둘 다 0이면 데이터 행이 아님 (서브헤더 행 제외)
    const unitPrice = parseItemNum(unitPriceStr);
    const amount    = parseItemNum(amountStr);
    if (!unitPriceStr.trim() && !amountStr.trim()) continue;
    if (unitPrice === 0 && amount === 0) continue;
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
      left_layout:  "auto",
      right_layout: "auto",
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

/** 로컬 저장용 블록 정리: 임시 blob/data URL은 저장하지 않고 서버 URL만 유지 */
function sanitizePhotoBlocksForStorage(
  blocks: Record<string, PhotoBlock[]>,
): Record<string, PhotoBlock[]> {
  const out: Record<string, PhotoBlock[]> = {};
  for (const [sheetName, arr] of Object.entries(blocks)) {
    out[sheetName] = arr.map((b) => ({
      ...b,
      photos: b.photos.map((p) => ({
        ...p,
        url: (p.url?.startsWith("http://") || p.url?.startsWith("https://")) ? p.url : "",
      })),
    }));
  }
  return out;
}

type SafetyLaborHistoryRow = {
  id: string;
  person_name: string;
  payment_date: string;
  amount: number;
  attachment_count: number;
  status: "미완료" | "완료";
};

function todayMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WORKBOOK_CACHE_NAME = "workspace-fill-cache-v1";
const WORKBOOK_CACHE_KEY = "/workspace-fill/last-workbook";
const WORKBOOK_META_KEY = "workspace_fill_last_workbook_name";

/** 빈 화면(업로드 전) 진입 — 대기업 느낌 스태거 + 블러·이징 */
const FILL_EMPTY_EASE = [0.22, 1, 0.36, 1] as const;

const fillEmptyContainer = {
  hidden: {},
  visible: {
    /* 스플래시 직후 이어지는 느낌 — 초기 정적 구간 최소화 */
    transition: { staggerChildren: 0.065, delayChildren: 0.04 },
  },
} as const;

const fillEmptyIcon = {
  hidden: { opacity: 0, y: 22, scale: 0.9, filter: "blur(12px)" },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.62, ease: FILL_EMPTY_EASE },
  },
} as const;

const fillEmptyTitle = {
  hidden: { opacity: 0, y: 16, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.52, ease: FILL_EMPTY_EASE },
  },
} as const;

const fillEmptyHint = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: FILL_EMPTY_EASE },
  },
} as const;

function EmptySheetGlyph() {
  return (
    <svg
      className={styles.emptyIconSvg}
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function FillPage() {
  type DocState = {
    formValues: Record<string, string>;
    gabjiData: GabjiData;
    gabjiCellRefs: Record<string, string>;
    gabjiItemRefs: Array<{ planRef: string; prevRef: string; useRef: string; cumRef: string }>;
    gabjiCellStyles: Record<string, React.CSSProperties>;
    items: ItemData[];
    photoBlocks: Record<string, PhotoBlock[]>;
    savedAt: number;
  };

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const selectedTdRef = useRef<HTMLTableCellElement>(null);

  const [sheets,       setSheets]       = useState<ParsedSheet[]>([]);
  const [activeSheet,  setActiveSheet]  = useState(0);
  const [docState,     setDocState]     = useState<DocState>({
    formValues: {},
    gabjiData: makeEmptyGabji(),
    gabjiCellRefs: {},
    gabjiItemRefs: [],
    gabjiCellStyles: {},
    items: [],
    photoBlocks: {},
    savedAt: Date.now(),
  });
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
  const [laborRows,      setLaborRows]      = useState<SafetyLaborHistoryRow[]>([]);
  const [laborLoading,   setLaborLoading]   = useState(false);
  const [laborSearch,    setLaborSearch]    = useState("");
  const [laborMonth,     setLaborMonth]     = useState(todayMonthKey());
  const [laborPerson,    setLaborPerson]    = useState("");
  const [laborNewName,   setLaborNewName]   = useState("");
  const [laborNewDate,   setLaborNewDate]   = useState(todayDateKey());
  const [laborNewAmount, setLaborNewAmount] = useState<number>(0);
  const restoringWorkbookRef = useRef(false);
  /** 직렬이 아닌 parseWorkbookFile 호출 시, 늦게 끝난 작업이 상태를 덮어쓰지 않게 함 */
  const workbookParseGenRef = useRef(0);
  const reduceMotion = useReducedMotion();

  const formValues      = docState.formValues;
  const gabjiData       = docState.gabjiData;
  const gabjiCellRefs   = docState.gabjiCellRefs;
  const gabjiItemRefs   = docState.gabjiItemRefs;
  const gabjiCellStyles = docState.gabjiCellStyles;
  const items           = docState.items;
  const photoBlocks     = docState.photoBlocks;

  const setFormValues = useCallback((action: React.SetStateAction<Record<string, string>>) => {
    setDocState(prev => ({ ...prev, formValues: applyStateAction(prev.formValues, action), savedAt: Date.now() }));
  }, []);
  const setGabjiData = useCallback((action: React.SetStateAction<GabjiData>) => {
    setDocState(prev => ({ ...prev, gabjiData: applyStateAction(prev.gabjiData, action), savedAt: Date.now() }));
  }, []);
  const setItems = useCallback((action: React.SetStateAction<ItemData[]>) => {
    setDocState(prev => ({ ...prev, items: applyStateAction(prev.items, action), savedAt: Date.now() }));
  }, []);
  const setPhotoBlocks = useCallback((action: React.SetStateAction<Record<string, PhotoBlock[]>>) => {
    setDocState(prev => ({ ...prev, photoBlocks: applyStateAction(prev.photoBlocks, action), savedAt: Date.now() }));
  }, []);
  const markSaved = useCallback(() => {
    setDocState(prev => ({ ...prev, savedAt: Date.now() }));
  }, []);

  const previewData = useMemo(() => ({
    formValues,
    gabjiData,
    gabjiCellRefs,
    gabjiItemRefs,
    gabjiCellStyles,
    items,
    photoBlocks,
    savedAt: docState.savedAt,
  }), [formValues, gabjiData, gabjiCellRefs, gabjiItemRefs, gabjiCellStyles, items, photoBlocks, docState.savedAt]);

  const laborPdfMeta = useMemo(
    () => ({
      month: laborMonth.trim(),
      search: laborSearch.trim(),
      person: laborPerson.trim(),
    }),
    [laborMonth, laborSearch, laborPerson],
  );

  const loadLaborRows = useCallback(async () => {
    setLaborLoading(true);
    try {
      const qs = new URLSearchParams();
      if (laborSearch.trim()) qs.set("search", laborSearch.trim());
      if (laborMonth.trim()) qs.set("month", laborMonth.trim());
      if (laborPerson.trim()) qs.set("person", laborPerson.trim());

      const res = await fetch(`/api/safety-labor/documents?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "안전관리자 인건비 조회 실패");
      setLaborRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "안전관리자 인건비 조회 실패");
    } finally {
      setLaborLoading(false);
    }
  }, [laborSearch, laborMonth, laborPerson]);

  const createLaborDoc = useCallback(async () => {
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
  }, [laborNewName, laborNewDate, laborNewAmount, loadLaborRows]);


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
  const isEditingCellOpen = editingCell !== null;
  const isPhotoSlotOpen = photoSlot !== null;

  // ── PWA 설치 여부 감지 ────────────────────────────────────────────
  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  // ── 오버레이/바텀시트 상태의 body 스크롤 잠금 (단일 소스) ─────────
  useEffect(() => {
    const shouldLockBodyScroll = photoUploading || isEditingCellOpen || showPreview || isPhotoSlotOpen;
    document.body.style.overflow = shouldLockBodyScroll ? "hidden" : "";
    document.body.style.touchAction = photoUploading ? "none" : "";
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [photoUploading, isEditingCellOpen, showPreview, isPhotoSlotOpen]);

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

  // ── 사진 삭제: 서버 API(/api/photo-blocks/photos) 단일 경로 사용 ──
  const handlePhotoDelete: OnPhotoDelete = useCallback(async (photoId, blockId) => {
    // 서버 UUID가 아닌 로컬 임시 사진은 상태만 제거
    if (!photoId.startsWith("pending_") && !photoId.startsWith("local_")) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token ?? "";
        const res = await fetch("/api/photo-blocks/photos", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ photoId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? "사진 삭제 실패");
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "사진 삭제 실패");
        return;
      }
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
  }, [setPhotoBlocks]);

  // ── 메타 수정: 로컬 즉시 반영, 최종 저장은 handlePhotoSave ──────
  const handleMetaUpdate: OnMetaUpdate = useCallback((blockId, fields) => {
    setPhotoBlocks(prev => {
      const next = { ...prev };
      for (const name of Object.keys(next)) {
        next[name] = next[name].map(b => b.id !== blockId ? b : { ...b, ...fields });
      }
      return next;
    });
  }, [setPhotoBlocks]);

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
      // ① 업로드용 JPEG 변환: 동적 프로필(파일 크기/네트워크) + 1회 폴백
      // - 기본은 화질 우선
      // - 느린 네트워크/큰 원본에서만 전송량을 조금 더 줄임
      let compressed: Blob;
      try {
        const profile = pickUploadProfile(file);
        compressed = await compressImage(file, profile.maxPx, profile.quality);
        if (compressed.size > MAX_UPLOAD_BYTES) {
          compressed = await compressImage(file, profile.fallbackMaxPx, profile.fallbackQuality);
        }
      } catch {
        compressed = file;
      }

      // ② 로컬 미리보기: 압축된 JPEG blob으로 URL 생성
      //    원본 file 대신 compressed를 사용하는 이유:
      //    - 갤러리 사진은 HEIC 포맷이거나 iCloud 지연 다운로드 상태일 수 있어
      //      createObjectURL(file)의 img 렌더가 실패함 (카메라 촬영본은 즉시 JPEG이라 문제없음)
      //    - compressImage가 canvas 경유 JPEG 변환을 완료한 blob → 항상 렌더 가능
      //    - setPhotoBlocks는 어차피 압축 await 이후이므로 타이밍 차이 없음
      pUrl = URL.createObjectURL(compressed);

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

      // ── DB: photo_blocks 레코드 확보 ──────────────────────────────
      // 블록 ID가 "local_"로 시작하면 아직 DB에 없는 블록 → 자연키로 upsert
      let dbBlockId: string;
      if (!blockId.startsWith("local_")) {
        dbBlockId = blockId;
      } else {
        const { data: existing } = await supabase
          .from("photo_blocks")
          .select("id")
          .eq("doc_id",     docId)
          .eq("sheet_name", block.sheet_name)
          .eq("no",         block.no)
          .maybeSingle();
        if (existing) {
          dbBlockId = existing.id as string;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("photo_blocks")
            .insert({
              doc_id:       docId,
              user_id:      userId || null,
              sheet_name:   block.sheet_name,
              no:           block.no,
              right_header: block.right_header ?? "지급/설치 사진",
              left_date:    block.left_date ?? "",
              right_date:   block.right_date ?? "",
              left_label:   block.left_label ?? "",
              right_label:  block.right_label ?? "",
              sort_order:   block.sort_order ?? 0,
            })
            .select("id")
            .single();
          if (insErr) throw new Error(insErr.message);
          dbBlockId = inserted.id as string;
        }
      }

      // ── DB: 기존 슬롯 사진 삭제 (재업로드 UNIQUE 충돌 방지) ────────
      const { data: oldPhoto } = await supabase
        .from("block_photos")
        .select("id, storage_path")
        .eq("block_id",   dbBlockId)
        .eq("side",       side)
        .eq("slot_index", slotIndex)
        .maybeSingle();
      if (oldPhoto) {
        if (oldPhoto.storage_path) {
          await supabase.storage.from("expense-evidence").remove([oldPhoto.storage_path]);
        }
        await supabase.from("block_photos").delete().eq("id", oldPhoto.id);
      }

      // ── Storage: 브라우저 → Supabase 직접 업로드 (Vercel 미경유) ──
      const storagePath = `${userId}/${dbBlockId}/${side}/${slotIndex}.jpg`;
      const { error: storageErr } = await supabase.storage
        .from("expense-evidence")
        .upload(storagePath, compressed, { contentType: "image/jpeg", upsert: true });
      if (storageErr) throw new Error(storageErr.message);

      // ── DB: block_photos INSERT ────────────────────────────────────
      const { data: photo, error: photoErr } = await supabase
        .from("block_photos")
        .insert({ block_id: dbBlockId, side, slot_index: slotIndex, storage_path: storagePath })
        .select("id")
        .single();
      if (photoErr) {
        await supabase.storage.from("expense-evidence").remove([storagePath]);
        throw new Error(photoErr.message);
      }

      setPhotoBlocks(prev => {
        const next = { ...prev };
        for (const name of Object.keys(next)) {
          next[name] = next[name].map(b => {
            if (b.id !== blockId && b.id !== dbBlockId) return b;
            return {
              ...b,
              id:     dbBlockId,
              doc_id: docId,
              photos: b.photos.map(p => p.id !== pId ? p : {
                id:           photo.id as string,
                block_id:     dbBlockId,
                side,
                slot_index:   slotIndex,
                storage_path: storagePath,
                url:          pUrl,
              }),
            };
          });
        }
        return next;
      });
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
  }, [photoSlot, photoBlocks, setPhotoBlocks]);

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
      markSaved();
    } finally {
      setPhotoSaving(false);
    }
  }, [sheets, activeSheet, photoBlocks, fileName, markSaved]);

  // ── 바텀시트 포커스 + 배경 스크롤 잠금 ──────────────────────────
  useEffect(() => {
    if (editingCell) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
    return;
  }, [editingCell]);

  useEffect(() => {
    if (showPreview) {
      // 뒤로가기가 미리보기 닫기로 동작하도록 히스토리 엔트리 추가
      history.pushState({ preview: true }, "");
    }
    return;
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

  // 사진대지 인쇄 미리보기: localStorage 복원 등으로 url이 비어 있을 때 signed URL 재조회
  useEffect(() => {
    if (!showPreview) return;
    const s = sheets[activeSheet];
    if (!s || !isPhotoSheet(s.name)) return;
    const docId = docIdRef.current;
    if (!docId) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/photo-blocks?docId=${encodeURIComponent(docId)}`);
        const json = (await res.json()) as {
          ok?: boolean;
          blocks?: Array<{
            sheet_name: string;
            no: number;
            id: string;
            photos: Array<{
              id: string;
              block_id: string;
              side: string;
              slot_index: number;
              storage_path: string;
              url: string;
            }>;
          }>;
        };
        if (cancelled || !res.ok || !json.ok || !json.blocks?.length) return;

        setPhotoBlocks((prev) => {
          let touched = false;
          const next: Record<string, PhotoBlock[]> = { ...prev };
          for (const dbBlock of json.blocks!) {
            const arr = next[dbBlock.sheet_name];
            if (!arr) continue;
            const bi = arr.findIndex((b) => b.no === dbBlock.no);
            if (bi < 0) continue;
            const localBlock = arr[bi];
            if (!dbBlock.photos?.length) continue;

            const newPhotos: BlockPhoto[] = localBlock.photos.map((lp) => {
              const dp = dbBlock.photos.find(
                (p) => p.side === lp.side && p.slot_index === lp.slot_index,
              );
              if (!dp?.url) return lp;
              // 같은 세션에서는 로컬 blob 미리보기를 유지해
              // signed URL 만료/지연과 무관하게 사진이 즉시 보이도록 함
              if (lp.url?.startsWith("blob:")) return lp;
              return {
                ...lp,
                id: dp.id,
                block_id: dbBlock.id,
                storage_path: dp.storage_path || lp.storage_path,
                url: dp.url,
              };
            });
            for (const dp of dbBlock.photos) {
              if (!newPhotos.some((lp) => lp.side === dp.side && lp.slot_index === dp.slot_index)) {
                newPhotos.push({
                  id: dp.id,
                  block_id: dbBlock.id,
                  side: dp.side as "left" | "right",
                  slot_index: dp.slot_index,
                  storage_path: dp.storage_path,
                  url: dp.url,
                });
              }
            }
            const newArr = [...arr];
            newArr[bi] = {
              ...localBlock,
              id: dbBlock.id,
              doc_id: docId,
              photos: newPhotos,
            };
            next[dbBlock.sheet_name] = newArr;
            touched = true;
          }
          return touched ? next : prev;
        });
      } catch {
        /* 네트워크 실패 시 기존 상태 유지 */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showPreview, activeSheet, sheets, setPhotoBlocks]);

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

      const rows = sheet.rows;
      const maxCol = sheet.colWidths.length - 1;

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
      const kbRef = () => toAbsoluteRef(sheet, ri, ci);

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
  }, [editingCell, showPreview, sheets, activeSheet, selectedCell, formValues, setFormValues]);

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
  }, [editingCell, editValue, setFormValues]);

  const handleCancel = useCallback(() => setEditingCell(null), []);

  // ── 파일 파싱 공통 처리 (직접 업로드 + 새로고침 복원 공용) ──
  const parseWorkbookFile = useCallback(async (file: File) => {
    const parseId = ++workbookParseGenRef.current;
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      if (parseId !== workbookParseGenRef.current) return;
      setRawBuf(buf);
      setFileName(file.name);
      let parsed = await parseExcelBuffer(buf);
      if (parseId !== workbookParseGenRef.current) return;
      // 갑지 시트를 맨 앞으로 (모바일·웹 동일하게)
      const gabjiIdx = parsed.findIndex(s => s.name.trim() === "갑지" || s.name.includes("갑지"));
      if (gabjiIdx > 0) {
        const gabji = parsed[gabjiIdx];
        parsed = [gabji, ...parsed.slice(0, gabjiIdx), ...parsed.slice(gabjiIdx + 1)];
      }
      if (parseId !== workbookParseGenRef.current) return;
      setSheets(parsed);
      setActiveSheet(0);
      setFormValues({});
      setSelectedCell(null);

      // 갑지·항목별세부내역: localStorage 저장본 우선, 없으면 엑셀 파싱
      const savedFillData = (() => {
        try { return JSON.parse(localStorage.getItem(`fill_data_${file.name}`) ?? "null"); } catch { return null; }
      })();

      if (savedFillData?.formValues && typeof savedFillData.formValues === "object") {
        setFormValues(savedFillData.formValues as Record<string, string>);
      }

      // cellRefs/itemRefs는 엑셀 파일 구조(라벨 위치)에서 결정 → 항상 현재 파일에서 새로 파싱
      const gabjiSheet  = parsed.find(s => isCoverSheet(s.name));
      const gabjiParsed = gabjiSheet ? parseGabjiFromSheet(gabjiSheet) : null;

      const parsedItems = parseItemsFromRaw(buf);
      if (savedFillData?.gabjiData && savedFillData?.items) {
        // 사용자 편집 데이터는 저장본 복원, ref/styles는 항상 현재 파일 기준
        setDocState(prev => ({
          ...prev,
          gabjiData:       savedFillData.gabjiData,
          gabjiCellRefs:   gabjiParsed?.cellRefs   ?? {},
          gabjiItemRefs:   gabjiParsed?.itemRefs   ?? [],
          gabjiCellStyles: gabjiParsed?.cellStyles ?? {},
          items:           savedFillData.items,
          savedAt:         Date.now(),
        }));
      } else {
        setDocState(prev => ({
          ...prev,
          gabjiData:       gabjiParsed?.data       ?? makeEmptyGabji(),
          gabjiCellRefs:   gabjiParsed?.cellRefs   ?? {},
          gabjiItemRefs:   gabjiParsed?.itemRefs   ?? [],
          gabjiCellStyles: gabjiParsed?.cellStyles ?? {},
          items:           parsedItems,
          savedAt:         Date.now(),
        }));
      }

      // ── 사진대지 블록: items 기반 생성 (parsePhotoBlocksFromRaw 대체)
      const resolvedItems: ItemData[] = savedFillData?.items ?? parsedItems;
      let freshBlocks = resolvedItems.length > 0
        ? buildPhotoBlocksFromItems(resolvedItems, parsed.map(s => s.name))
        : parsePhotoBlocksFromRaw(buf, parsed.map(s => s.name)); // fallback
      if (savedFillData?.photoBlocks && typeof savedFillData.photoBlocks === "object") {
        freshBlocks = mergePhotoBlocks(
          freshBlocks,
          sanitizePhotoBlocksForStorage(savedFillData.photoBlocks as Record<string, PhotoBlock[]>),
        );
      }

      // docId 복원 (사진 서버 연결용) — 블록 구조는 항상 freshBlocks 사용
      const draft = photoDraft.load(file.name);
      if (draft) {
        docIdRef.current = draft.docId;
      } else {
        docIdRef.current = crypto.randomUUID();
      }
      setPhotoBlocks(freshBlocks);

      // DB 사진 병합은 비동기 후처리로 분리해 업로드 직후 진입 체감 속도를 개선
      void (async () => {
        const mergeParseId = parseId;
        const mergeDocId = docIdRef.current;
        try {
          const res = await fetch(`/api/photo-blocks?docId=${mergeDocId}`);
          if (mergeParseId !== workbookParseGenRef.current) return;
          const json = await res.json() as { ok: boolean; blocks?: Array<{
            sheet_name: string; no: number; id: string;
            photos: Array<{ id: string; block_id: string; side: string; slot_index: number; storage_path: string; url: string }>;
          }> };
          const blocks = json.blocks ?? [];
          if (!json.ok || blocks.length === 0) return;
          if (mergeParseId !== workbookParseGenRef.current) return;
          setPhotoBlocks(prev => {
            const next = { ...prev };
            for (const dbBlock of blocks) {
              const localArr = next[dbBlock.sheet_name];
              if (!localArr) continue;
              const localBlock = localArr.find(b => b.no === dbBlock.no);
              if (!localBlock || !dbBlock.photos.length) continue;
              localBlock.id = dbBlock.id;
              localBlock.doc_id = mergeDocId;
              localBlock.photos = dbBlock.photos.map(p => ({
                id: p.id, block_id: p.block_id,
                side: p.side as "left" | "right",
                slot_index: p.slot_index,
                storage_path: p.storage_path,
                url: p.url,
              }));
            }
            return next;
          });
        } catch {
          // 네트워크 실패 시 무시 (초기 진입은 유지)
        }
      })();

      // 새로고침 복구용으로 마지막 업로드 파일 자체를 캐시에 보관
      try {
        const cache = await caches.open(WORKBOOK_CACHE_NAME);
        if (parseId !== workbookParseGenRef.current) return;
        await cache.put(
          WORKBOOK_CACHE_KEY,
          new Response(file, {
            headers: {
              "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "X-File-Name": encodeURIComponent(file.name),
            },
          }),
        );
        localStorage.setItem(WORKBOOK_META_KEY, file.name);
      } catch {
        // 캐시 저장 실패 시에도 편집 기능은 계속 동작
      }
    } catch (err) {
      console.error("[handleFile]", err);
      const detail = err instanceof Error ? err.message : String(err);
      alert(`엑셀 파일을 읽는 중 오류가 났습니다.\n${detail}`);
    } finally {
      if (parseId === workbookParseGenRef.current) setLoading(false);
    }
  }, [setFormValues, setGabjiData, setItems, setPhotoBlocks]);

  // ── 파일 업로드 핸들러 ─────────────────────────────────────────
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await parseWorkbookFile(file);
  }, [parseWorkbookFile]);

  // ── 마지막 업로드 복원 해제 (캐시 + 로컬 저장값 제거) ─────────────
  const handleClearRestoreCache = useCallback(async () => {
    try {
      const cache = await caches.open(WORKBOOK_CACHE_NAME);
      await cache.delete(WORKBOOK_CACHE_KEY);
      localStorage.removeItem(WORKBOOK_META_KEY);
      if (fileName) localStorage.removeItem(`fill_data_${fileName}`);
      alert("마지막 복원 파일을 해제했습니다.");
    } catch {
      alert("복원 해제 중 오류가 발생했습니다.");
    }
  }, [fileName]);

  // ── 새로고침 복원: 마지막 업로드 엑셀 자동 복구 ─────────────────
  useEffect(() => {
    if (restoringWorkbookRef.current || sheets.length > 0 || loading) return;
    restoringWorkbookRef.current = true;
    (async () => {
      try {
        const cache = await caches.open(WORKBOOK_CACHE_NAME);
        const res = await cache.match(WORKBOOK_CACHE_KEY);
        if (!res) return;
        const blob = await res.blob();
        const cachedName =
          decodeURIComponent(res.headers.get("X-File-Name") ?? "") ||
          localStorage.getItem(WORKBOOK_META_KEY) ||
          "복원된파일.xlsx";
        const file = new File([blob], cachedName, {
          type: blob.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        await parseWorkbookFile(file);
      } catch {
        // 복원 실패는 무시 (수동 업로드 가능)
      }
    })();
  }, [sheets.length, loading, parseWorkbookFile]);

  // ── 사진대지 새 창 브라우저 인쇄 ──────────────────────────────────
  const handlePhotoSheetPrint = useCallback(async () => {
    const s = sheets[activeSheet];
    if (!s) return;
    const blocks = previewData.photoBlocks[s.name] ?? [];

    // 사진 → data URI 변환 (새 창 인라인 렌더링용)
    const toDataUri = async (url: string): Promise<string> => {
      if (!url) return "";
      try {
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
            const MAX = 1200;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.9));
          };
          img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(""); };
          img.src = objUrl;
        });
      } catch { return ""; }
    };

    const resolvedBlocks = await Promise.all(blocks.map(async b => ({
      ...b,
      photos: await Promise.all(b.photos.map(async p => ({
        ...p, url: await toDataUri(p.url ?? ""),
      }))),
    })));

    // 클라이언트에서 직접 HTML 생성 → 새 창에서 window.print()
    const BLOCKS_PER_PAGE = 3;
    const pages: (typeof resolvedBlocks)[] = [];
    for (let i = 0; i < resolvedBlocks.length; i += BLOCKS_PER_PAGE)
      pages.push(resolvedBlocks.slice(i, i + BLOCKS_PER_PAGE));

    const grid = (photos: { side: string; slot_index: number; url: string }[], count: number) => {
      const sorted = [...photos].sort((a, b) => a.slot_index - b.slot_index).slice(0, 4);
      const cols = count <= 1 ? "1fr" : "1fr 1fr";
      const rows = count <= 2 ? "1fr" : "1fr 1fr";
      const tmpl = count === 3
        ? "grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;"
        : `grid-template-columns:${cols};grid-template-rows:${rows};`;
      const cells = sorted.map((p, i) => {
        const span = count === 3 && i === 2 ? "grid-column:1/-1;" : "";
        return p.url
          ? `<div style="${span}position:relative;overflow:hidden;border-radius:2px"><img src="${p.url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></div>`
          : `<div style="${span}background:#e5e7eb;border-radius:2px"></div>`;
      }).join("");
      return `<div style="display:grid;${tmpl}gap:3px;width:100%;height:100%">${cells}</div>`;
    };

    const pagesHtml = pages.map((pg, pi) => {
      const br = pi < pages.length - 1 ? "page-break-after:always;" : "";
      const bs = pg.map(b => {
        const lp = b.photos.filter(p => p.side === "left");
        const rp = b.photos.filter(p => p.side === "right");
        return `<div class="bc">
          <div class="bh">NO. ${b.no}</div>
          <div class="sh"><div class="shc">반입사진</div><div class="shd"></div><div class="shc">${b.right_header || "지급/설치사진"}</div></div>
          <div class="gr"><div class="gw">${grid(lp, Math.min(lp.length, 4))}</div><div class="gd"></div><div class="gw">${grid(rp, Math.min(rp.length, 4))}</div></div>
          <div class="bf">
            <div class="fs"><span class="fl">날짜</span><span class="fv">${b.left_date ?? ""}</span><span class="fl">항목</span><span class="fv">${b.left_label ?? ""}</span></div>
            <div class="fd"></div>
            <div class="fs"><span class="fl">날짜</span><span class="fv">${b.right_date ?? ""}</span><span class="fl">항목</span><span class="fv">${b.right_label ?? ""}</span></div>
          </div>
        </div>`;
      }).join("");
      return `<div style="${br}"><div class="pt">${s.name}</div>${bs}</div>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="color-scheme" content="light"><title>${s.name}</title><style>
@page{size:A4 portrait;margin:12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Apple SD Gothic Neo",sans-serif;background:#fff !important;color:#000 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
img{image-rendering:high-quality;display:block}
.pt{font-size:13px;font-weight:700;text-align:center;color:#111827;padding:6px 0 10px;border-bottom:2px solid #111827;margin-bottom:10px}
.bc{border:1.5px solid #374151;border-radius:4px;overflow:hidden;margin-bottom:10px;break-inside:avoid}
.bh{background:#111827;padding:6px 12px;font-size:13px;font-weight:700;color:#fff}
.sh{display:grid;grid-template-columns:1fr 1px 1fr;border-bottom:1px solid #d1d5db}
.shc{font-size:11px;font-weight:700;color:#374151;text-align:center;padding:5px 0;background:#f3f4f6}
.shd{background:#d1d5db}
.gr{display:grid;grid-template-columns:1fr 1px 1fr;height:52mm}
.gw{padding:4px}.gd{background:#d1d5db}
.bf{display:grid;grid-template-columns:1fr 1px 1fr;border-top:1px solid #d1d5db;background:#f9fafb}
.fs{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;padding:7px 10px;align-items:baseline}
.fl{font-size:10px;font-weight:700;color:#6b7280}
.fv{font-size:11px;color:#111827;font-weight:500}
.fd{background:#d1d5db}
</style></head><body>${pagesHtml}<script>window.onload=function(){window.focus();window.print();}<\/script></body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }, [sheets, activeSheet, previewData]);

  // ── 항목별세부내역: react-pdf로 PDF 생성 후 새 탭 열기 (갑지와 동일 방식) ──
  const handleItemPdfPrint = useCallback(async () => {
    try {
      if (isKakaoInAppBrowser()) {
        const html = buildItemListPrintHtml(items, fileName || "");
        const w = window.open("", "_blank");
        if (!w) {
          alert("카카오톡 브라우저에서 팝업이 차단되었습니다. 우측 상단 메뉴에서 외부 브라우저로 열어 인쇄해주세요.");
          return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        return;
      }

      const [{ pdf }, { default: ItemListPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/item-list/ItemListPdf"),
      ]);
      const blob = await pdf(React.createElement(ItemListPdf, { items }) as any).toBlob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (!w) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `항목별세부내역_${fileName || "문서"}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 생성 실패");
    }
  }, [items, fileName]);

  const sheet = sheets[activeSheet];
  const activePhotoSheetName = (sheet && isPhotoSheet(sheet.name)) ? sheet.name : null;
  const activePhotoBlocks = activePhotoSheetName ? (photoBlocks[activePhotoSheetName] ?? []) : [];

  const [selectedPhotoBlockId, setSelectedPhotoBlockId] = useState<string | null>(null);
  const [photoPanel, setPhotoPanel] = useState<"list" | "edit" | "preview">("edit");

  useEffect(() => {
    if (!activePhotoSheetName) return;
    if (activePhotoBlocks.length === 0) {
      setSelectedPhotoBlockId(null);
      return;
    }
    const exists = selectedPhotoBlockId
      ? activePhotoBlocks.some(b => b.id === selectedPhotoBlockId)
      : false;
    if (!exists) setSelectedPhotoBlockId(activePhotoBlocks[0]!.id);
  }, [activePhotoSheetName, activePhotoBlocks, selectedPhotoBlockId]);

  useEffect(() => {
    // 시트가 바뀔 때(특히 사진대지 ↔ 다른 시트) 모바일 패널 상태가 꼬이지 않게 기본값으로 복귀
    setPhotoPanel("edit");
  }, [activePhotoSheetName]);

  const selectedPhotoBlock = useMemo(() => {
    if (!selectedPhotoBlockId) return activePhotoBlocks[0] ?? null;
    return activePhotoBlocks.find(b => b.id === selectedPhotoBlockId) ?? activePhotoBlocks[0] ?? null;
  }, [activePhotoBlocks, selectedPhotoBlockId]);

  // ── 갑지 미리보기 오버라이드 (렌더 단계 계산) ─────────────────────
  const { overrides: previewGabjiOv, formStyles: previewGabjiFs } =
    sheet && isCoverSheet(sheet.name)
      ? gabjiPrintOverrides(previewData.gabjiCellRefs, previewData.gabjiItemRefs, previewData.gabjiCellStyles, activeSheet, previewData.gabjiData)
      : { overrides: {} as Record<string, string>, formStyles: {} as Record<string, React.CSSProperties> };

  // ── 현재 활성 시트 새 창 브라우저 인쇄 ───────────────────────────
  const handlePrintActive = useCallback(() => {
    if (!sheet) return;
    if (isItemSheet(sheet.name)) {
      void handleItemPdfPrint();
      return;
    }
    const { trimmedRows, usedCols, colWidths, rowOffset, colOffset } = trimSheet(sheet);
    const { overrides: gabjiOv, formStyles: gabjiFs } = isCoverSheet(sheet.name)
      ? gabjiPrintOverrides(previewData.gabjiCellRefs, previewData.gabjiItemRefs, previewData.gabjiCellStyles, activeSheet, previewData.gabjiData)
      : { overrides: {} as Record<string, string>, formStyles: {} as Record<string, React.CSSProperties> };
    const effectiveFormValues = { ...previewData.formValues, ...gabjiOv };
    const colgroup = colWidths
      .map((w) => `<col style="width:${w}px">`)
      .join("");
    const contentW = colWidths.reduce((a, b) => a + b, 0) || 1;
    const contentH = trimmedRows.reduce((sum, r) => sum + (r.height ?? 20), 0) || 1;
    const mmToPx = (mm: number) => (mm * 72) / 25.4;
    const printableW = 595 - mmToPx(20);
    const printableH = 842 - mmToPx(20);
    const fitScale = Math.min(1, printableW / contentW, printableH / contentH);
    const scaledW = Math.max(1, Math.round(contentW * fitScale));
    const scaledH = Math.max(1, Math.round(contentH * fitScale));
    const tbody = trimmedRows.map((row, ri) =>
      `<tr ${row.height !== null ? `style="height:${row.height}px"` : ""}>${
        row.cells.slice(0, usedCols).map((cell, ci) => {
          if (cell.skip) return "";
          const ref = `${colLetter(ci + 1 + colOffset)}${ri + 1 + rowOffset}`;
          const val = toCellDisplayString(effectiveFormValues[`${activeSheet}__${ref}`] ?? cell.value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const ovStyle = gabjiFs[`${activeSheet}__${ref}`] ?? {};
          const css = Object.entries({ ...cell.style, ...ovStyle })
            .map(([k, v]) => `${k.replace(/([A-Z])/g, c => `-${c.toLowerCase()}`)}:${v}`).join(";");
          const rs = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
          const cs = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
          return `<td${rs}${cs} style="${css}">${val}</td>`;
        }).join("")
      }</tr>`
    ).join("");
    const sheetHtml = `<div class="sheet-page">
      <div class="sheet-scale-wrap" style="width:${scaledW}px;height:${scaledH}px">
        <div class="sheet-scale" style="width:${contentW}px;height:${contentH}px;transform:scale(${fitScale})">
          <table class="sheet-table"><colgroup>${colgroup}</colgroup><tbody>${tbody}</tbody></table>
        </div>
      </div>
    </div>`;
    const fullHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${sheet.name}</title>
<style>
  @page{size:A4 portrait;margin:10mm}
  *{box-sizing:border-box}
  body{margin:0;background:#ffffff;font-family:'Calibri','Apple SD Gothic Neo',sans-serif}
  .sheet-page{
    margin:0 auto;
    padding:0;
  }
  .sheet-scale-wrap{
    margin:0 auto;
    overflow:hidden;
  }
  .sheet-scale{ transform-origin: top left; }
  .sheet-table{
    width:auto;
    border-collapse:collapse;
    table-layout:fixed;
    background:#fff;
  }
  .sheet-table td{
    box-sizing:border-box;
  }
</style>
</head><body>${sheetHtml}</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요."); return; }
    w.document.open();
    w.document.write(fullHtml);
    w.document.close();
    w.onload = () => {
      w.focus();
      w.requestAnimationFrame(() => {
        w.setTimeout(() => w.print(), 40);
      });
    };
  }, [sheet, activeSheet, previewData, handleItemPdfPrint]);

  const handleDownload = useCallback(() => {
    if (!rawBuf) return;
    const wb = XLSX.read(rawBuf.slice(0), { type: "array" });
    for (const [key, val] of Object.entries(previewData.formValues)) {
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
  }, [rawBuf, previewData, fileName]);

  const editedCount = Object.keys(formValues).length;
  const isPhotoActive = sheet ? isPhotoSheet(sheet.name) : false;
  const isAllowanceActive = sheet ? isAllowanceSheet(sheet.name) : false;

  const handleGabjiSave = useCallback((data: GabjiData) => {
    setGabjiData(data);
  }, [setGabjiData]);

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
  }, [sheets, setItems, setGabjiData, setPhotoBlocks]);

  const isCoverActive = sheet ? isCoverSheet(sheet.name) : false;
  const isItemActive  = sheet ? isItemSheet(sheet.name)  : false;

  useEffect(() => {
    if (!isAllowanceActive) return;
    void loadLaborRows();
  }, [isAllowanceActive, loadLaborRows]);

  // ── 갑지 GabjiData → 새 GabjiEditor 타입으로 변환 ─────────────
  const itemAmountsForGabji = useMemo(
    () => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, sumByCategory(items, i + 1)])),
    [items],
  );

  const gabjiEditorDoc = useMemo((): GabjiDoc => {
    // "YYYY년 M월 D일" 또는 "YYYY. M. D." → "YYYY-MM-DD"
    const parseKorDate = (s: string): string => {
      if (!s) return "";
      const flat = s.trim();
      const m1 = flat.replace(/\s/g,"").match(/(\d{4})년(\d{1,2})월(\d{1,2})일/);
      if (m1) return `${m1[1]}-${m1[2].padStart(2,"0")}-${m1[3].padStart(2,"0")}`;
      const m2 = flat.match(/(\d{4})[.\-]\s*(\d{1,2})[.\-]\s*(\d{1,2})/);
      if (m2) return `${m2[1]}-${m2[2].padStart(2,"0")}-${m2[3].padStart(2,"0")}`;
      return flat;
    };
    // "YYYY. M. D ~ YYYY. M. D" 형식 공사기간 → start/end
    const parts = (gabjiData.gongsagigan || "").split(/[~～]/);
    const startDate = parts[0] ? parseKorDate(parts[0].trim()) : "";
    const endDate   = parts[1] ? parseKorDate(parts[1].trim()) : "";
    const now = new Date();
    return {
      site_name:               gabjiData.hyeonjangmyeong || fileName || "",
      year_month:              `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`,
      construction_company:    gabjiData.constructionCompany || "",
      address:                 gabjiData.address         || "",
      project_name:            gabjiData.gongsamyeong   || "",
      representative_name:     gabjiData.representative  || "",
      client_name:             gabjiData.baljuja        || "",
      contract_amount:         parseFloat(String(gabjiData.gongsageumaek).replace(/,/g,"")) || 0,
      contract_amount_note:    "",
      start_date:              startDate,
      end_date:                endDate,
      cumulative_progress_rate:parseFloat(String(gabjiData.gongjungnyul).replace(/[^0-9.]/g,"")) || 0,
      budgeted_safety_cost:    0,
      write_date:              parseKorDate(gabjiData.signDate || ""),
      checker1_position:       "안전담당",
      checker1_name:           gabjiData.signSafety || "",
      checker2_position:       "현장소장",
      checker2_name:           gabjiData.signRep    || "",
    };
  }, [gabjiData, fileName]);

  const gabjiEditorItems = useMemo((): GNewItem[] =>
    gabjiData.items.map(gi => {
      const prev       = parseItemNum(gi.prevAmount ?? "");
      const fromItems  = itemAmountsForGabji[gi.no] ?? 0;
      const current    = fromItems > 0 ? fromItems : parseItemNum(gi.useAmount ?? "");
      return {
        item_code:      gi.no,
        item_name:      gi.label,
        prev_amount:    prev,
        current_amount: current,
        total_amount:   prev + current,
        sort_order:     gi.no,
      };
    }),
    [gabjiData.items, itemAmountsForGabji],
  );

  // Excel 갑지 셀에서 추출한 대표 폰트 크기 (GabjiPdf 렌더링에 전달)
  const gabjiValueFontSize = useMemo(() => {
    const sizes = Object.values(gabjiCellStyles)
      .map(s => (s as Record<string, string>).fontSize)
      .filter((v): v is string => Boolean(v));
    return sizes[0] ?? "";
  }, [gabjiCellStyles]);

  // ── 갑지: 항목별과 동일한 PDF 뷰어 경로(카카오 인앱은 HTML 인쇄 폴백) ──
  const handleGabjiPdfPrint = useCallback(async () => {
    try {
      if (isKakaoInAppBrowser()) {
        handlePrintActive();
        return;
      }
      const [{ pdf }, { default: GabjiPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/gabji/GabjiPdf"),
      ]);
      const blob = await pdf(
        React.createElement(
          GabjiPdf,
          { doc: gabjiEditorDoc, items: gabjiEditorItems, valueFontSize: gabjiValueFontSize },
        ) as any,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (!w) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `갑지_${fileName || "문서"}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "PDF 생성 실패");
    }
  }, [handlePrintActive, gabjiEditorDoc, gabjiEditorItems, gabjiValueFontSize, fileName]);

  /** 갑지·항목별세부내역: localStorage에 데이터 저장 */
  const handleInAppSave = useCallback(() => {
    if (!fileName) return;
    try {
      localStorage.setItem(
        `fill_data_${fileName}`,
        JSON.stringify({
          formValues,
          gabjiData,
          gabjiCellRefs,
          gabjiItemRefs,
          items,
          photoBlocks: sanitizePhotoBlocksForStorage(photoBlocks),
          savedAt: Date.now(),
        }),
      );
    } catch { /* 저장 실패 무시 */ }
    markSaved();
    setInAppSaved(true);
    setTimeout(() => setInAppSaved(false), 2200);
  }, [fileName, formValues, gabjiData, items, photoBlocks, markSaved]);

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

  const displayRows = sheet ? sheet.rows : [];
  const displayColWidths = sheet ? sheet.colWidths : [];
  const renderRangeLabel = sheet
    ? `${colLetter(sheet.renderRange.c1)}${sheet.renderRange.r1}:${colLetter(sheet.renderRange.c2)}${sheet.renderRange.r2}`
    : "";

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
        <Link href="/workspace/attendance" className={styles.pwaBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span>출결관리</span>
        </Link>
        {!isStandalone && (
          <button type="button" className={styles.pwaBtn} onClick={() => setShowPwaGuide(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/>
              <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>앱 설치</span>
          </button>
        )}
        {!!fileName && (
          <button
            type="button"
            className={styles.clearRestoreBtn}
            onClick={() => { void handleClearRestoreCache(); }}
            title="새로고침 자동복원 해제"
          >
            복원해제
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
          <button
            type="button"
            className={styles.printBtn}
            aria-label="인쇄"
            onClick={() => {
              if (isItemActive) {
                void handleItemPdfPrint();
              } else if (isCoverActive) {
                void handleGabjiPdfPrint();
              } else {
                setShowPreview(true);
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>인쇄</span>
          </button>
          <button type="button" className={styles.downloadBtn} onClick={handleDownload} aria-label="다운로드">
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
        {sheets.length === 0 && loading && (
          <div className={styles.contentLoading} role="status" aria-live="polite">
            <div className={styles.spinner} />
            <p className={styles.contentLoadingText}>엑셀을 불러오는 중…</p>
          </div>
        )}
        {!loading && sheets.length === 0 && (
          reduceMotion ? (
            <div className={styles.empty}>
              <div className={styles.emptyIconWrap}>
                <EmptySheetGlyph />
              </div>
              <p className={styles.emptyTitle}>엑셀 파일을 업로드하면<br />시트 미리보기가 표시됩니다</p>
              <p className={styles.emptyHint}>셀을 탭하면 바로 수정할 수 있어요</p>
            </div>
          ) : (
            <motion.div
              className={styles.empty}
              initial="hidden"
              animate="visible"
              variants={fillEmptyContainer}
            >
              <motion.div className={styles.emptyIconWrap} variants={fillEmptyIcon}>
                <EmptySheetGlyph />
              </motion.div>
              <motion.p className={styles.emptyTitle} variants={fillEmptyTitle}>
                엑셀 파일을 업로드하면<br />시트 미리보기가 표시됩니다
              </motion.p>
              <motion.p className={styles.emptyHint} variants={fillEmptyHint}>
                셀을 탭하면 바로 수정할 수 있어요
              </motion.p>
            </motion.div>
          )
        )}
        {sheets.length > 0 && (<>
          <div className={styles.tabsWrap}>
            <div className={styles.tabsScroll} role="tablist" aria-label="시트 목록">
              {sheets.map((s, i) => (
                <button key={i} type="button"
                  className={`${styles.tab} ${i === activeSheet ? styles.tabActive : ""}`}
                  onClick={() => { setActiveSheet(i); setSelectedCell(null); }}>
                  {s.name}
                </button>
              ))}
            </div>
            {sheet && (
              <div className={styles.tabsMeta}>
                렌더링 범위 {renderRangeLabel} · {sheet.renderRange.source === "printArea" ? "Print Area" : "Used Range"} ({displayRows.length}행)
              </div>
            )}
          </div>

          {sheet && isCoverSheet(sheet.name) ? (
            /* 새 갑지 에디터: 좌측 폼 + 우측 A4 미리보기 + DB 저장 */
            <div key={`gabji-${activeSheet}`} className={styles.viewportGabji}>
              <GabjiEditor
                key={`gabji-editor-${fileName ?? "new"}`}
                initialDoc={gabjiEditorDoc}
                initialItems={gabjiEditorItems}
                valueFontSize={gabjiValueFontSize}
              />
            </div>
          ) : sheet && isAllowanceSheet(sheet.name) ? (
            <div key={`allowance-${activeSheet}`} className={styles.viewportAllowance}>
              <LaborAllowanceSplitLayout
                rows={laborRows}
                meta={laborPdfMeta}
                loading={laborLoading}
              >
                <div className={styles.sheetDocument}>
                  <section className={styles.allowancePanel}>
                    <div className={styles.allowancePanelHead}>
                      <div>
                        <p className={styles.allowanceSub}>기존 인건비 누적/조회 기능을 유지한 전용 화면입니다.</p>
                      </div>
                      <Link className={styles.allowanceLinkBtn} href="/expense/labor">전용 화면</Link>
                    </div>

                    <div className={styles.allowanceRow}>
                      <input className={styles.allowanceInput} placeholder="이름" value={laborNewName} onChange={(e) => setLaborNewName(e.target.value)} />
                      <input className={styles.allowanceInput} type="date" value={laborNewDate} onChange={(e) => setLaborNewDate(e.target.value)} />
                      <input className={styles.allowanceInput} type="number" min={0} value={laborNewAmount} onChange={(e) => setLaborNewAmount(Number(e.target.value || 0))} />
                      <button type="button" className={styles.allowancePrimaryBtn} onClick={() => { void createLaborDoc(); }}>문서 생성</button>
                    </div>

                    <div className={styles.allowanceRow}>
                      <input className={styles.allowanceInput} placeholder="검색(이름/상태)" value={laborSearch} onChange={(e) => setLaborSearch(e.target.value)} />
                      <input className={styles.allowanceInput} type="month" value={laborMonth} onChange={(e) => setLaborMonth(e.target.value)} />
                      <input className={styles.allowanceInput} placeholder="사람 필터" value={laborPerson} onChange={(e) => setLaborPerson(e.target.value)} />
                      <button type="button" className={styles.allowanceGhostBtn} onClick={() => { void loadLaborRows(); }}>조회</button>
                    </div>

                    <div className={styles.allowanceTableWrap}>
                      <table className={styles.allowanceTable}>
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
                              <td className={styles.allowanceColNo}><Link className={styles.allowanceCellLink} href={`/expense/labor/${row.id}`}>NO.{idx + 1}</Link></td>
                              <td className={styles.allowanceColName}><Link className={styles.allowanceCellLink} href={`/expense/labor/${row.id}`}>{row.person_name}</Link></td>
                              <td className={styles.allowanceColDate}><Link className={styles.allowanceCellLink} href={`/expense/labor/${row.id}`}>{row.payment_date}</Link></td>
                              <td className={styles.allowanceColAmount}><Link className={styles.allowanceCellLink} href={`/expense/labor/${row.id}`}>{Number(row.amount ?? 0).toLocaleString()}</Link></td>
                              <td className={styles.allowanceColAttach}><Link className={styles.allowanceCellLink} href={`/expense/labor/${row.id}`}>{row.attachment_count ?? 0}건</Link></td>
                              <td><Link href={`/expense/labor/${row.id}`} className={row.status === "완료" ? styles.allowanceDone : styles.allowanceTodo}>{row.status}</Link></td>
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
                </div>
              </LaborAllowanceSplitLayout>
            </div>
          ) : sheet && isItemSheet(sheet.name) ? (
            <div key={`items-${activeSheet}`} className={styles.viewportItems}>
              <ItemListView
                items={items}
                onChange={handleItemsChange}
                onSave={handleInAppSave}
                onPrint={handleItemPdfPrint}
                saved={inAppSaved}
                title="항목별세부내역"
              />
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
                <div className={styles.photoTri}>
                  <div className={styles.photoTriTabs} role="tablist" aria-label="사진대지 패널">
                    <button
                      type="button"
                      className={`${styles.photoTriTab} ${photoPanel === "list" ? styles.photoTriTabActive : ""}`}
                      onClick={() => setPhotoPanel("list")}
                    >
                      목록
                    </button>
                    <button
                      type="button"
                      className={`${styles.photoTriTab} ${photoPanel === "edit" ? styles.photoTriTabActive : ""}`}
                      onClick={() => setPhotoPanel("edit")}
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      className={`${styles.photoTriTab} ${photoPanel === "preview" ? styles.photoTriTabActive : ""}`}
                      onClick={() => setPhotoPanel("preview")}
                    >
                      미리보기
                    </button>
                  </div>

                  <aside className={`${styles.photoTriLeft} ${photoPanel !== "list" ? styles.photoTriHideOnMobile : ""}`}>
                    <div className={styles.photoTriPaneHead}>
                      <div className={styles.photoTriPaneTitle}>블록 목록</div>
                      <div className={styles.photoTriPaneMeta}>{activePhotoBlocks.length}개</div>
                    </div>
                    <div className={styles.photoTriList} role="list">
                      {activePhotoBlocks
                        .slice()
                        .sort((a, b) => (a.sort_order ?? a.no) - (b.sort_order ?? b.no))
                        .map((b) => {
                          const isActive = b.id === (selectedPhotoBlock?.id ?? "");
                          const photoCount = Array.isArray(b.photos) ? b.photos.length : 0;
                          const label = `${b.left_label || "미지정"} / ${b.right_label || "미지정"}`;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              className={`${styles.photoTriListItem} ${isActive ? styles.photoTriListItemActive : ""}`}
                              onClick={() => {
                                setSelectedPhotoBlockId(b.id);
                                setPhotoPanel("edit");
                              }}
                              role="listitem"
                            >
                              <div className={styles.photoTriListTop}>
                                <div className={styles.photoTriListNo}>NO.{b.no}</div>
                                <div className={styles.photoTriListCount}>{photoCount}장</div>
                              </div>
                              <div className={styles.photoTriListLabel}>{label}</div>
                            </button>
                          );
                        })}
                    </div>
                  </aside>

                  <main className={`${styles.photoTriCenter} ${photoPanel !== "edit" ? styles.photoTriHideOnMobile : ""}`}>
                    <div className={styles.photoTriPaneHead}>
                      <div className={styles.photoTriPaneTitle}>
                        선택 블록 {selectedPhotoBlock ? `· NO.${selectedPhotoBlock.no}` : ""}
                      </div>
                      <div className={styles.photoTriPaneMeta}>여기서만 편집</div>
                    </div>
                    <div className={styles.photoTriCenterBody}>
                      {selectedPhotoBlock ? (
                        <PhotoBlockCard
                          block={selectedPhotoBlock}
                          availableLabels={availableLabels}
                          onSlotClick={handleSlotClick}
                          onPhotoDelete={handlePhotoDelete}
                          onMetaUpdate={handleMetaUpdate}
                        />
                      ) : (
                        <div className={styles.photoTriEmpty}>편집할 블록이 없습니다.</div>
                      )}
                    </div>
                  </main>

                  <section className={`${styles.photoTriRight} ${photoPanel !== "preview" ? styles.photoTriHideOnMobile : ""}`}>
                    <div className={styles.photoTriPaneHead}>
                      <div className={styles.photoTriPaneTitle}>A4 미리보기</div>
                      <div className={styles.photoTriPaneMeta}>현재 시트 전체</div>
                    </div>
                    <div className={styles.photoTriPreviewScroll}>
                      <PhotoSheetView
                        sheetName={sheet.name}
                        blocks={activePhotoBlocks}
                        a4Mode
                      />
                    </div>
                  </section>
                </div>
              )}
            </div>
          ) : sheet && (
            <div key={`table-${activeSheet}`} className={styles.viewport}>
              <div className={styles.sheetTableWrap}>
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
                          const ref      = toAbsoluteRef(sheet, ri, ci);
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
      <AnimatePresence>
      {showPreview && sheet && (
        <motion.div
          className={styles.previewOverlay}
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
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
                  if (isPhotoSheet(sheet.name)) {
                    setPdfLoading(true);
                    try { await handlePhotoSheetPrint(); }
                    finally { setPdfLoading(false); }
                  } else {
                    handlePrintActive();
                  }
                }}
              >
                {pdfLoading ? (
                  <>
                    <div className={styles.previewPrintSpinner} />
                    처리 중…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    인쇄
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
                  blocks={previewData.photoBlocks[sheet.name] ?? []}
                  a4Mode
                />
              </div>
            ) : isCoverSheet(sheet.name) ? (
              <PreviewSheet
                sheet={sheet}
                sheetIdx={activeSheet}
                formValues={{ ...previewData.formValues, ...previewGabjiOv }}
                formStyles={previewGabjiFs}
              />
            ) : (
              <PreviewSheet sheet={sheet} sheetIdx={activeSheet} formValues={previewData.formValues} />
            )}
            <button type="button" className={styles.previewCloseBottom} onClick={() => setShowPreview(false)}>
              닫기
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

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
              onChange={e => {
                const input = e.target;
                const f = input.files?.[0];
                if (!f) { input.value = ""; return; }
                // 갤러리 사진: Android content:// URI는 input 언마운트 후 접근 불가
                // → value 클리어 전에 FileReader로 메모리에 먼저 적재 후 처리
                const reader = new FileReader();
                reader.onload = () => {
                  input.value = "";
                  if (!reader.result) return;
                  const blob = new Blob([reader.result as ArrayBuffer], { type: f.type || "image/jpeg" });
                  handlePhotoUpload(new File([blob], f.name || "photo", { type: blob.type }));
                };
                reader.onerror = () => { input.value = ""; };
                reader.readAsArrayBuffer(f);
              }} />
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
