/**
 * 브라우저 Excel 파싱 — ExcelJS 사용 (호환성·스타일 1순위)
 * 색상: xlsx 내부 theme1.xml을 직접 읽어 해당 파일의 테마로 해석 (근본 해결)
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";

type CSSMap = Record<string, string>;

export type ParsedCell = {
  value:   string;
  style:   CSSMap;
  rowSpan: number;
  colSpan: number;
  skip:    boolean;
};

export type ParsedSheet = {
  name:       string;
  rows:       Array<{ height: number | null; cells: ParsedCell[] }>;
  colWidths:  number[];
  printArea?: { r1: number; c1: number; r2: number; c2: number } | null;
  zoomScale:  number; // Excel 시트 뷰 확대/축소 (기본 100)
};

// ─────────────────────────────────────────────────────────────────
const SAME_LAYOUT_GROUPS: number[][] = [
  [6, 3, 4, 7],
];
// ─────────────────────────────────────────────────────────────────

/** OOXML clrScheme 순서: 0=dk1, 1=lt1, 2=dk2, 3=lt2, 4–9=accent1–6 (헤더=dk2, 합계=accent1+tint) */
const OFFICE_THEME_COLORS: Record<number, [number, number, number]> = {
  0: [0x00, 0x00, 0x00], 1: [0xff, 0xff, 0xff], 2: [0x44, 0x54, 0x6a], 3: [0xe7, 0xe6, 0xe6],
  4: [0x44, 0x72, 0xc4], 5: [0xed, 0x7d, 0x31], 6: [0x70, 0xad, 0x47], 7: [0xff, 0xc0, 0x00],
  8: [0x5b, 0x9b, 0xd5], 9: [0x26, 0x44, 0x78],
};

/** Excel 인덱스 색상(0~15) — 배경/폰트에서 indexed만 있을 때 사용 */
const EXCEL_INDEXED_COLORS: Record<number, string> = {
  0: "#000000", 1: "#ffffff", 2: "#ff0000", 3: "#00ff00", 4: "#0000ff", 5: "#ffff00",
  6: "#ff00ff", 7: "#00ffff", 8: "#800000", 9: "#008000", 10: "#000080", 11: "#808000",
  12: "#800080", 13: "#008080", 14: "#c0c0c0", 15: "#808080",
};

const THEME_TAG_ORDER = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];

type ThemeColorMap = Record<number, [number, number, number]>;

function parseThemeXmlToMap(xml: string): ThemeColorMap | undefined {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const scheme = doc.getElementsByTagName("a:clrScheme")[0] ?? doc.getElementsByTagName("clrScheme")[0];
    if (!scheme) return undefined;
    const out: ThemeColorMap = {};
    THEME_TAG_ORDER.forEach((tag, i) => {
      const el = scheme.getElementsByTagName(`a:${tag}`)[0] ?? scheme.getElementsByTagName(tag)[0];
      if (!el) return;
      const srgb = el.getElementsByTagName("a:srgbClr")[0] ?? el.getElementsByTagName("srgbClr")[0];
      const sys = el.getElementsByTagName("a:sysClr")[0] ?? el.getElementsByTagName("sysClr")[0];
      const hex = srgb?.getAttribute("val") ?? sys?.getAttribute("lastClr");
      if (hex && /^[0-9A-Fa-f]{6}$/.test(hex)) {
        out[i] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
      }
    });
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

/** xlsx는 zip이므로 압축을 풀어 해당 파일의 theme1.xml만 읽어 테마 색 추출 (ExcelJS가 안 주는 실제 테마) */
async function getThemeColorsFromXlsxBuffer(buffer: ArrayBuffer): Promise<ThemeColorMap | undefined> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const path = "xl/theme/theme1.xml";
    const entry = zip.file(path) ?? zip.file("theme1.xml");
    if (!entry) return undefined;
    const xml = await entry.async("string");
    return parseThemeXmlToMap(xml);
  } catch {
    return undefined;
  }
}

