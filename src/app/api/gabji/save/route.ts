// POST /api/gabji/save
// 문서 + 항목 upsert. 현장명+월+user_id 기준으로 중복 시 덮어씀.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { GabjiDoc, GabjiItem } from "@/components/gabji/types";

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

  const { doc, items }: { doc: GabjiDoc; items: GabjiItem[] } = await req.json();

  if (!doc.site_name || !doc.year_month)
    return NextResponse.json({ error: "현장명, 작성기준월 필수" }, { status: 400 });

  // id 없이 upsert: user_id+site_name+year_month 유니크 키 기준
  const { id: _id, user_id: _uid, ...docFields } = doc;

  const { data: saved, error: docErr } = await supabase
    .from("gabji_documents")
    .upsert(
      { ...docFields, user_id: user.id },
      { onConflict: "user_id,site_name,year_month" }
    )
    .select()
    .single();

  if (docErr || !saved)
    return NextResponse.json({ error: docErr?.message ?? "문서 저장 실패" }, { status: 500 });

  // 항목 upsert: document_id+item_code 유니크 키 기준
  const itemRows = items.map(item => ({
    document_id:    saved.id,
    item_code:      item.item_code,
    item_name:      item.item_name,
    prev_amount:    item.prev_amount    || 0,
    current_amount: item.current_amount || 0,
    total_amount:   (item.prev_amount || 0) + (item.current_amount || 0),
    sort_order:     item.sort_order     || item.item_code,
    // id는 전달 시만 포함 (기존 행 업데이트용)
    ...(item.id ? { id: item.id } : {}),
  }));

  const { error: itemsErr } = await supabase
    .from("gabji_items")
    .upsert(itemRows, { onConflict: "document_id,item_code" });

  if (itemsErr)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  return NextResponse.json({ doc: saved, success: true });
}
