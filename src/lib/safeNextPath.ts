/** 로그인 후 이동: ?next= 내부 경로만 허용. 없으면 워크스페이스 fill */
export function safeNextPath(raw: string | null): string {
  const fallback = "/workspace/fill";
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("://") || raw.includes("\\")) return fallback;
  // 로그인·인트로 페이지로 루프 방지
  if (raw === "/login" || raw.startsWith("/login?") || raw === "/") return fallback;
  return raw;
}
