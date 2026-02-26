"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import PhotoSheetView from "@/components/photo-sheet/PhotoSheetView";
import type { PhotoBlock, OnSlotClick, OnPhotoDelete, OnMetaUpdate } from "@/components/photo-sheet/types";
import { parseExcelBuffer } from "@/lib/parseExcel";
import type { ParsedCell, ParsedSheet } from "@/lib/parseExcel";
import styles from "./page.module.css";

// 이미지 압축: 최대 maxPx, JPEG quality
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
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error("compress failed")),
        "image/jpeg",
        quality
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
  return { trimmedRows, usedCols, colWidths };
}

const A4_W = 680;

const PHOTO_KEYWORDS = ["사진대지", "보호구", "시설물", "위험성", "건강관리"];
const isPhotoSheet = (name: string) => PHOTO_KEYWORDS.some(k => name.includes(k));

function PreviewSheet({
  sheet, sheetIdx, formValues,
}: { sheet: ParsedSheet; sheetIdx: number; formValues: Record<string, string> }) {
  const { trimmedRows, usedCols, colWidths } = trimSheet(sheet, sheetIdx, formValues);
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
                    const ref = `${colLetter(ci + 1)}${ri + 1}`;
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
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const selectedTdRef  = useRef<HTMLTableCellElement>(null);

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

  // 사진대지
  const docIdRef    = useRef<string>("");
  const [photoBlocks, setPhotoBlocks] = useState<Record<string, PhotoBlock[]>>({});
  const [photoSlot,   setPhotoSlot]   = useState<{
    blockId: string; side: "left" | "right"; slotIndex: number;
  } | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const mkKey = (sheetIdx: number, cell: string) => `${sheetIdx}__${cell.toUpperCase()}`;

  const fetchPhotoBlocks = useCallback(async (id: string) => {
    const res  = await fetch(`/api/photo-blocks?docId=${id}`);
    const json = await res.json();
    if (!json.ok) return;
    const grouped: Record<string, PhotoBlock[]> = {};
    for (const block of json.blocks as PhotoBlock[]) {
      if (!grouped[block.sheet_name]) grouped[block.sheet_name] = [];
      grouped[block.sheet_name].push(block);
    }
    setPhotoBlocks(grouped);
  }, []);

  const handleSlotClick: OnSlotClick = useCallback((blockId, side, slotIndex) => {
    setPhotoSlot({ blockId, side, slotIndex });
  }, []);

  const handlePhotoDelete: OnPhotoDelete = useCallback(async (photoId) => {
    await fetch("/api/photo-blocks/photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId }),
    });
    await fetchPhotoBlocks(docIdRef.current);
  }, [fetchPhotoBlocks]);

  const handleMetaUpdate: OnMetaUpdate = useCallback(async (blockId, fields) => {
    const res  = await fetch("/api/photo-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: blockId, ...fields }),
    });
    const json = await res.json();
    if (json.ok) await fetchPhotoBlocks(docIdRef.current);
  }, [fetchPhotoBlocks]);

  const handlePhotoUpload = useCallback(async (file: File) => {
    if (!photoSlot) return;
    const { blockId, side, slotIndex } = photoSlot;
    setPhotoSlot(null);
    setPhotoUploading(true);
    try {
      // 1. 압축 (1920px, JPEG 0.8)
      const compressed = await compressImage(file, 1920, 0.8);

      // 2. 사용자 확인
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인 필요");

      // 3. Supabase Storage 직접 업로드
      const path = `${user.id}/${blockId}/${side}/${slotIndex}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("expense-evidence")
        .upload(path, compressed, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;

      // 4. 서버에 메타만 저장
      const res  = await fetch("/api/photo-blocks/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId, side, slotIndex, storagePath: path }),
      });
      const json = await res.json();
      if (json.ok) await fetchPhotoBlocks(docIdRef.current);
    } finally {
      setPhotoUploading(false);
    }
  }, [photoSlot, fetchPhotoBlocks]);

  // 바텀시트 포커스 + 배경 스크롤 잠금
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

      // Ctrl+PageDown/Up: 시트 전환
      if (e.ctrlKey && e.key === "PageDown") {
        e.preventDefault();
        setActiveSheet(p => Math.min(p + 1, sheets.length - 1));
        setSelectedCell(null);
        return;
      }
      if (e.ctrlKey && e.key === "PageUp") {
        e.preventDefault();
        setActiveSheet(p => Math.max(p - 1, 0));
        setSelectedCell(null);
        return;
      }

      if (!selectedCell) return;
      let { ri, ci } = selectedCell;
      const rows = sheet.rows;
      const maxCol = sheet.colWidths.length - 1;

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

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault(); ci = findNextCol(ci, 1); break;
        case "ArrowLeft":
          e.preventDefault(); ci = findNextCol(ci, -1); break;
        case "ArrowDown":
          e.preventDefault(); ri = findNextRow(ri, 1); break;
        case "ArrowUp":
          e.preventDefault(); ri = findNextRow(ri, -1); break;
        case "Tab":
          e.preventDefault();
          ci = findNextCol(ci, e.shiftKey ? -1 : 1);
          break;
        case "Enter":
          e.preventDefault(); ri = findNextRow(ri, 1); break;
        case "Escape":
          e.preventDefault(); setSelectedCell(null); return;
        case "F2": {
          e.preventDefault();
          const ref  = `${colLetter(ci + 1)}${ri + 1}`;
          const cell = rows[ri]?.cells[ci];
          if (cell) { setEditValue(formValues[mkKey(activeSheet, ref)] ?? ""); setEditingCell({ ref, sheetIdx: activeSheet, originalValue: cell.value }); }
          return;
        }
        case "Delete":
        case "Backspace": {
          e.preventDefault();
          const key = mkKey(activeSheet, `${colLetter(ci + 1)}${ri + 1}`);
          setFormValues(p => { const n = { ...p }; delete n[key]; return n; });
          return;
        }
        default:
          // 일반 문자 입력 → 바텀시트 열고 해당 문자로 시작
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const ref  = `${colLetter(ci + 1)}${ri + 1}`;
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

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      setRawBuf(buf); setFileName(file.name);
      const parsed = await parseExcelBuffer(buf);
      setSheets(parsed); setActiveSheet(0); setFormValues({}); setSelectedCell(null);
      setPhotoBlocks({});

      // 사진대지 시트가 있으면 photo_blocks 저장/복원
      const hasPhoto = parsed.some((s: ParsedSheet) => isPhotoSheet(s.name));
      if (hasPhoto) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const lsKey       = `photoDocId_${file.name}`;
          const savedDocId  = localStorage.getItem(lsKey);

          if (savedDocId) {
            // 이미 저장된 docId → 블록만 다시 조회
            docIdRef.current = savedDocId;
            await fetchPhotoBlocks(savedDocId);
          } else {
            // 최초 업로드 → import 후 localStorage에 저장
            const newDocId = crypto.randomUUID();
            docIdRef.current = newDocId;
            const pfd = new FormData();
            pfd.append("docId", newDocId);
            pfd.append("file",  file);
            const pres  = await fetch("/api/photo-blocks/import", { method: "POST", body: pfd });
            const pjson = await pres.json();
            if (pjson.ok) {
              localStorage.setItem(lsKey, newDocId);
              await fetchPhotoBlocks(newDocId);
            }
          }
        }
      }
    } catch (err) { console.error(err); alert("엑셀 파일을 읽는 중 오류가 났습니다."); }
    finally { setLoading(false); }
  }, []);

  const handlePrint = useCallback(() => {
    const win = window.open("", "_blank");
    if (!win) return;
    const sheetsHtml = sheets.map((sheet, sheetIdx) => {
      const { trimmedRows, usedCols, colWidths } = trimSheet(sheet, sheetIdx, formValues);
      const totalW  = colWidths.reduce((a, b) => a + b, 0) || A4_W;
      const scale   = Math.min(1, A4_W / totalW);
      const totalH  = trimmedRows.reduce((s, r) => s + r.height, 0);
      const scaledH = Math.ceil(totalH * scale);
      const colgroup = colWidths.map(w => `<col style="width:${w}px">`).join("");
      const tbody = trimmedRows.map((row, ri) =>
        `<tr style="height:${row.height}px">${
          row.cells.slice(0, usedCols).map((cell, ci) => {
            if (cell.skip) return "";
            const ref = `${colLetter(ci + 1)}${ri + 1}`;
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

  return (
    <div className={styles.page}>

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <label className={styles.uploadBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>업로드</span>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
            className={styles.hiddenInput} onChange={handleFile} />
        </label>
        <div className={styles.fileArea}>
          {fileName
            ? <span className={styles.fileName}>{fileName}</span>
            : <span className={styles.filePlaceholder}>엑셀 파일을 업로드하세요</span>}
          {editedCount > 0 && <span className={styles.editBadge}>{editedCount}셀 수정됨</span>}
        </div>
        {sheets.length > 0 && (<>
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
          </div>
          {sheet && isPhotoSheet(sheet.name) ? (
            <div className={styles.viewport}>
              {photoUploading && (
                <div className={styles.overlay}>
                  <div className={styles.spinner} /><span>사진 업로드 중…</span>
                </div>
              )}
              <PhotoSheetView
                sheetName={sheet.name}
                blocks={photoBlocks[sheet.name] ?? []}
                onSlotClick={handleSlotClick}
                onPhotoDelete={handlePhotoDelete}
                onMetaUpdate={handleMetaUpdate}
              />
            </div>
          ) : sheet && (
            <div className={styles.viewport}>
              <table className={styles.table}>
                <colgroup>{sheet.colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <tbody>
                  {sheet.rows.map((row, ri) => (
                    <tr key={ri} style={{ height: row.height }}>
                      {row.cells.map((cell, ci) => {
                        if (cell.skip) return null;
                        const ref      = `${colLetter(ci + 1)}${ri + 1}`;
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

    </div>
  );
}
