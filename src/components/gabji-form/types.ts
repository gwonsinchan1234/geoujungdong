export interface GabjiItem {
  id: string;
  no: number;
  label: string;
  planAmount: string;  // 계획금액 (문자열 — 쉼표 포함 입력 허용)
  useAmount: string;   // 사용금액
}

export interface GabjiData {
  // 현장 기본정보
  gongsamyeong: string;    // 공사명
  hyeonjangmyeong: string; // 현장명
  gongsageumaek: string;   // 공사금액 (계약금액)
  gongsagigan: string;     // 공사기간
  baljuja: string;         // 발주자
  gongjungnyul: string;    // 공정율 (%)

  // 사용금액 항목
  items: GabjiItem[];

  // 서명
  signDate: string;     // 작성일
  signRep: string;      // 현장대리인
  signSafety: string;   // 안전관리담당자
}

export const DEFAULT_ITEMS: GabjiItem[] = [
  { id: "item-1", no: 1, label: "안전관리자 등 인건비 및 각종 업무수당 등", planAmount: "", useAmount: "" },
  { id: "item-2", no: 2, label: "안전시설비 등", planAmount: "", useAmount: "" },
  { id: "item-3", no: 3, label: "개인보호구 및 안전장구 구입비 등", planAmount: "", useAmount: "" },
  { id: "item-4", no: 4, label: "안전진단비 등", planAmount: "", useAmount: "" },
  { id: "item-5", no: 5, label: "안전보건교육비 및 행사비 등", planAmount: "", useAmount: "" },
  { id: "item-6", no: 6, label: "근로자 건강진단비 등", planAmount: "", useAmount: "" },
  { id: "item-7", no: 7, label: "건설재해예방 기술지도비", planAmount: "", useAmount: "" },
  { id: "item-8", no: 8, label: "본사 사용비", planAmount: "", useAmount: "" },
  { id: "item-9", no: 9, label: "위험성평가 등에 따른 소요비용 등", planAmount: "", useAmount: "" },
];

export function makeEmptyGabji(): GabjiData {
  return {
    gongsamyeong: "",
    hyeonjangmyeong: "",
    gongsageumaek: "",
    gongsagigan: "",
    baljuja: "",
    gongjungnyul: "",
    items: DEFAULT_ITEMS.map(i => ({ ...i })),
    signDate: "",
    signRep: "",
    signSafety: "",
  };
}

/** 숫자 파싱 (쉼표 제거) */
export function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

/** 숫자 → 천 단위 쉼표 표시 */
export function fmtWon(n: number): string {
  if (n === 0) return "0";
  return n.toLocaleString("ko-KR");
}

export function sumItems(items: GabjiItem[], field: "planAmount" | "useAmount"): number {
  return items.reduce((acc, i) => acc + parseNum(i[field]), 0);
}
