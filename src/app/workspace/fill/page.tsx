"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import PhotoSheetView from "@/components/photo-sheet/PhotoSheetView";
import type { PhotoBlock, BlockPhoto, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "@/components/photo-sheet/types";
import { parseExcelBuffer } from "@/lib/parseExcel";
import type { ParsedSheet } from "@/lib/parseExcel";
import { photoDraft } from "@/lib/photoDraft";
import styles from "./page.module.css";

// ── 이미지 압축 ──────────────────────────────────────────────────
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024; // 3.5MB (Vercel 4.5MB 제한 여유)

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

function trimSheet(sheet: ParsedSheet, sheetIdx: number, formValues: Record<string, string>) {
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
      return (formValues[`${sheetIdx}__${colLetter(ci + 1)}${lastRow + 1}`] ?? c.value).trim() !== "";
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
      return (formValues[`${sheetIdx}__${colLetter(lastCol + 1)}${ri + 1}`] ?? c.value).trim() !== "";
    });
    if (has) break;
    lastCol--;
  }
  const usedCols  = lastCol + 1;
  const colWidths = sheet.colWidths.slice(0, usedCols);
  return { trimmedRows, usedCols, colWidths, rowOffset: 0, colOffset: 0 };
}

const A4_W = 680;

const PHOTO_KEYWORDS = ["사진대지", "사진", "보호구", "시설물", "위험성", "건강관리", "교육"];
const isPhotoSheet = (name: string) => PHOTO_KEYWORDS.some(k => name.includes(k));

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

  // ① 항목별세부내역 → NO → { itemNumber, date, label }
  const detailWs = wb.Sheets["항목별세부내역"];
  if (!detailWs) return {};
  const range = XLSX.utils.decode_range(detailWs["!ref"] ?? "A1");
  // key: "${itemNumber}_${no}" — 항목마다 NO가 재시작되어도 충돌 없음
  type Detail = { itemNumber: number; no: number; date: string; label: string };
  const noDetails = new Map<string, Detail>();
  let currentItem = 0;

  for (let r = range.s.r; r <= range.e.r; r++) {
    const col0 = xlsxCellStr(detailWs, r, 0);
    const m0 = col0.replace(/\s/g, "").match(/^(\d+)\./);
    if (m0) currentItem = parseInt(m0[1]);

    const col6 = xlsxCellStr(detailWs, r, 6); // 증빙번호
    const mNo = col6.replace(/\s/g, "").toUpperCase().match(/^NO\.?(\d+)$/);
    if (!mNo || currentItem === 0) continue;

    const no    = parseInt(mNo[1]);
    const date  = xlsxCellStr(detailWs, r, 1);
    const name  = xlsxCellStr(detailWs, r, 2);
    const qty   = xlsxCellStr(detailWs, r, 3);
    noDetails.set(`${currentItem}_${no}`, { itemNumber: currentItem, no, date, label: qty ? `${name} [${qty}EA]` : name });
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

  // ③ 블록 조립 (itemNumber 오름차순 → no 오름차순)
  const result: Record<string, PhotoBlock[]> = {};
  const counters = new Map<string, number>();

  for (const d of [...noDetails.values()].sort((a, b) => a.itemNumber - b.itemNumber || a.no - b.no)) {
    const sheetName = itemToSheet.get(d.itemNumber);
    if (!sheetName) continue;
    if (!result[sheetName]) result[sheetName] = [];
    const order = counters.get(sheetName) ?? 0;
    counters.set(sheetName, order + 1);
    result[sheetName].push({
      id:           `local_${sheetName}_${d.no}`,
      doc_id:       "local",
      sheet_name:   sheetName,
      no:           d.no,
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
  const totalW  = colWidths.reduce((a, b) => a + b, 0) || A4_W;
  const scale   = Math.min(1, A4_W / totalW);
  const totalH  = trimmedRows.reduce((s, r) => s + r.height, 0);
  const scaledH = Math.ceil(totalH * scale);
  return (
    <div className={styles.previewPage}>
      <div className={styles.previewPageName}>{sheet.name}</div>
      <div className={styles.previewClip} style={{ width: A4_W, height: scaledH }}>
        <div className={styles.previewWrap} style={{ transform: `scale(${scale.toFixed(4)})`, width: totalW }}>
          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", background: "#fff" }}>
            <colgroup>{colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              {trimmedRows.map((row, ri) => (
                <tr key={ri} style={{ height: row.height }}>
                  {row.cells.slice(0, usedCols).map((cell, ci) => {
                    if (cell.skip) return null;
                    const ref = `${colLetter(ci + 1 + colOffset)}${ri + 1 + rowOffset}`;
                    const ov  = formValues[`${sheetIdx}__${ref}`];
                    return (
                      <td key={ci}
                        rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                        colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                        style={cell.style as React.CSSProperties}
                        className={ov !== undefined ? styles.cellHighlight : undefined}>
                        {ov ?? cell.value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function FillPage() {
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const selectedTdRef = useRef<HTMLTableCellElement>(null);

  const [sheets,       setSheets]       = useState<ParsedSheet[]>([]);
  const [activeSheet,  setActiveSheet]  = useState(0);
  const [formValues,   setFormValues]   = useState<Record<string, string>>({});
  const [rawBuf,       setRawBuf]       = useState<ArrayBuffer | null>(null);
  const [fileName,     setFileName]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [showPreview,  setShowPreview]  = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ ri: number; ci: number } | null>(null);
  const [editingCell,  setEditingCell]  = useState<{
    ref: string; sheetIdx: number; originalValue: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

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
  const [saveToast,      setSaveToast]      = useState(false);
  const [showPwaGuide,   setShowPwaGuide]   = useState(false);
  const [isStandalone,   setIsStandalone]   = useState(true); // 기본 true → 설치 안내 숨김

  const mkKey = (sheetIdx: number, cell: string) => `${sheetIdx}__${cell.toUpperCase()}`;

  // ── PWA 설치 여부 감지 ────────────────────────────────────────────
  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

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
    // photoId 가 local_ 로 시작하지 않으면 서버에 실제 레코드가 있음
    if (!photoId.startsWith("local_")) {
      await fetch("/api/photo-blocks/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
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
    let pId  = "";    // pending photo id (밖에서 finally가 접근 가능하게)
    let pUrl = "";    // local object URL
    try {
      // 압축 → 크기 초과 시 재압축 (Vercel 4.5MB 제한 대응)
      let compressed: Blob;
      try {
        compressed = await compressImage(file, 1920, 0.8);
        if (compressed.size > MAX_UPLOAD_BYTES)
          compressed = await compressImage(file, 1280, 0.7);
        if (compressed.size > MAX_UPLOAD_BYTES)
          compressed = await compressImage(file, 960, 0.6);
      } catch {
        compressed = file;
      }

      // ① 로컬 미리보기 즉시 표시
      pUrl = URL.createObjectURL(compressed);
      pId  = `pending_${Date.now()}`;
      const pendingPhoto: BlockPhoto = { id: pId, block_id: blockId, side, slot_index: slotIndex, storage_path: "", url: pUrl };
      setPhotoBlocks(prev => {
        const next = { ...prev };
        for (const name of Object.keys(next)) {
          next[name] = next[name].map(b => b.id !== blockId ? b : { ...b, photos: [...b.photos, pendingPhoto] });
        }
        return next;
      });

      const fd = new FormData();
      fd.append("docId",       docIdRef.current);
      fd.append("sheetName",   block.sheet_name);
      fd.append("blockNo",     String(block.no));
      fd.append("rightHeader", block.right_header);
      fd.append("leftDate",    block.left_date);
      fd.append("rightDate",   block.right_date);
      fd.append("leftLabel",   block.left_label);
      fd.append("rightLabel",  block.right_label);
      fd.append("sortOrder",   String(block.sort_order));
      fd.append("side",        side);
      fd.append("slotIndex",   String(slotIndex));
      fd.append("file",        new File([compressed], "photo.jpg", { type: "image/jpeg" }));

      const res  = await fetch("/api/photo-blocks/photos", { method: "POST", body: fd });
      const json = await res.json() as { ok: boolean; photoId?: string; blockId?: string; storagePath?: string; signedUrl?: string; error?: string };

      if (!json.ok) {
        // 서버 실패 → pending 제거
        setPhotoBlocks(prev => {
          const next = { ...prev };
          for (const name of Object.keys(next)) {
            next[name] = next[name].map(b => ({ ...b, photos: b.photos.filter(p => p.id !== pId) }));
          }
          return next;
        });
        URL.revokeObjectURL(pUrl);
        pUrl = "";
        alert(`업로드 실패: ${json.error ?? "서버 오류"}`);
        return;
      }

      // ② pending → 실제 photo로 교체 (signedUrl 없으면 localUrl 유지)
      setPhotoBlocks(prev => {
        const next = { ...prev };
        for (const name of Object.keys(next)) {
          next[name] = next[name].map(b => ({
            ...b,
            photos: b.photos.map(p => p.id !== pId ? p : {
              id: json.photoId!, block_id: json.blockId!, side, slot_index: slotIndex,
              storage_path: json.storagePath!, url: json.signedUrl || pUrl,
            }),
          }));
        }
        return next;
      });
    } catch (err) {
      // 예상치 못한 에러 — 화면에 표시
      if (pId) {
        setPhotoBlocks(prev => {
          const next = { ...prev };
          for (const name of Object.keys(next)) {
            next[name] = next[name].map(b => ({ ...b, photos: b.photos.filter(p => p.id !== pId) }));
          }
          return next;
        });
      }
      if (pUrl) URL.revokeObjectURL(pUrl);
      alert(`오류: ${(err as Error)?.message ?? String(err)}`);
    } finally {
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
    return () => { document.body.style.overflow = ""; };
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
          if (cell) { setEditValue(formValues[mkKey(activeSheet, ref)] ?? ""); setEditingCell({ ref, sheetIdx: activeSheet, originalValue: cell.value }); }
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
            if (cell) { setEditValue(e.key); setEditingCell({ ref, sheetIdx: activeSheet, originalValue: cell.value }); }
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
      const parsed = await parseExcelBuffer(buf);
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

      // 항목별세부내역 기반 블록 파싱 (항상 새로 파싱 — xlsx 원본이 단일 원본)
      const freshBlocks = parsePhotoBlocksFromRaw(buf, parsed.map(s => s.name));

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

  const handlePrint = useCallback(() => {
    const win = window.open("", "_blank");
    if (!win) return;
    const sheetsHtml = sheets.map((sheet, sheetIdx) => {
      const { trimmedRows, usedCols, colWidths, rowOffset, colOffset } = trimSheet(sheet, sheetIdx, formValues);
      const totalW  = colWidths.reduce((a, b) => a + b, 0) || A4_W;
      const scale   = Math.min(1, A4_W / totalW);
      const totalH  = trimmedRows.reduce((s, r) => s + r.height, 0);
      const scaledH = Math.ceil(totalH * scale);
      const colgroup = colWidths.map(w => `<col style="width:${w}px">`).join("");
      const tbody = trimmedRows.map((row, ri) =>
        `<tr style="height:${row.height}px">${
          row.cells.slice(0, usedCols).map((cell, ci) => {
            if (cell.skip) return "";
            const ref = `${colLetter(ci + 1 + colOffset)}${ri + 1 + rowOffset}`;
            const val = (formValues[`${sheetIdx}__${ref}`] ?? cell.value)
              .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const css = Object.entries(cell.style)
              .map(([k, v]) => `${k.replace(/([A-Z])/g, c => `-${c.toLowerCase()}`)}:${v}`).join(";");
            const rs = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
            const cs = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
            return `<td${rs}${cs} style="${css}">${val}</td>`;
          }).join("")
        }</tr>`
      ).join("");
      return `<div class="sheet-page"><div class="sheet-name">${sheet.name}</div>
        <div class="clip" style="width:${A4_W}px;height:${scaledH}px">
          <div class="wrap" style="transform:scale(${scale.toFixed(4)});width:${totalW}px">
            <table><colgroup>${colgroup}</colgroup><tbody>${tbody}</tbody></table>
          </div></div></div>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${fileName||"인쇄"}</title>
<style>@page{size:A4 portrait;margin:15mm}*{box-sizing:border-box}body{margin:0;background:#fff;font-family:'Calibri','Apple SD Gothic Neo',sans-serif}
.print-btn{position:fixed;top:16px;right:16px;padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
.sheet-page{margin-bottom:16px;page-break-after:always}.sheet-page:last-child{page-break-after:avoid}
.sheet-name{font-size:10pt;font-weight:700;color:#374151;margin-bottom:6px}
.clip{overflow:hidden;position:relative}.wrap{transform-origin:top left;position:absolute;top:0;left:0}
table{border-collapse:collapse;table-layout:fixed;background:#fff}td{box-sizing:border-box}
@media print{.print-btn{display:none}}</style></head>
<body><button class="print-btn" onclick="window.print()">인쇄</button>${sheetsHtml}</body></html>`);
    win.document.close();
  }, [sheets, formValues, fileName]);

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

  const sheet       = sheets[activeSheet];
  const editedCount = Object.keys(formValues).length;
  const isPhotoActive = sheet ? isPhotoSheet(sheet.name) : false;

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

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        {!isStandalone && (
          <button type="button" className={styles.pwaBtn} onClick={() => setShowPwaGuide(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/>
              <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>앱 설치</span>
          </button>
        )}
        <label className={styles.uploadBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>업로드</span>
          <input ref={fileInputRef} type="file"
            className={styles.hiddenInput} onChange={handleFile} />
        </label>
        <div className={styles.fileArea}>
          {fileName
            ? <span className={styles.fileName}>{fileName}</span>
            : <span className={styles.filePlaceholder}>엑셀 파일을 업로드하세요</span>}
          {editedCount > 0 && <span className={styles.editBadge}>{editedCount}셀 수정됨</span>}
        </div>
        {sheets.length > 0 && (<>
          {/* 사진대지 탭 활성 시 저장 버튼 */}
          {isPhotoActive && (
            <button type="button" className={styles.saveBtn}
              onClick={handlePhotoSave} disabled={photoSaving}>
              {photoSaving
                ? <span className={styles.saveBtnSpinner} />
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
              }
              <span>{photoSaving ? "저장 중…" : "저장"}</span>
            </button>
          )}
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

          {sheet && isPhotoSheet(sheet.name) ? (
            <div className={styles.viewportPhoto}>
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
                  onSlotClick={handleSlotClick}
                  onPhotoDelete={handlePhotoDelete}
                  onMetaUpdate={handleMetaUpdate}
                />
              )}
            </div>
          ) : sheet && (
            <div className={styles.viewport}>
              <table className={styles.table}>
                <colgroup>{displayColWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <tbody>
                  {displayRows.map((row, ri) => (
                    <tr key={ri} style={{ height: row.height }}>
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
                              openSheet(ref, activeSheet, cell.value);
                            }}
                          >
                            {override ?? cell.value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}
      </div>

      {/* ── 인쇄 미리보기 모달 ── */}
      {showPreview && (
        <div className={styles.previewOverlay}>
          <div className={styles.previewHeader}>
            <span className={styles.previewTitle}>
              인쇄 미리보기 <span className={styles.previewCount}>{sheets.length}개 시트</span>
            </span>
            <div className={styles.previewHeaderActions}>
              <button type="button" className={styles.previewPrintBtn} onClick={() => window.print()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                인쇄
              </button>
              <button type="button" className={styles.previewClose} onClick={() => setShowPreview(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          <div className={styles.previewScroll} id="previewScrollContent">
            {sheets.map((s, i) =>
              isPhotoSheet(s.name) ? (
                <div key={i} className={styles.previewPhotoWrap}>
                  <PhotoSheetView
                    sheetName={s.name}
                    blocks={photoBlocks[s.name] ?? []}
                    a4Mode
                  />
                </div>
              ) : (
                <PreviewSheet key={i} sheet={s} sheetIdx={i} formValues={formValues} />
              )
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
