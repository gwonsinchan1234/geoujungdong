// src/lib/excel/parseItemUsageSheet.ts
// [기술/이유]
// - xlsx(SheetJS) 기반: Next.js node runtime에서 서버 파싱하기 가장 흔한 선택
// - "항목별사용내역서" 특유의 병합셀/계/공란행을 강제로 정규화해서
//   "실사용 행"만 뽑고 NO.x를 그 순서로 맞춘다.

import * as XLSX from "xlsx";

export type ParsedUsageRow = {
  evidenceNo: number;            // NO.x (실사용 행 순번 기준)
  category: string;              // 항목(예: "2. 안전시설비 등 구매비 등")
  useDateISO: string;            // YYYY-MM-DD
  description: string;           // 사용내역(품명)
  qtyRaw: string;
  qty: number | null;
  unitPriceRaw: string;
  unitPrice: number | null;
  amountRaw: string;
  amount: number | null;
  proofNoRaw: string;            // 증빙번호(있으면)
};

type HeaderMap = {
  category: number;
  useDate: number;
  desc: number;
  qty: number;
  unitPrice: number;
  amount: number;
  proofNo: number;
};

function norm(v: unknown) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeHeaderCell(s: string) {
  const t = s.replace(/\s/g, "");
  return (
    t.includes("항목") ||
    t.includes("사용일자") ||
    t.includes("사용내역") ||
    t.includes("수량") ||
    t.includes("단가") ||
    t.includes("금액") ||
    t.includes("증빙번호")
  );
}

function toNumberOrNull(v: string): number | null {
  const cleaned = v.replace(/,/g, "").trim();
  if (!cleaned) return null;
  // 정수/실수 모두 허용하되, 최종은 number
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// "25.12.22" / "2026-01-05" / 엑셀 날짜 시리얼 모두 처리
function parseDateToISO(cell: unknown): string | null {
  if (cell == null) return null;

  // Date 객체
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, "0");
    const d = String(cell.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 숫자(엑셀 serial)
  if (typeof cell === "number" && Number.isFinite(cell)) {
    const dc = XLSX.SSF.parse_date_code(cell);
    if (!dc) return null;
    const y = dc.y;
    const m = String(dc.m).padStart(2, "0");
    const d = String(dc.d).padStart(2, "0");
    if (!y || !dc.m || !dc.d) return null;
    return `${y}-${m}-${d}`;
  }

  // 문자열
  const s = norm(cell);
  if (!s) return null;

  // 25.12.22 (yy.mm.dd)
  const m1 = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/);
  if (m1) {
    const yy = Number(m1[1]);
    const mm = Number(m1[2]);
    const dd = Number(m1[3]);
    if (!yy || !mm || !dd) return null;

    // 00~69 => 2000년대, 70~99 => 1900년대(보수적 규칙)
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
    const MM = String(mm).padStart(2, "0");
    const DD = String(dd).padStart(2, "0");
    return `${yyyy}-${MM}-${DD}`;
  }

  // 2026-01-05 / 2026.01.05
  const m2 = s.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/);
  if (m2) {
    const yyyy = Number(m2[1]);
    const mm = Number(m2[2]);
    const dd = Number(m2[3]);
    if (!yyyy || !mm || !dd) return null;
    const MM = String(mm).padStart(2, "0");
    const DD = String(dd).padStart(2, "0");
    return `${yyyy}-${MM}-${DD}`;
  }

  return null;
}

function findHeaderRow(rows: any[][]): { headerRowIndex: number; map: HeaderMap } | null {
  // 상단 40행 정도 스캔
  const limit = Math.min(rows.length, 40);

  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    const cells = row.map((c) => norm(c));
    const joined = cells.join(" | ");

    if (!cells.some((c) => looksLikeHeaderCell(c))) continue;

    const idx = (key: string) =>
      cells.findIndex((c) => c.replace(/\s/g, "") === key.replace(/\s/g, ""));

    const map: HeaderMap = {
      category: idx("항목"),
      useDate: idx("사용일자"),
      desc: idx("사용내역"),
      qty: idx("수량"),
      unitPrice: idx("단가"),
      amount: idx("금액"),
      proofNo: idx("증빙번호"),
    };

    // 핵심 3개만 맞으면 헤더로 인정(항목/사용일자/사용내역)
    if (map.category >= 0 && map.useDate >= 0 && map.desc >= 0) {
      return { headerRowIndex: r, map };
    }

    // 어떤 파일은 "사용내역" 대신 "사용 내용" 같이 다를 수 있어 fallback
    const desc2 = cells.findIndex((c) => c.replace(/\s/g, "") === "사용내용");
    if (map.category >= 0 && map.useDate >= 0 && desc2 >= 0) {
      return {
        headerRowIndex: r,
        map: { ...map, desc: desc2 },
      };
    }

    // joined로 힌트만 남김
    void joined;
  }

  return null;
}

export function parseItemUsageSheet(buffer: ArrayBuffer): ParsedUsageRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  // sheet_to_json(header:1) => 2차원 배열
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];

  const header = findHeaderRow(rows);
  if (!header) return [];

  const { headerRowIndex, map } = header;

  const out: ParsedUsageRow[] = [];
  let lastCategory = "";
  let evidenceNo = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];

    const categoryCell = norm(row[map.category]);
    const useDateCell = row[map.useDate];
    const descCell = norm(row[map.desc]);

    // 병합셀/공란: 항목은 직전 값으로 유지
    if (categoryCell) lastCategory = categoryCell;

    const useDateISO = parseDateToISO(useDateCell);

    // ✅ 실사용 행 판정: 날짜 파싱 가능 + 사용내역 존재 + "계" 제외
    if (!useDateISO) continue;
    if (!descCell) continue;
    if (descCell === "계") continue;

    const qtyRaw = norm(row[map.qty]);
    const unitPriceRaw = norm(row[map.unitPrice]);
    const amountRaw = norm(row[map.amount]);
    const proofNoRaw = norm(row[map.proofNo]);

    evidenceNo += 1;

    out.push({
      evidenceNo,
      category: lastCategory || "",
      useDateISO,
      description: descCell,
      qtyRaw,
      qty: toNumberOrNull(qtyRaw),
      unitPriceRaw,
      unitPrice: toNumberOrNull(unitPriceRaw),
      amountRaw,
      amount: toNumberOrNull(amountRaw),
      proofNoRaw,
    });
  }

  return out;
}
