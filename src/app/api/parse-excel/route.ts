import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

type CSSMap = Record<string, string>;

// Office 기본 테마(Office 2016) 색상표 — index 0~9
const OFFICE_THEME_COLORS: Record<number, [number, number, number]> = {
  0: [0xFF, 0xFF, 0xFF], // lt1  白
  1: [0x00, 0x00, 0x00], // dk1  黑
  2: [0xE7, 0xE6, 0xE6], // lt2
  3: [0x44, 0x54, 0x6A], // dk2
  4: [0x44, 0x72, 0xC4], // Accent1 파랑
  5: [0xED, 0x7D, 0x31], // Accent2 주황
  6: [0x70, 0xAD, 0x47], // Accent3 초록
  7: [0xFF, 0xC0, 0x00], // Accent4 금색
  8: [0x5B, 0x9B, 0xD5], // Accent5 하늘
  9: [0x26, 0x44, 0x78], // Accent6 짙은파랑
};

/** tint 적용: >0 → 흰색 방향, <0 → 검정 방향 */
function applyTint(base: [number, number, number], tint: number): [number, number, number] {
  return base.map(c =>
    tint >= 0
      ? Math.round(c + (255 - c) * tint)
      : Math.round(c * (1 + tint))
  ) as [number, number, number];
}

function themeToHex(theme: number, tint = 0): string | undefined {
  const base = OFFICE_THEME_COLORS[theme];
  if (!base) return undefined;
  const [r, g, b] = applyTint(base, tint);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function argbToHex(argb?: string): string | undefined {
  if (!argb || argb.length < 6) return undefined;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  return `#${hex}`;
}

/** fgColor 객체에서 hex 추출 (theme / argb 모두 지원) */
function fgColorToHex(fgColor?: { argb?: string; theme?: number; tint?: number }): string | undefined {
  if (!fgColor) return undefined;
  if (fgColor.argb) return argbToHex(fgColor.argb);
  if (fgColor.theme !== undefined) return themeToHex(fgColor.theme, fgColor.tint ?? 0);
  return undefined;
}

function excelW(w?: number): number {
  return Math.round((w ?? 8.5) * 7.5);
}

function excelH(h?: number): number {
  return Math.round((h ?? 15) * 1.333);
}

function borderStr(side?: Partial<ExcelJS.Border>): string {
  const style = side?.style as string | undefined;
  if (!style || style === "none") return "1px solid #d0d0d0";
  const w =
    style === "medium" ? "2px" : style === "thick" ? "3px" : "1px";
  return `${w} solid ${argbToHex(side?.color?.argb as string) ?? "#000"}`;
}

function extractValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v)
      return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("result" in v)
      return String((v as ExcelJS.CellFormulaValue).result ?? "");
    if (v instanceof Date) return v.toLocaleDateString("ko-KR");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
  }
  if (typeof v === "number" && cell.numFmt?.includes("#,##"))
    return v.toLocaleString("ko-KR");
  return String(v);
}

function extractStyle(cell: ExcelJS.Cell): CSSMap {
  const s: CSSMap = {
    fontFamily: "'Calibri','Apple SD Gothic Neo',sans-serif",
    fontSize: "11pt",
    padding: "2px 4px",
    verticalAlign: "bottom",
    overflow: "hidden",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    borderTop: "1px solid #d0d0d0",
    borderBottom: "1px solid #d0d0d0",
    borderLeft: "1px solid #d0d0d0",
    borderRight: "1px solid #d0d0d0",
    color: "#111827",
    backgroundColor: "#ffffff",
  };

  const { font, fill, alignment, border } = cell;

  if (font) {
    if (font.bold)      s.fontWeight = "bold";
    if (font.italic)    s.fontStyle  = "italic";
    if (font.underline) s.textDecoration = "underline";
    if (font.size)      s.fontSize = `${font.size}pt`;
    if (font.name)      s.fontFamily = `'${font.name}','Apple SD Gothic Neo',sans-serif`;
    const fc = argbToHex(font.color?.argb as string);
    if (fc) s.color = fc;
  }

  const fillPattern = fill as { type?: string; patternType?: string; fgColor?: { argb?: string; theme?: number; tint?: number } } | undefined;
  if (fillPattern?.type === "pattern" && fillPattern.patternType === "solid" && fillPattern.fgColor) {
    const bg = fgColorToHex(fillPattern.fgColor);
    if (bg) s.backgroundColor = bg;
  }

  if (alignment) {
    if (alignment.horizontal === "center")           s.textAlign = "center";
    else if (alignment.horizontal === "right")       s.textAlign = "right";
    else if (alignment.horizontal === "left")        s.textAlign = "left";
    else if (alignment.horizontal === "distributed"
          || alignment.horizontal === "justify") {
      s.textAlign     = "justify";
      s.textAlignLast = "justify";
    }
    if (String(alignment.vertical) === "middle" || String(alignment.vertical) === "center")
      s.verticalAlign = "middle";
    else if (alignment.vertical === "top")
      s.verticalAlign = "top";
    if (alignment.wrapText) {
      s.whiteSpace = "pre-wrap";
      s.overflow = "visible";
    }
  }

  if (border) {
    if (border.top)    s.borderTop    = borderStr(border.top);
    if (border.bottom) s.borderBottom = borderStr(border.bottom);
    if (border.left)   s.borderLeft   = borderStr(border.left);
    if (border.right)  s.borderRight  = borderStr(border.right);
  }

  return s;
}

