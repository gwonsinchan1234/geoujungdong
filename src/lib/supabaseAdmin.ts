import { createClient } from "@supabase/supabase-js";

/** 서버 전용 admin 클라이언트 — RLS 우회, 인증 불필요 */
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** 비로그인 개발 모드용 고정 user_id */
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
