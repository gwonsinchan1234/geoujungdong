// ── 갑지 문서 (gabji_documents 테이블 대응) ─────────────────────
export interface GabjiDoc {
  id?: string;
  user_id?: string;

  // DB 유니크 식별자
  site_name: string;               // 현장명 (DB 키용, 화면에 미표시)
  year_month: string;              // "YYYY-MM" 작성기준월

  // 상단 기본정보
  construction_company: string;    // 건설업체명
  address: string;                 // 소재지
  project_name: string;            // 공사명
  representative_name: string;     // 대표자
  client_name: string;             // 발주자
  contract_amount: number;         // 공사금액
  contract_amount_note: string;    // 공사금액 부기 예: "VAT 포함"
  start_date: string;              // 공사기간 시작 "YYYY-MM-DD"
  end_date: string;                // 공사기간 종료 "YYYY-MM-DD"
  cumulative_progress_rate: number;// 누계공정율(%)
  budgeted_safety_cost: number;    // 계산된 안전관리비

  // 하단 서명부
  write_date: string;              // 작성일 "YYYY-MM-DD"
  checker1_position: string;       // 확인자1 직책
  checker1_name: string;           // 확인자1 성명
  checker2_position: string;       // 확인자2 직책
  checker2_name: string;           // 확인자2 성명
}

// ── 갑지 항목 (gabji_items 테이블 대응) ─────────────────────────
export interface GabjiItem {
  id?: string;
  document_id?: string;
  item_code: number;               // 1~9
  item_name: string;
  prev_amount: number;             // 전월 사용누계
  current_amount: number;          // 금월 사용금액
  total_amount: number;            // 누계 사용금액 = prev + current
  sort_order: number;
}

// ── 9개 표준 항목명 ──────────────────────────────────────────────
export const ITEM_NAMES: Record<number, string> = {
  1: "안전관리자 등 인건비 및 각종 업무수당 등",
  2: "안전시설비 등",
  3: "개인보호구 및 안전장구 구입비 등",
  4: "안전진단비 등",
  5: "안전보건교육비 및 행사비 등",
  6: "근로자 건강진단비 등",
  7: "건설재해예방 기술지도비",
  8: "본사 사용비",
  9: "위험성평가 등에 따른 소요비용 등",
};

export function makeDefaultItems(): GabjiItem[] {
  return Array.from({ length: 9 }, (_, i) => ({
    item_code: i + 1,
    item_name: ITEM_NAMES[i + 1],
    prev_amount: 0,
    current_amount: 0,
    total_amount: 0,
    sort_order: i + 1,
  }));
}

export function makeEmptyDoc(): GabjiDoc {
  const now = new Date();
  return {
    site_name: "",
    year_month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    construction_company: "",
    address: "",
    project_name: "",
    representative_name: "",
    client_name: "",
    contract_amount: 0,
    contract_amount_note: "VAT 포함",
    start_date: "",
    end_date: "",
    cumulative_progress_rate: 0,
    budgeted_safety_cost: 0,
    write_date: now.toISOString().slice(0, 10),
    checker1_position: "안전담당",
    checker1_name: "",
    checker2_position: "현장소장",
    checker2_name: "",
  };
}

// ── 유틸리티 ────────────────────────────────────────────────────

/** 숫자 → 천 단위 쉼표 (0이면 빈 문자열) */
export function fmtWon(n: number | null | undefined): string {
  if (!n || isNaN(n)) return "";
  return Math.round(n).toLocaleString("ko-KR");
}

/** 숫자 → 천 단위 쉼표 (0이면 "0" 반환, 미리보기 합계 행용) */
export function fmtWonOrZero(n: number | null | undefined): string {
  if (!n || isNaN(n)) return "0";
  return Math.round(n).toLocaleString("ko-KR");
}

/** 문자열 → 숫자 파싱 */
export function parseNum(s: string | number): number {
  if (typeof s === "number") return isNaN(s) ? 0 : s;
  const n = parseFloat(String(s).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

/** 항목 합계 계산 */
export function calcTotals(items: GabjiItem[]) {
  const prevTotal = items.reduce((s, i) => s + (i.prev_amount || 0), 0);
  const currTotal = items.reduce((s, i) => s + (i.current_amount || 0), 0);
  return { prevTotal, currTotal, total: prevTotal + currTotal };
}

/** 이전 월 "YYYY-MM" */
export function prevYearMonth(ym: string): string {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}
