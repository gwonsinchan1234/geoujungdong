import { createClient, SupabaseClient } from "@supabase/supabase-js";

const stub = new Proxy({} as SupabaseClient, {
  get() {
    throw new Error("Supabase env not set. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  },
});

/** 서버 전용 admin 클라이언트. 빌드 시 env 없으면 createClient 호출 안 함. */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return stub;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 비로그인 개발 모드용 고정 user_id */
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
