/**
 * 로그인 UI·/workspace 인증 가드.
 * 임시 비활성화: NEXT_PUBLIC_DISABLE_LOGIN_UI=true (Vercel/ .env.local)
 */
export const DISABLE_LOGIN_UI =
  process.env.NEXT_PUBLIC_DISABLE_LOGIN_UI === "true";
