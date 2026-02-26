// src/app/api/photo-blocks/import/route.ts
// Excel 사진대지 시트 → photo_blocks 최초 1회 저장 (인증 불필요 — admin 클라이언트 사용)

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSupabaseAdmin, DEV_USER_ID } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const PHOTO_SHEET_KEYWORDS = ["사진대지", "보호구", "시설물", "위험성", "건강관리"];
const INSTALL_KEYWORDS = ["설치", "현장"];

type PhotoBlockRow = {
  doc_id:       string;
  user_id:      string;
  sheet_name:   string;
  no:           number;
  right_header: string;
  left_date:    string;
  right_date:   string;
  left_label:   string;
  right_label:  string;
  sort_order:   number;
};

function cellText(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getRow(row).getCell(col).value;
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map(t => t.text).join("");
    if ("result" in v)   return String((v as ExcelJS.CellFormulaValue).result ?? "");
    if ("text" in v)     return String((v as { text: unknown }).text ?? "");
    if (v instanceof Date) return v.toLocaleDateString("ko-KR");
  }
  return String(v);
}

function scanCells(ws: ExcelJS.Worksheet): Array<{ r: number; c: number; text: string }> {
  const result: Array<{ r: number; c: number; text: string }> = [];
  ws.eachRow((row, ri) => {
    row.eachCell({ includeEmpty: false }, (cell, ci) => {
      const text = cellText(ws, ri, ci).trim();
      if (text) result.push({ r: ri, c: ci, text });
    });
  });
  return result;
}

function parseNoNumber(text: string): number | null {
  const m = text.replace(/\s/g, "").toUpperCase().match(/^NO\.?(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function isDateLike(text: string): boolean {
  return /\d{2,4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/.test(text);
}

function isLabelLike(text: string): boolean {
  return text.length > 1 && /[가-힣a-zA-Z]/.test(text);
}

function parsePhotoSheet(
  ws: ExcelJS.Worksheet,
  sheetName: string,
  docId: string,
  userId: string
): PhotoBlockRow[] {
  const cells = scanCells(ws);
  const blocks: PhotoBlockRow[] = [];

  const noPositions = cells
    .map(c => ({ ...c, no: parseNoNumber(c.text) }))
    .filter(c => c.no !== null) as Array<{ r: number; c: number; text: string; no: number }>;

  for (let i = 0; i < noPositions.length; i++) {
    const noCell = noPositions[i];
    const nextNoRow = noPositions[i + 1]?.r ?? ws.rowCount + 1;
    const blockCells = cells.filter(c => c.r > noCell.r && c.r < nextNoRow);

    const rightHeaderCell = blockCells.find(c =>
      c.text.includes("지급") || INSTALL_KEYWORDS.some(k => c.text.includes(k))
    );
    const right_header = rightHeaderCell
      ? (INSTALL_KEYWORDS.some(k => rightHeaderCell.text.includes(k)) ? "현장 설치 사진" : "지급 사진")
      : "지급 사진";

    const dateCells = blockCells.filter(c => isDateLike(c.text));
    const left_date  = dateCells[0]?.text ?? "";
    const right_date = dateCells[1]?.text ?? dateCells[0]?.text ?? "";

    const labelCells = blockCells.filter(c =>
      isLabelLike(c.text) &&
      !isDateLike(c.text) &&
      parseNoNumber(c.text) === null &&
      !c.text.includes("반입") &&
      !c.text.includes("지급") &&
      !c.text.includes("설치") &&
      !c.text.includes("사진")
    );
    const left_label  = labelCells[0]?.text ?? "";
    const right_label = labelCells[1]?.text ?? labelCells[0]?.text ?? "";

    blocks.push({ doc_id: docId, user_id: userId, sheet_name: sheetName, no: noCell.no!, right_header, left_date, right_date, left_label, right_label, sort_order: i });
  }
  return blocks;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const formData = await req.formData();
    const docId    = String(formData.get("docId") ?? "").trim();
    const userId   = String(formData.get("userId") ?? DEV_USER_ID).trim();
    const file     = formData.get("file") as File | null;

    if (!docId) return NextResponse.json({ ok: false, error: "docId 필요" }, { status: 400 });
    if (!file)  return NextResponse.json({ ok: false, error: "file 필요" }, { status: 400 });

    const buf = await file.arrayBuffer();
    const wb  = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(buf) as unknown as ExcelJS.Buffer);

    const photoSheets = wb.worksheets.filter(ws =>
      PHOTO_SHEET_KEYWORDS.some(k => ws.name.includes(k))
    );

    if (!photoSheets.length) {
      return NextResponse.json({ ok: false, error: `사진대지 시트를 찾지 못했습니다.`, sheets: wb.worksheets.map(ws => ws.name) }, { status: 400 });
    }

    const allBlocks: PhotoBlockRow[] = [];
    for (const ws of photoSheets) {
      allBlocks.push(...parsePhotoSheet(ws, ws.name, docId, userId));
    }

    if (!allBlocks.length) {
      return NextResponse.json({ ok: false, error: "NO.XX 블록을 찾지 못했습니다." }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("photo_blocks")
      .select("no, sheet_name")
      .eq("doc_id", docId);

    const existingSet = new Set((existing ?? []).map(r => `${r.sheet_name}__${r.no}`));
    const toInsert = allBlocks.filter(b => !existingSet.has(`${b.sheet_name}__${b.no}`));

    if (!toInsert.length) {
      return NextResponse.json({ ok: true, saved: 0, msg: "이미 모두 저장된 블록입니다." });
    }

    const { error } = await supabase.from("photo_blocks").insert(toInsert);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, saved: toInsert.length, skipped: allBlocks.length - toInsert.length });
  } catch (e: unknown) {
    console.error("[photo-blocks/import]", e);
    return NextResponse.json({ ok: false, error: (e as Error)?.message ?? "서버 오류" }, { status: 500 });
  }
}
