import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // env 없으면 인증 없이 통과 (빌드/배포 환경 보호)
  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // 세션 refresh (쿠키 갱신)
  const { data: { user } } = await supabase.auth.getUser();

  // /workspace/* 경로는 인증 필요 (임시 비활성화)
  // if (request.nextUrl.pathname.startsWith("/workspace") && !user) {
  //   const loginUrl = new URL("/login", request.url);
  //   loginUrl.searchParams.set("next", request.nextUrl.pathname);
  //   return NextResponse.redirect(loginUrl);
  // }

  return response;
}

export const config = {
  matcher: ["/workspace/:path*"],
};
