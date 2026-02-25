// src/app/api/photo-blocks/import/route.ts
// Excel 사진대지 시트 → photo_blocks 최초 1회 저장
// 이후 편집은 앱 내부에서 처리

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import ExcelJS from "exceljs";
import { cookies } from "next/headers";

export const runtime = "nodejs";

// ── 사진대지 시트 감지 키워드 ──────────────────────────────────
const PHOTO_SHEET_KEYWORDS = ["사진대지", "보호구", "시설물", "위험성", "건강관리"];

// ── 우측 헤더 키워드 ──────────────────────────────────────────
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

// 시트 전체 텍스트 셀 스캔 (row, col, text)
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

// "NO.10" 또는 "NO 10" 같은 패턴에서 번호 추출
function parseNoNumber(text: string): number | null {
  const m = text.replace(/\s/g, "").toUpperCase().match(/^NO\.?(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// 날짜 패턴: 2025.12.22 / 2025-12-22 / 25.12.22
function isDateLike(text: string): boolean {
  return /\d{2,4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/.test(text);
}

// 항목 라벨: 텍스트 + 수량 패턴 ([20EA], 20EA 등)
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

  // NO.XX 위치 찾기
  const noPositions = cells
    .map(c => ({ ...c, no: parseNoNumber(c.text) }))
    .filter(c => c.no !== null) as Array<{ r: number; c: number; text: string; no: number }>;

  for (let i = 0; i < noPositions.length; i++) {
    const noCell = noPositions[i];
    const nextNoRow = noPositions[i + 1]?.r ?? ws.rowCount + 1;

    // 이 블록 범위 내 셀만 필터
    const blockCells = cells.filter(c => c.r > noCell.r && c.r < nextNoRow);

    // 우측 헤더 감지 ("지급 사진" / "현장 설치 사진")
    const rightHeaderCell = blockCells.find(c =>
      c.text.includes("지급") || INSTALL_KEYWORDS.some(k => c.text.includes(k))
    );
    const right_header = rightHeaderCell
      ? (INSTALL_KEYWORDS.some(k => rightHeaderCell.text.includes(k))
          ? "현장 설치 사진"
          : "지급 사진")
      : "지급 사진";

    // 날짜 셀 (블록 하단부에서 찾기)
    const dateCells = blockCells.filter(c => isDateLike(c.text));
    const left_date  = dateCells[0]?.text ?? "";
    const right_date = dateCells[1]?.text ?? dateCells[0]?.text ?? "";

    // 항목 라벨 셀 (날짜 셀 바로 아래 또는 옆)
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

    blocks.push({
      doc_id:      docId,
      user_id:     userId,
      sheet_name:  sheetName,
      no:          noCell.no!,
      right_header,
      left_date,
      right_date,
      left_label,
      right_label,
      sort_order:  i,
    });
  }

  return blocks;
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (list) => list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

    const formData = await req.formData();
    const docId = String(formData.get("docId") ?? "").trim();
    const file  = formData.get("file") as File | null;

    if (!docId) return NextResponse.json({ ok: false, error: "docId 필요" }, { status: 400 });
    if (!file)  return NextResponse.json({ ok: false, error: "file 필요" }, { status: 400 });

    const buf = await file.arrayBuffer();
    const wb  = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(buf) as unknown as ExcelJS.Buffer);

    // 사진대지 시트 감지
    const photoSheets = wb.worksheets.filter(ws =>
      PHOTO_SHEET_KEYWORDS.some(k => ws.name.includes(k))
    );

    if (!photoSheets.length) {
      return NextResponse.json({
        ok: false,
        error: `사진대지 시트를 찾지 못했습니다. 시트명에 ${PHOTO_SHEET_KEYWORDS.join("/")} 중 하나가 포함돼야 합니다.`,
        sheets: wb.worksheets.map(ws => ws.name),
      }, { status: 400 });
    }

    const allBlocks: PhotoBlockRow[] = [];
    for (const ws of photoSheets) {
      const blocks = parsePhotoSheet(ws, ws.name, docId, user.id);
      allBlocks.push(...blocks);
    }

    if (!allBlocks.length) {
      return NextResponse.json({ ok: false, error: "NO.XX 블록을 찾지 못했습니다." }, { status: 400 });
    }

    // 중복 방지: 같은 doc_id + sheet_name + no 이미 존재하면 skip
    const { data: existing } = await supabase
      .from("photo_blocks")
      .select("no, sheet_name")
      .eq("doc_id", docId);

    const existingSet = new Set(
      (existing ?? []).map(r => `${r.sheet_name}__${r.no}`)
    );

    const toInsert = allBlocks.filter(
      b => !existingSet.has(`${b.sheet_name}__${b.no}`)
    );

    if (!toInsert.length) {
      return NextResponse.json({ ok: true, saved: 0, msg: "이미 모두 저장된 블록입니다." });
    }

    const { error } = await supabase.from("photo_blocks").insert(toInsert);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok:    true,
      saved: toInsert.length,
      skipped: allBlocks.length - toInsert.length,
      msg:  `${toInsert.length}개 블록 저장 완료`,
    });
  } catch (e: any) {
    console.error("[photo-blocks/import]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
