// POST /api/gabji/copy
// 이전 월 문서 → 현재 월로 복사.
// 이전 월 누계 → 당월 전월사용금액으로 이전. 당월 사용금액은 0으로 리셋.

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

export async function POST(req: NextRequest) {
  const supabase = makeClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const {
    site_name,
    from_year_month,
    to_year_month,
  }: { site_name: string; from_year_month: string; to_year_month: string } = await req.json();

  if (!site_name || !from_year_month || !to_year_month)
    return NextResponse.json({ error: "site_name, from_year_month, to_year_month 필수" }, { status: 400 });

  // 원본 문서 조회
  const { data: src, error: srcErr } = await supabase
    .from("gabji_documents")
    .select("*")
    .eq("user_id", user.id)
    .eq("site_name", site_name)
    .eq("year_month", from_year_month)
    .maybeSingle();

  if (srcErr)
    return NextResponse.json({ error: srcErr.message }, { status: 500 });
  if (!src)
    return NextResponse.json({ error: `${from_year_month} 데이터가 없습니다` }, { status: 404 });

  // 원본 항목 조회
  const { data: srcItems, error: siErr } = await supabase
    .from("gabji_items")
    .select("*")
    .eq("document_id", src.id)
    .order("sort_order");

  if (siErr)
    return NextResponse.json({ error: siErr.message }, { status: 500 });

  // 새 문서 upsert (year_month만 변경, id/timestamps 제외)
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = src;
  const { data: newDoc, error: ndErr } = await supabase
    .from("gabji_documents")
    .upsert(
      { ...rest, year_month: to_year_month, user_id: user.id },
      { onConflict: "user_id,site_name,year_month" }
    )
    .select()
    .single();

  if (ndErr || !newDoc)
    return NextResponse.json({ error: ndErr?.message ?? "복사 실패" }, { status: 500 });

  // 항목 복사: 이전 누계 → 전월까지 사용금액, 당월은 0으로 초기화
  const newItems = (srcItems ?? []).map(item => ({
    document_id:    newDoc.id,
    item_code:      item.item_code,
    item_name:      item.item_name,
    prev_amount:    item.total_amount,   // 이전 월 누계 → 전월까지 사용
    current_amount: 0,
    total_amount:   item.total_amount,
    sort_order:     item.sort_order,
  }));

  if (newItems.length > 0) {
    const { error: niErr } = await supabase
      .from("gabji_items")
      .upsert(newItems, { onConflict: "document_id,item_code" });

    if (niErr)
      return NextResponse.json({ error: niErr.message }, { status: 500 });
  }

  // 복사된 문서와 항목 반환 (클라이언트가 state 갱신에 사용)
  const { data: returnedItems } = await supabase
    .from("gabji_items")
    .select("*")
    .eq("document_id", newDoc.id)
    .order("sort_order");

  return NextResponse.json({ doc: newDoc, items: returnedItems ?? [], success: true });
}