// ─────────────────────────────────────────────────────────────────
// 📐 동일 레이아웃 그룹 — 여기서만 수정하세요
//    0-based 인덱스, 그룹 내 첫 번째 시트 열 너비를 나머지에 적용
// ─────────────────────────────────────────────────────────────────
const SAME_LAYOUT_GROUPS: number[][] = [
  [6, 3, 4, 7], // 사진대지: ref=6(건강관리비외,49cols) → 3(안전시설물,59cols), 4(개인보호구,99cols), 7(위험성평가,49cols)
];
// ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "파일 없음" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(arrayBuffer) as unknown as ExcelJS.Buffer);

    const sheets = wb.worksheets.map((ws) => {
      const rowCount = ws.rowCount;
      const colCount = ws.columnCount;

      const spanMap = new Map<string, { rowSpan: number; colSpan: number }>();
      const skipSet = new Set<string>();
      const merges: string[] =
        (ws as unknown as { model?: { merges?: string[] } }).model?.merges ?? [];

      for (const m of merges) {
        const [s, e] = m.split(":");
        if (!s || !e) continue;
        const sc = ws.getCell(s), ec = ws.getCell(e);
        const sr = Number(sc.row), sc2 = Number(sc.col), er = Number(ec.row), ec2 = Number(ec.col);
        spanMap.set(`${sr},${sc2}`, { rowSpan: er - sr + 1, colSpan: ec2 - sc2 + 1 });
        for (let r = sr; r <= er; r++)
          for (let c = sc2; c <= ec2; c++)
            if (r !== sr || c !== sc2) skipSet.add(`${r},${c}`);
      }

      const colWidths: number[] = [];
      for (let c = 1; c <= colCount; c++)
        colWidths.push(excelW(ws.getColumn(c).width));

      const rows = [];
      for (let r = 1; r <= rowCount; r++) {
        const wsRow = ws.getRow(r);
        const cells = [];
        for (let c = 1; c <= colCount; c++) {
          const key = `${r},${c}`;
          if (skipSet.has(key)) {
            cells.push({ value: "", style: {}, rowSpan: 1, colSpan: 1, skip: true });
            continue;
          }
          const cell = wsRow.getCell(c);
          const span = spanMap.get(key);
          cells.push({
            value:   extractValue(cell),
            style:   extractStyle(cell),
            rowSpan: span?.rowSpan ?? 1,
            colSpan: span?.colSpan ?? 1,
            skip:    false,
          });
        }
        rows.push({ height: excelH(wsRow.height ?? undefined), cells });
      }

      // ── 인쇄 영역 파싱 (e.g. "A2:H31") ────────────────────────
      let printArea: { r1: number; c1: number; r2: number; c2: number } | null = null;
      const paStr = (ws.pageSetup as { printArea?: string })?.printArea;
      if (paStr) {
        const m = paStr.split(",")[0].trim()
          .match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/);
        if (m) {
          const colIdx = (s: string) =>
            s.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
          printArea = { c1: colIdx(m[1]), r1: parseInt(m[2]), c2: colIdx(m[3]), r2: parseInt(m[4]) };
        }
      }

      return { name: ws.name, rows, colWidths, printArea };
    });

    // 동일 레이아웃 그룹 — 열 너비 + 셀 개수 동시 통일
    // 디버그: 파싱된 시트 이름/열 개수 출력
    console.log("[parse-excel] sheets:", sheets.map((s, i) => `${i}:${s.name}(${s.colWidths.length}cols)`));

    for (const group of SAME_LAYOUT_GROUPS) {
      const ref = sheets[group[0]];
      if (!ref) continue;
      const refColCount = ref.colWidths.length;

      for (const idx of group.slice(1)) {
        const s = sheets[idx];
        if (!s) continue;

        // 열 너비 통일
        s.colWidths = [...ref.colWidths];

        // 각 행의 셀 수를 기준 시트에 맞게 조정 (초과 제거 / 부족 패딩)
        s.rows = s.rows.map(row => {
          const cells = row.cells.slice(0, refColCount);
          while (cells.length < refColCount) {
            cells.push({ value: "", style: {}, rowSpan: 1, colSpan: 1, skip: false });
          }
          return { ...row, cells };
        });
      }
    }

    return NextResponse.json({ sheets });
  } catch (err) {
    console.error("[parse-excel]", err);
    return NextResponse.json({ error: "파싱 실패" }, { status: 500 });
  }
}
