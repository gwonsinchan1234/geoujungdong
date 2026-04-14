export function getAnswer(question: string): string {
  const q = question.toLowerCase();

  if (q.includes("사진") || q.includes("사진대지")) {
    return `
[사진대지 기능]

1. 엑셀 업로드
2. 품목 선택
3. 사진 업로드
4. 자동 템플릿 생성

→ 현장 보고용 사진대지를 자동 생성하는 기능입니다.
`;
  }

  if (q.includes("기성")) {
    return `
[기성검증 기능]

1. 근태 CSV 업로드
2. 기성 엑셀 업로드
3. 자동 비교 분석

→ 과다청구 / 중복 / 이상 데이터를 자동 검출합니다.
`;
  }

  if (q.includes("tbm") || q.includes("작업회의")) {
    return `
[TBM 기능]

1. 작업내용 입력
2. 위험요소 자동 생성
3. 안전회의 문서 출력

→ 작업 전 필수 안전회의를 자동 생성합니다.
`;
  }

  if (q.includes("전체") || q.includes("흐름")) {
    return `
[전체 시스템 흐름]

사진 → 안전 → TBM → 기성 → 보고서 자동화
`;
  }

  return `
죄송합니다. 해당 질문은 아직 등록되지 않았습니다.

아래 중 선택해주세요:
- 사진대지
- 기성
- TBM
- 전체
`;
}
