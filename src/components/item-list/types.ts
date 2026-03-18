export const CATEGORY_LABELS: Record<number, string> = {
  1: "안전관리자 등 인건비 및 각종 업무수당 등",
  2: "안전시설비 등",
  3: "개인보호구 및 안전장구 구입비 등",
  4: "사망사고 만인율 등 안전성과급 지급 재원",
  5: "안전진단비 등",
  6: "안전보건교육비 및 행사비 등",
  7: "근로자 건강관리비 등",
  8: "건설재해예방 기술지도비",
  9: "기타 안전관리비",
};

export const CATEGORY_SHORT: Record<number, string> = {
  1: "인건비·수당",
  2: "안전시설비",
  3: "개인보호구",
  4: "안전성과급",
  5: "안전진단비",
  6: "교육비·행사비",
  7: "건강관리비",
  8: "기술지도비",
  9: "기타",
};

export const UNIT_SUGGESTIONS = ["식", "EA", "개", "m", "m²", "kg", "롤", "장", "명", "개월", "회", "식/월"];

export interface ItemData {
  id: string;
  categoryNo: number;   // 1-9 (안전관리비 분류)
  evidenceNo: string;   // "NO.1" 등 — Excel의 증빙번호
  usageDate: string;    // 사용일자 (예: "26.01.15")
  name: string;         // 품명
  quantity: number;     // 수량
  unit: string;         // 단위
  unitPrice: number;    // 단가
  amount: number;       // 금액 (기본: quantity × unitPrice, 수동 override 가능)
  note: string;         // 비고
  hasPhoto: boolean;    // 사진대지 대상 여부
}

export function makeNewItem(categoryNo = 1): ItemData {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    categoryNo,
    evidenceNo: "",
    usageDate: "",
    name: "",
    quantity: 1,
    unit: "EA",
    unitPrice: 0,
    amount: 0,
    note: "",
    hasPhoto: true,
  };
}

export function calcAmount(q: number, up: number): number {
  return q * up;
}

/** "생명줄 [10EA]" 형식 */
export function displayLabel(item: Pick<ItemData, "name" | "quantity" | "unit">): string {
  if (!item.name) return "";
  const qty = item.quantity > 0 ? `[${item.quantity}${item.unit}]` : "";
  return qty ? `${item.name} ${qty}` : item.name;
}

export function fmtNum(n: number): string {
  if (!n && n !== 0) return "";
  return n.toLocaleString("ko-KR");
}

export function parseNum(s: string | number): number {
  if (typeof s === "number") return isNaN(s) ? 0 : s;
  const n = parseFloat(String(s).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

export function sumByCategory(items: ItemData[], catNo: number): number {
  return items.filter(i => i.categoryNo === catNo).reduce((sum, i) => sum + i.amount, 0);
}

export function grandTotal(items: ItemData[]): number {
  return items.reduce((sum, i) => sum + i.amount, 0);
}
