import { createClient, SupabaseClient } from "@supabase/supabase-js";

const stub = new Proxy({} as SupabaseClient, {
  get() {
    throw new Error("Supabase env not set. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  },
});

/** 서버 전용 클라이언트. service_role key 없으면 anon key로 fallback. */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return stub;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** 비로그인 개발 모드용 고정 user_id */
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * 사용자 JWT 토큰으로 인증된 클라이언트 생성.
 * service_role key 없어도 RLS가 auth.uid() = user_id 로 동작함.
 */
export function getSupabaseWithToken(token: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
