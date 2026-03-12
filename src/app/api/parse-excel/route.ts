import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

type CSSMap = Record<string, string>;

/** OOXML clrScheme 순서: 0=dk1, 1=lt1, 2=dk2, 3=lt2, 4–9=accent1–6 */
const OFFICE_THEME_COLORS: Record<number, [number, number, number]> = {
  0: [0x00, 0x00, 0x00], 1: [0xFF, 0xFF, 0xFF], 2: [0x44, 0x54, 0x6A], 3: [0xE7, 0xE6, 0xE6],
  4: [0x44, 0x72, 0xC4], 5: [0xED, 0x7D, 0x31], 6: [0x70, 0xAD, 0x47], 7: [0xFF, 0xC0, 0x00],
  8: [0x5B, 0x9B, 0xD5], 9: [0x26, 0x44, 0x78],
};

const EXCEL_INDEXED_COLORS: Record<number, string> = {
  0: "#000000", 1: "#ffffff", 2: "#ff0000", 3: "#00ff00", 4: "#0000ff", 5: "#ffff00",
  6: "#ff00ff", 7: "#00ffff", 8: "#800000", 9: "#008000", 10: "#000080", 11: "#808000",
  12: "#800080", 13: "#008080", 14: "#c0c0c0", 15: "#808080",
};

type ColorLike = { argb?: string; theme?: number; tint?: number; indexed?: number };

/** tint 적용: >0 → 흰색 방향, <0 → 검정 방향 */
function applyTint(base: [number, number, number], tint: number): [number, number, number] {
  return base.map(c =>
    tint >= 0
      ? Math.round(c + (255 - c) * tint)
      : Math.round(c * (1 + tint))
  ) as [number, number, number];
}

/** ExcelJS는 theme을 1-based로 줄 수 있음: 1=dk1, 2=lt1, 3=dk2, 4=lt2, 5=accent1 … */
function themeToHex(theme: number, tint = 0): string | undefined {
  const idx = theme >= 1 && theme <= 10 ? theme - 1 : theme;
  const base = OFFICE_THEME_COLORS[idx];
  if (!base) return undefined;
  const [r, g, b] = applyTint(base, tint);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function argbToHex(argb?: string): string | undefined {
  if (!argb || argb.length < 6) return undefined;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  return `#${hex}`;
}

function colorToHex(color: ColorLike | undefined): string | undefined {
  if (!color) return undefined;
  if (color.argb) return argbToHex(color.argb);
  if (color.indexed !== undefined && EXCEL_INDEXED_COLORS[color.indexed] != null)
    return EXCEL_INDEXED_COLORS[color.indexed];
  if (color.theme !== undefined) return themeToHex(color.theme, color.tint ?? 0);
  return undefined;
}

/** 배경용: dk1(검정) 무티트 → 짙은 회색. theme 0 또는 1(1-based) 처리 */
function fillColorToHex(fgColor: ColorLike | undefined): string | undefined {
  const hex = colorToHex(fgColor);
  if (!hex) return undefined;
  if (hex.toLowerCase() === "#000000") {
    const c = fgColor as ColorLike;
    if ((c?.tint == null || c?.tint === 0) && (c?.theme === 0 || c?.theme === 1)) return "#404040";
  }
  return hex;
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
  const sideColor = side?.color as ColorLike | undefined;
  return `${w} solid ${colorToHex(sideColor) ?? "#000"}`;
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
    color: "#111827",
    backgroundColor: "#ffffff",
  };

  const cellStyle = (cell as { style?: { font?: typeof cell.font; fill?: unknown; alignment?: typeof cell.alignment; border?: typeof cell.border } }).style;
  const font = cell.font ?? cellStyle?.font;
  const fill = cell.fill;
  const alignment = cell.alignment ?? cellStyle?.alignment;
  const border = cell.border;

  const hasBorder = (side: Partial<ExcelJS.Border> | undefined) => {
    const style = side?.style as string | undefined;
    return style && style !== "none";
  };

  if (font) {
    if (font.bold)      s.fontWeight = "bold";
    if (font.italic)    s.fontStyle  = "italic";
    if (font.underline) s.textDecoration = "underline";
    if (font.size)      s.fontSize = `${font.size}pt`;
    if (font.name)      s.fontFamily = `'${font.name}','Apple SD Gothic Neo',sans-serif`;
    const fontColor = font.color as ColorLike | undefined;
    const fc = colorToHex(fontColor);
    if (fc) s.color = fc;
  }

  const fillPattern = fill as {
    type?: string;
    pattern?: string;
    patternType?: string;
    fgColor?: ColorLike;
    bgColor?: ColorLike;
  } | undefined;
  const isSolid = fillPattern?.type === "pattern" && (fillPattern.patternType === "solid" || fillPattern.pattern === "solid");
  if (isSolid && fillPattern && (fillPattern.fgColor || fillPattern.bgColor)) {
    const bg = fillPattern.fgColor
      ? fillColorToHex(fillPattern.fgColor)
      : fillPattern.bgColor
        ? fillColorToHex(fillPattern.bgColor)
        : undefined;
    if (bg && bg.toLowerCase() !== "#ffffff") s.backgroundColor = bg;
  }

  if (alignment) {
    if (alignment.horizontal === "center"
     || alignment.horizontal === "centerContinuous") s.textAlign = "center";
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
    if (hasBorder(border.top)) s.borderTop = borderStr(border.top);
    if (hasBorder(border.bottom)) s.borderBottom = borderStr(border.bottom);
    if (hasBorder(border.left)) s.borderLeft = borderStr(border.left);
    if (hasBorder(border.right)) s.borderRight = borderStr(border.right);
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
          // 1행 1열(제목행) 스타일 진단 로그
          if (r === 1 && c === 1) console.log("[style-debug] r1c1 font:", JSON.stringify(cell.font), "align:", JSON.stringify(cell.alignment));
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
