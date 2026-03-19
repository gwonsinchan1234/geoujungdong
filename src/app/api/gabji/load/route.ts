// GET /api/gabji/load?site_name=&year_month=YYYY-MM
// 해당 현장+월 문서와 항목을 조회한다.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function makeClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return getSupabaseAdmin();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll() {},
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const site_name  = searchParams.get("site_name")?.trim()  ?? "";
  const year_month = searchParams.get("year_month")?.trim() ?? "";

  if (!site_name || !year_month)
    return NextResponse.json({ error: "site_name, year_month 필수" }, { status: 400 });

  const supabase = makeClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  // 문서 조회
  const { data: doc, error: docErr } = await supabase
    .from("gabji_documents")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_name", site_name)
    .eq("year_month", year_month)
    .maybeSingle();

  if (docErr)
    return NextResponse.json({ error: docErr.message }, { status: 500 });

  if (!doc)
    return NextResponse.json({ doc: null, items: [] }); // 신규 문서

  // 항목 조회
  const { data: items, error: itemsErr } = await supabase
    .from("gabji_items")
    .select("*")
    .eq("document_id", doc.id)
    .order("sort_order");

  if (itemsErr)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  return NextResponse.json({ doc, items: items ?? [] });
}