/** ExcelJS 워크북에 테마가 남아 있으면 보조로 사용 (일부 환경에서만 존재) */
function getWorkbookThemeColors(wb: ExcelJS.Workbook): ThemeColorMap | undefined {
  const raw = (wb as unknown as { _themes?: { theme1?: string }; model?: { themes?: { theme1?: string } } })._themes?.theme1
    ?? (wb as unknown as { model?: { themes?: { theme1?: string } } }).model?.themes?.theme1;
  if (typeof raw !== "string" || !raw) return undefined;
  return parseThemeXmlToMap(raw);
}

function applyTint(base: [number, number, number], tint: number): [number, number, number] {
  return base.map((c) =>
    tint >= 0 ? Math.round(c + (255 - c) * tint) : Math.round(c * (1 + tint))
  ) as [number, number, number];
}

/** ExcelJS는 theme을 1-based로 줄 수 있음: 1=dk1, 2=lt1, 3=dk2, 4=lt2, 5=accent1 … */
function themeToHex(theme: number, tint = 0, themeMap?: ThemeColorMap): string | undefined {
  const idx = theme >= 1 && theme <= 10 ? theme - 1 : theme;
  const base = themeMap?.[idx] ?? OFFICE_THEME_COLORS[idx];
  if (!base) return undefined;
  const [r, g, b] = applyTint(base, tint);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function argbToHex(argb?: string): string | undefined {
  if (!argb || argb.length < 6) return undefined;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  return `#${hex}`;
}

type ColorLike = { argb?: string; theme?: number; tint?: number; indexed?: number };

function colorToHex(color: ColorLike | undefined, themeMap?: ThemeColorMap): string | undefined {
  if (!color) return undefined;
  if (color.argb) return argbToHex(color.argb);
  if (color.indexed !== undefined && EXCEL_INDEXED_COLORS[color.indexed] != null)
    return EXCEL_INDEXED_COLORS[color.indexed];
  if (color.theme !== undefined) return themeToHex(color.theme, color.tint ?? 0, themeMap);
  return undefined;
}

/** 배경용: dk1(검정) 무티트면 짙은 회색으로 완화. theme 0 또는 1(1-based) 모두 처리 */
function fillColorToHex(fgColor: ColorLike | undefined, themeMap?: ThemeColorMap): string | undefined {
  const hex = colorToHex(fgColor, themeMap);
  if (!hex) return undefined;
  if (hex.toLowerCase() === "#000000") {
    const c = fgColor as ColorLike;
    const noTint = c?.tint == null || c?.tint === 0;
    if (noTint && (c?.theme === 0 || c?.theme === 1)) return "#404040";
  }
  return hex;
}

/** #rrggbb 기준 밝기 (0~255). 이 값이 낮으면 어두운 색 */
function luminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return 255;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function fgColorToHex(fgColor?: ColorLike): string | undefined {
  return colorToHex(fgColor);
}

function excelW(w?: number): number {
  return Math.round((w ?? 8.5) * 7.5);
}

function excelH(h?: number): number | null {
  if (h === undefined || h === null || h <= 0) return null;
  return Math.round(h * 1.333);
}

function borderStr(side?: Partial<ExcelJS.Border>, themeMap?: ThemeColorMap): string {
  const style = side?.style as string | undefined;
  if (!style || style === "none") return "1px solid #d0d0d0";
  const w = style === "medium" ? "2px" : style === "thick" ? "3px" : "1px";
  const sideColor = side?.color as ColorLike | undefined;
  return `${w} solid ${colorToHex(sideColor, themeMap) ?? "#000"}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

function extractValue(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v)
      return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("result" in v) {
      const res = (v as ExcelJS.CellFormulaValue).result;
      if (typeof res === "number") return formatNumber(res);
      if (res instanceof Date) return res.toLocaleDateString("ko-KR");
      return String(res ?? "");
    }
    if (v instanceof Date) return v.toLocaleDateString("ko-KR");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
  }
  if (typeof v === "number") return formatNumber(v);
  if (typeof v === "object") return "";
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return formatNumber(parseFloat(s));
  return String(v);
}

function extractStyle(cell: ExcelJS.Cell, themeMap?: ThemeColorMap): CSSMap {
  const s: CSSMap = {
    fontFamily: "'Calibri','Apple SD Gothic Neo',sans-serif",
    fontSize: "11pt",
    lineHeight: "1",
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
  const fill = cell.fill ?? cellStyle?.fill;
  const alignment = cell.alignment ?? cellStyle?.alignment;
  // border는 셀에 직접 달린 경우가 있고, 공유 스타일(xf)로 cell.style에만 있는 경우가 있음
  const directBorder = cell.border;
  const fallbackBorder = cellStyle?.border;
  const border = directBorder ?? fallbackBorder;

  const hasBorder = (side: Partial<ExcelJS.Border> | undefined) => {
    const style = side?.style as string | undefined;
    return style && style !== "none";
  };

  if (font) {
    if (font.bold) s.fontWeight = "bold";
    if (font.italic) s.fontStyle = "italic";
    if (font.underline) s.textDecoration = "underline";
    if (font.size) s.fontSize = `${font.size}pt`;
    if (font.name) s.fontFamily = `'${font.name}','Apple SD Gothic Neo',sans-serif`;
    const fontColor = font.color as ColorLike | undefined;
    const fc = colorToHex(fontColor, themeMap);
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
      ? fillColorToHex(fillPattern.fgColor, themeMap)
      : fillPattern.bgColor
        ? fillColorToHex(fillPattern.bgColor, themeMap)
        : undefined;
    const minLuminance = 70;
    if (bg && bg.toLowerCase() !== "#ffffff" && luminance(bg) >= minLuminance) s.backgroundColor = bg;
  }

  if (alignment) {
    if (
      alignment.horizontal === "center" ||
      alignment.horizontal === "centerContinuous"
    )
      s.textAlign = "center";
    else if (alignment.horizontal === "right") s.textAlign = "right";
    else if (alignment.horizontal === "left") s.textAlign = "left";
    else if (
      alignment.horizontal === "distributed" ||
      alignment.horizontal === "justify"
    ) {
      s.textAlign = "justify";
      s.textAlignLast = "justify";
    }
    if (
      String(alignment.vertical) === "middle" ||
      String(alignment.vertical) === "center"
    )
      s.verticalAlign = "middle";
    else if (alignment.vertical === "top") s.verticalAlign = "top";
    if (alignment.wrapText) {
      s.whiteSpace = "pre-wrap";
      s.overflow = "visible";
    }
  }

  // directBorder가 없을 때만 fallbackBorder를 적용해 과도한 기본 테두리 적용을 방지
  const shouldUseFallback =
    !directBorder &&
    !!fallbackBorder &&
    (hasBorder(fallbackBorder.top) ||
      hasBorder(fallbackBorder.bottom) ||
      hasBorder(fallbackBorder.left) ||
      hasBorder(fallbackBorder.right));

  const b = directBorder ?? (shouldUseFallback ? fallbackBorder : undefined);
  if (b) {
    if (hasBorder(b.top)) s.borderTop = borderStr(b.top, themeMap);
    if (hasBorder(b.bottom)) s.borderBottom = borderStr(b.bottom, themeMap);
    if (hasBorder(b.left)) s.borderLeft = borderStr(b.left, themeMap);
    if (hasBorder(b.right)) s.borderRight = borderStr(b.right, themeMap);
  }

  return s;
}

function extractBorderOnly(cell: ExcelJS.Cell, themeMap?: ThemeColorMap): Partial<CSSMap> {
  const out: Partial<CSSMap> = {};
  const cellStyle = (cell as { style?: { border?: typeof cell.border } }).style;
  const directBorder = cell.border;
  const fallbackBorder = cellStyle?.border;

  const hasBorder = (side: Partial<ExcelJS.Border> | undefined) => {
    const style = side?.style as string | undefined;
    return style && style !== "none";
  };

  const shouldUseFallback =
    !directBorder &&
    !!fallbackBorder &&
    (hasBorder(fallbackBorder.top) ||
      hasBorder(fallbackBorder.bottom) ||
      hasBorder(fallbackBorder.left) ||
      hasBorder(fallbackBorder.right));

  const b = directBorder ?? (shouldUseFallback ? fallbackBorder : undefined);
  if (!b) return out;
  if (hasBorder(b.top)) out.borderTop = borderStr(b.top, themeMap);
  if (hasBorder(b.bottom)) out.borderBottom = borderStr(b.bottom, themeMap);
  if (hasBorder(b.left)) out.borderLeft = borderStr(b.left, themeMap);
  if (hasBorder(b.right)) out.borderRight = borderStr(b.right, themeMap);
  return out;
}

function mirrorNeighborBorders(rows: ParsedSheet["rows"]) {
  // 인접 셀의 border 정보를 서로 보완해서 끊김을 최소화
  // (양쪽 다 없는 경우는 그대로 둠 — 과도 적용 방지)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c];
      if (!cell || cell.skip) continue;
      const s = cell.style as CSSMap;

      // right <- neighbor.left
      const right = row.cells[c + 1];
      if (right && !right.skip) {
        const rs = right.style as CSSMap;
        if (!s.borderRight && rs.borderLeft) s.borderRight = rs.borderLeft;
        if (!rs.borderLeft && s.borderRight) rs.borderLeft = s.borderRight;
      }

      // bottom <- neighbor.top
      const downRow = rows[r + 1];
      const down = downRow?.cells?.[c];
      if (down && !down.skip) {
        const ds = down.style as CSSMap;
        if (!s.borderBottom && ds.borderTop) s.borderBottom = ds.borderTop;
        if (!ds.borderTop && s.borderBottom) ds.borderTop = s.borderBottom;
      }
    }
  }
}

export async function parseExcelBuffer(arrayBuffer: ArrayBuffer): Promise<ParsedSheet[]> {
  await new Promise<void>((r) => setTimeout(r, 0));

  const themeMap =
    (await getThemeColorsFromXlsxBuffer(arrayBuffer)) ?? null;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(arrayBuffer) as unknown as ExcelJS.Buffer);
  const themeMapResolved = themeMap ?? getWorkbookThemeColors(wb);

  const sheets: ParsedSheet[] = wb.worksheets.map((ws) => {
    const rowCount = ws.rowCount ?? 0;
    const colCount = ws.columnCount ?? 0;

    const spanMap = new Map<string, { rowSpan: number; colSpan: number }>();
    const skipSet = new Set<string>();
    const anchorOf = new Map<string, string>(); // "r,c" -> "sr,sc"
    const mergeEdgeBorders = new Map<string, Partial<CSSMap>>(); // anchorKey -> edge border styles
    const merges: string[] =
      (ws as unknown as { model?: { merges?: string[] } }).model?.merges ?? [];

    for (const m of merges) {
      const [start, end] = m.split(":");
      if (!start || !end) continue;
      try {
        const sc = ws.getCell(start);
        const ec = ws.getCell(end);
        const sr = Number(sc.row);
        const scCol = Number(sc.col);
        const er = Number(ec.row);
        const ecCol = Number(ec.col);
        const anchorKey = `${sr},${scCol}`;
        spanMap.set(anchorKey, { rowSpan: er - sr + 1, colSpan: ecCol - scCol + 1 });
        for (let r = sr; r <= er; r++)
          for (let c = scCol; c <= ecCol; c++)
            if (r !== sr || c !== scCol) {
              const k = `${r},${c}`;
              skipSet.add(k);
              anchorOf.set(k, anchorKey);
            }
      } catch {
        // ignore invalid merge
      }
    }

    const colWidths: number[] = [];
    for (let c = 1; c <= colCount; c++) {
      colWidths.push(excelW(ws.getColumn(c).width));
    }

    const rows: ParsedSheet["rows"] = [];
    for (let r = 1; r <= rowCount; r++) {
      const wsRow = ws.getRow(r);
      const cells: ParsedCell[] = [];
      for (let c = 1; c <= colCount; c++) {
        const key = `${r},${c}`;
        if (skipSet.has(key)) {
          // 병합셀의 가장자리 테두리가 숨겨진 셀에만 있는 경우 → 앵커로 합치기
          const anchorKey = anchorOf.get(key);
          if (anchorKey) {
            const span = spanMap.get(anchorKey);
            if (span) {
              const [arStr, acStr] = anchorKey.split(",");
              const ar = Number(arStr);
              const ac = Number(acStr);
              const rEnd = ar + span.rowSpan - 1;
              const cEnd = ac + span.colSpan - 1;
              const br = extractBorderOnly(wsRow.getCell(c), themeMapResolved);
              if (Object.keys(br).length) {
                const edge = mergeEdgeBorders.get(anchorKey) ?? {};
                if (r === ar && br.borderTop) edge.borderTop = br.borderTop;
                if (r === rEnd && br.borderBottom) edge.borderBottom = br.borderBottom;
                if (c === ac && br.borderLeft) edge.borderLeft = br.borderLeft;
                if (c === cEnd && br.borderRight) edge.borderRight = br.borderRight;
                mergeEdgeBorders.set(anchorKey, edge);
              }
            }
          }
          cells.push({ value: "", style: {}, rowSpan: 1, colSpan: 1, skip: true });
          continue;
        }
        const cell = wsRow.getCell(c);
        const span = spanMap.get(key);
        const style = extractStyle(cell, themeMapResolved);
        const edge = mergeEdgeBorders.get(key);
        if (edge) {
          if (edge.borderTop && !style.borderTop) style.borderTop = edge.borderTop;
          if (edge.borderBottom && !style.borderBottom) style.borderBottom = edge.borderBottom;
          if (edge.borderLeft && !style.borderLeft) style.borderLeft = edge.borderLeft;
          if (edge.borderRight && !style.borderRight) style.borderRight = edge.borderRight;
        }
        cells.push({
          value: extractValue(cell),
          style,
          rowSpan: span?.rowSpan ?? 1,
          colSpan: span?.colSpan ?? 1,
          skip: false,
        });
      }
      rows.push({
        height: excelH(wsRow.height ?? undefined),
        cells,
      });
    }

    // 테이블/범위 스타일에서 한쪽 셀에만 저장된 border 보정
    mirrorNeighborBorders(rows);

    let printArea: ParsedSheet["printArea"] = null;
    const paStr = (ws.pageSetup as { printArea?: string })?.printArea;
    if (paStr) {
      const first = paStr.split(",")[0].trim();
      const pm = first.match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/);
      if (pm) {
        const colIdx = (s: string) =>
          s.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
        printArea = {
          c1: colIdx(pm[1]),
          r1: parseInt(pm[2], 10),
          c2: colIdx(pm[3]),
          r2: parseInt(pm[4], 10),
        };
      }
    }

    const views = ws.views as Array<{ zoomScale?: number; zoomScaleNormal?: number }>;
    const zoomScale = views?.[0]?.zoomScale ?? views?.[0]?.zoomScaleNormal ?? 100;

    return { name: ws.name, rows, colWidths, printArea, zoomScale };
  });

  for (const group of SAME_LAYOUT_GROUPS) {
    const ref = sheets[group[0]];
    if (!ref) continue;
    const refColCount = ref.colWidths.length;
    for (const idx of group.slice(1)) {
      const s = sheets[idx];
      if (!s) continue;
      s.colWidths = [...ref.colWidths];
      s.rows = s.rows.map((row) => {
        const cells = row.cells.slice(0, refColCount);
        while (cells.length < refColCount)
          cells.push({ value: "", style: {}, rowSpan: 1, colSpan: 1, skip: false });
        return { ...row, cells };
      });
    }
  }

  return sheets;
}
