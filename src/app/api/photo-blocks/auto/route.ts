import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin, DEV_USER_ID } from "@/lib/supabaseAdmin";
import { CATEGORY_LABELS } from "@/components/item-list/types";

export const runtime = "nodejs";

function makeClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return getSupabaseAdmin();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {},
    },
  });
}

function parseNo(text: string): number | null {
  const m = String(text ?? "").replace(/\s/g, "").toUpperCase().match(/^NO\.?(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = makeClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

    const body = (await req.json()) as { documentId?: string };
    const documentId = String(body.documentId ?? "").trim();
    if (!documentId) return NextResponse.json({ ok: false, error: "documentId 필요" }, { status: 400 });

    const { data: rows, error } = await supabase
      .from("detail_items")
      .select("*")
      .eq("document_id", documentId)
      .order("category_no", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("evidence_no", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const detail = rows ?? [];
    if (!detail.length) return NextResponse.json({ ok: true, created: 0, msg: "항목이 없습니다." });

    // 카테고리별 NO 자동부여 카운터(증빙번호가 비어있거나 파싱 실패 시)
    const catCounters = new Map<number, number>();
    const sortCounters = new Map<string, number>();

    const blocks = detail.map((r: any) => {
      const categoryNo = Number(r.category_no) || 1;
      const sheetName = `${categoryNo}. ${(CATEGORY_LABELS as any)[categoryNo] ?? ""} 사진대지`;
      const parsed = parseNo(r.evidence_no);
      const no = parsed ?? ((catCounters.get(categoryNo) ?? 0) + 1);
      if (parsed == null) catCounters.set(categoryNo, no);

      const sortOrder = sortCounters.get(sheetName) ?? 0;
      sortCounters.set(sheetName, sortOrder + 1);

      return {
        doc_id: documentId,
        user_id: user.id || DEV_USER_ID,
        sheet_name: sheetName,
        no,
        right_header: "지급 사진",
        left_date: String(r.usage_date ?? ""),
        right_date: String(r.usage_date ?? ""),
        left_label: String(r.name ?? ""),
        right_label: String(r.name ?? ""),
        sort_order: sortOrder,
      };
    });

    const { error: upErr } = await supabase
      .from("photo_blocks")
      .upsert(blocks, { onConflict: "doc_id,sheet_name,no" });

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, created: blocks.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

