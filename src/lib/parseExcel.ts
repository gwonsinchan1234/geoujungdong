/**
 * 브라우저 Excel 파싱 — SheetJS(xlsx) 사용
 * ExcelJS 대비 ~5x 빠름, 번들 크기 ~1.5MB 절감
 */
import * as XLSX from "xlsx";

type CSSMap = Record<string, string>;

export type ParsedCell = {
  value:   string;
  style:   CSSMap;
  rowSpan: number;
  colSpan: number;
  skip:    boolean;
};

export type ParsedSheet = {
  name:      string;
  rows:      Array<{ height: number; cells: ParsedCell[] }>;
  colWidths: number[];
};

// ─────────────────────────────────────────────────────────────────
const SAME_LAYOUT_GROUPS: number[][] = [
  [6, 3, 4, 7],
];
// ─────────────────────────────────────────────────────────────────

function rgbToHex(rgb?: string): string | undefined {
  if (!rgb || rgb.length < 6) return undefined;
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb; // ARGB → RGB
  return `#${hex}`;
}

// wch(문자 너비) → px
function wchToPx(wch?: number): number {
  return Math.round((wch ?? 8.5) * 7.5);
}

// hpt(포인트) → px (96dpi 기준)
function hptToPx(hpt?: number): number {
  return Math.round((hpt ?? 15) * 1.333);
}

function borderStr(b?: { style?: string; color?: { rgb?: string } }): string {
  const st = b?.style;
  if (!st || st === "none") return "1px solid #d0d0d0";
  const w = st === "medium" ? "2px" : st === "thick" ? "3px" : "1px";
  return `${w} solid ${rgbToHex(b?.color?.rgb) ?? "#000"}`;
}

type XlsxStyle = {
  fill?: { patternType?: string; fgColor?: { rgb?: string }; bgColor?: { rgb?: string } };
  font?: {
    name?: string; sz?: number; bold?: boolean;
    italic?: boolean; underline?: boolean; color?: { rgb?: string };
  };
  border?: {
    top?:    { style?: string; color?: { rgb?: string } };
    bottom?: { style?: string; color?: { rgb?: string } };
    left?:   { style?: string; color?: { rgb?: string } };
    right?:  { style?: string; color?: { rgb?: string } };
  };
  alignment?: {
    horizontal?: string; vertical?: string; wrapText?: boolean;
  };
};

function extractValue(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  if (cell.t === "z" || cell.t === "e") return "";
  if (cell.w !== undefined) return cell.w; // 포맷된 문자열 우선
  if (cell.t === "d") {
    const d = cell.v instanceof Date ? cell.v : new Date(cell.v as number);
    return d.toLocaleDateString("ko-KR");
  }
  if (cell.v == null) return "";
  return String(cell.v);
}

