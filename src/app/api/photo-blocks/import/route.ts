// src/app/api/photo-blocks/import/route.ts
// 항목별세부내역 → 사진대지 블록 생성 (항목별세부내역이 단일 원본)

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSupabaseAdmin, DEV_USER_ID } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const PHOTO_SHEET_KEYWORDS = ["사진대지", "사진", "보호구", "시설물", "위험성", "건강관리", "교육"];
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

// ── 셀 텍스트 추출 ──────────────────────────────────────────
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

// NO.1 / NO.10 형태 파싱
function parseNoNumber(text: string): number | null {
  const m = text.replace(/\s/g, "").toUpperCase().match(/^NO\.?(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// "2.안전시설물 사진대지" → 2
function sheetItemNumber(sheetName: string): number | null {
  const m = sheetName.match(/^(\d+)\./);
  return m ? parseInt(m[1]) : null;
}

// ── 항목별세부내역 파싱 ───────────────────────────────────────
// 반환: NO번호 → { itemNumber, date, label }
type NoDetail = { itemNumber: number; date: string; label: string };

function parseDetailSheet(wb: ExcelJS.Workbook): Map<number, NoDetail> {
  const result = new Map<number, NoDetail>();
  const ws = wb.getWorksheet("항목별세부내역");
  if (!ws) return result;

  let currentItem = 0;

  ws.eachRow((_, ri) => {
    // 1열: 항목 헤더 "2. 안전시설비 등" 감지
    const col1 = cellText(ws, ri, 1).trim();
    const headerMatch = col1.replace(/\s/g, "").match(/^(\d+)\./);
    if (headerMatch) currentItem = parseInt(headerMatch[1]);

    // 7열: 증빙번호 NO.XX
    const col7 = cellText(ws, ri, 7).trim();
    const no = parseNoNumber(col7);
    if (no === null || currentItem === 0) return;

    const date  = cellText(ws, ri, 2).trim();
    const name  = cellText(ws, ri, 3).trim();
    const qty   = cellText(ws, ri, 4).trim();
    // 수량이 있으면 "품목명 [수량EA]" 형식
    const label = qty ? `${name} [${qty}EA]` : name;

    result.set(no, { itemNumber: currentItem, date, label });
  });

  return result;
}

// ── 사진대지 시트에서 NO → right_header 매핑 (시트별 독립) ──────
// 블록 레이아웃: NO셀 바로 아래 행, NO열+4 위치에 right_header 텍스트가 있음
//   예) NO.1 at (r4, c2) → right_header at (r5, c6)
// 시트별로 분리하여 타 시트의 중복 NO가 오염하지 않도록 함
function buildRightHeaderMap(ws: ExcelJS.Worksheet): Map<number, string> {
  const noToHeader = new Map<number, string>();

  ws.eachRow((_row, ri) => {
    ws.getRow(ri).eachCell({ includeEmpty: false }, (_cell, ci) => {
      const text = cellText(ws, ri, ci).trim();
      const no = parseNoNumber(text);
      if (no === null || noToHeader.has(no)) return;

      // 바로 아래 행, 오른쪽 4번째 열 → right_header
      const headerText = cellText(ws, ri + 1, ci + 4).trim();
      noToHeader.set(
        no,
        INSTALL_KEYWORDS.some(k => headerText.includes(k)) ? "현장 설치 사진" : "지급 사진"
      );
    });
  });

  return noToHeader;
}

// ── POST 핸들러 ──────────────────────────────────────────────
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

    // 사진대지 시트 목록
    const photoSheets = wb.worksheets.filter(ws =>
      PHOTO_SHEET_KEYWORDS.some(k => ws.name.includes(k))
    );
    if (!photoSheets.length) {
      return NextResponse.json(
        { ok: false, error: "사진대지 시트를 찾지 못했습니다.", sheets: wb.worksheets.map(ws => ws.name) },
        { status: 400 }
      );
    }

    // ① 항목별세부내역 → NO별 상세 (단일 원본)
    const noDetails = parseDetailSheet(wb);
    if (!noDetails.size) {
      return NextResponse.json({ ok: false, error: "항목별세부내역에서 NO.XX 데이터를 찾지 못했습니다." }, { status: 400 });
    }

    // ② 항목번호 → (시트명, right_header맵) 매핑
    const itemToSheetName = new Map<number, string>();
    const sheetHeaderMaps = new Map<string, Map<number, string>>();
    for (const ws of photoSheets) {
      const n = sheetItemNumber(ws.name);
      if (n != null) itemToSheetName.set(n, ws.name);
      // 시트별로 독립 파싱 → 타 시트 중복 NO에 오염되지 않음
      sheetHeaderMaps.set(ws.name, buildRightHeaderMap(ws));
    }

    // ③ 항목별세부내역 기준으로 블록 생성
    const allBlocks: PhotoBlockRow[] = [];
    const sortCounters = new Map<string, number>();

    // NO 순서대로 정렬하여 처리
    for (const [no, detail] of [...noDetails.entries()].sort((a, b) => a[0] - b[0])) {
      const sheetName = itemToSheetName.get(detail.itemNumber);
      if (!sheetName) continue;  // 해당 항목의 사진대지 시트가 없으면 건너뜀

      const sortOrder = sortCounters.get(sheetName) ?? 0;
      sortCounters.set(sheetName, sortOrder + 1);

      const right_header = sheetHeaderMaps.get(sheetName)?.get(no) ?? "지급 사진";

      allBlocks.push({
        doc_id:       docId,
        user_id:      userId,
        sheet_name:   sheetName,
        no,
        right_header,
        left_date:    detail.date,
        right_date:   detail.date,   // 기본값 동일, 사용자가 수정 가능
        left_label:   detail.label,
        right_label:  detail.label,
        sort_order:   sortOrder,
      });
    }

    if (!allBlocks.length) {
      return NextResponse.json({ ok: false, error: "생성할 블록이 없습니다." }, { status: 400 });
    }

    // 이미 저장된 블록 중복 제외
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
