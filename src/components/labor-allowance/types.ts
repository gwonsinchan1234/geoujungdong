/** 안전관리자 인건비 조회 행 (API / fill 페이지와 동일 스키마) */
export type LaborHistoryRow = {
  id: string;
  person_name: string;
  payment_date: string;
  amount: number;
  attachment_count: number;
  status: "미완료" | "완료";
};
