/**
 * 임시: 로그인 UI·/workspace 인증 리다이렉트 비활성화.
 * 다시 켤 때 false 로 변경하거나 NEXT_PUBLIC_DISABLE_LOGIN_UI=0
 */
export const DISABLE_LOGIN_UI =
  process.env.NEXT_PUBLIC_DISABLE_LOGIN_UI !== "false";