function extractStyle(cell: XLSX.CellObject | undefined): CSSMap {
  const s: CSSMap = {
    fontFamily:      "'Calibri','Apple SD Gothic Neo',sans-serif",
    fontSize:        "11pt",
    padding:         "2px 4px",
    verticalAlign:   "bottom",
    overflow:        "hidden",
    whiteSpace:      "nowrap",
    boxSizing:       "border-box",
    borderTop:       "1px solid #d0d0d0",
    borderBottom:    "1px solid #d0d0d0",
    borderLeft:      "1px solid #d0d0d0",
    borderRight:     "1px solid #d0d0d0",
    color:           "#111827",
    backgroundColor: "#ffffff",
  };

  const st = cell?.s as XlsxStyle | undefined;
  if (!st) return s;

  const { font, fill, alignment, border } = st;

  if (font) {
    if (font.bold)      s.fontWeight     = "bold";
    if (font.italic)    s.fontStyle      = "italic";
    if (font.underline) s.textDecoration = "underline";
    if (font.sz)        s.fontSize       = `${font.sz}pt`;
    if (font.name)      s.fontFamily     = `'${font.name}','Apple SD Gothic Neo',sans-serif`;
    const fc = rgbToHex(font.color?.rgb);
    if (fc) s.color = fc;
  }

  if (fill?.patternType === "solid") {
    const bg = rgbToHex(fill.fgColor?.rgb);
    if (bg) s.backgroundColor = bg;
  }

  if (alignment) {
    if (alignment.horizontal === "center")     s.textAlign    = "center";
    else if (alignment.horizontal === "right") s.textAlign    = "right";
    else if (alignment.horizontal === "left")  s.textAlign    = "left";
    if (alignment.vertical === "middle" || alignment.vertical === "center")
      s.verticalAlign = "middle";
    else if (alignment.vertical === "top")
      s.verticalAlign = "top";
    if (alignment.wrapText) {
      s.whiteSpace = "pre-wrap";
      s.overflow   = "visible";
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

export async function parseExcelBuffer(arrayBuffer: ArrayBuffer): Promise<ParsedSheet[]> {
  // 로딩 스피너가 먼저 렌더되도록 한 프레임 양보
  await new Promise<void>(resolve => setTimeout(resolve, 0));

  const wb = XLSX.read(arrayBuffer, {
    type:       "array",
    cellStyles: true,
    cellDates:  true,
    cellNF:     true,
  });

  const sheets: ParsedSheet[] = wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) return { name, rows: [], colWidths: [] };

    const range    = XLSX.utils.decode_range(ws["!ref"]);
    const rowCount = range.e.r + 1;
    const colCount = range.e.c + 1;

    // 병합 셀
    const merges  = ws["!merges"] ?? [];
    const spanMap = new Map<string, { rowSpan: number; colSpan: number }>();
    const skipSet = new Set<string>();
    for (const m of merges) {
      spanMap.set(`${m.s.r},${m.s.c}`, {
        rowSpan: m.e.r - m.s.r + 1,
        colSpan: m.e.c - m.s.c + 1,
      });
      for (let r = m.s.r; r <= m.e.r; r++)
        for (let c = m.s.c; c <= m.e.c; c++)
          if (r !== m.s.r || c !== m.s.c) skipSet.add(`${r},${c}`);
    }

    // 열 너비
    const colWidths: number[] = [];
    for (let c = 0; c < colCount; c++)
      colWidths.push(wchToPx(ws["!cols"]?.[c]?.wch));

    // 행/셀
    const rows: ParsedSheet["rows"] = [];
    for (let r = 0; r < rowCount; r++) {
      const height = hptToPx(ws["!rows"]?.[r]?.hpt);
      const cells: ParsedCell[] = [];
      for (let c = 0; c < colCount; c++) {
        const key = `${r},${c}`;
        if (skipSet.has(key)) {
          cells.push({ value: "", style: {}, rowSpan: 1, colSpan: 1, skip: true });
          continue;
        }
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr] as XLSX.CellObject | undefined;
        const span = spanMap.get(key);
        cells.push({
          value:   extractValue(cell),
          style:   extractStyle(cell),
          rowSpan: span?.rowSpan ?? 1,
          colSpan: span?.colSpan ?? 1,
          skip:    false,
        });
      }
      rows.push({ height, cells });
    }

    return { name, rows, colWidths };
  });

  // 동일 레이아웃 그룹 — 열 너비 + 셀 개수 통일
  for (const group of SAME_LAYOUT_GROUPS) {
    const ref = sheets[group[0]];
    if (!ref) continue;
    const refColCount = ref.colWidths.length;
    for (const idx of group.slice(1)) {
      const s = sheets[idx];
      if (!s) continue;
      s.colWidths = [...ref.colWidths];
      s.rows = s.rows.map(row => {
        const cells = row.cells.slice(0, refColCount);
        while (cells.length < refColCount)
          cells.push({ value: "", style: {}, rowSpan: 1, colSpan: 1, skip: false });
        return { ...row, cells };
      });
    }
  }

  return sheets;
}
