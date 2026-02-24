import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * [이유]
 * - 브라우저에서 Supabase를 호출하는 기본 클라이언트입니다.
 * - Publishable key(=예전 anon key)만 사용합니다.
 * [배포] 빌드/프리렌더 시 env 미주입으로 createClient 실행을 지연(첫 사용 시 초기화).
 */
let _client: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseClient() as any)[prop];
  },
});
