// src/instrumentation.ts
/**
 * Dev 서버 부팅 크래시 방지용: Sentry instrumentation 비활성화.
 * - Next/Sentry 설정이 instrumentation.ts를 찾는 상태인데 파일이 없어 부팅 실패했음.
 * - 일단 빈 register()로 서버를 살리고, 나중에 Sentry를 정상 세팅할 때 다시 구성합니다.
 */

export async function register() {
  // intentionally empty
}
