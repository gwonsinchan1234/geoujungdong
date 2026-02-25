// src/app/api/photo-blocks/route.ts
// GET  /api/photo-blocks?docId=xxx  → 블록 목록 + 사진 조회
// PATCH /api/photo-blocks           → 블록 메타 수정 (날짜/라벨)

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    }
  );
}

// ── GET: 블록 목록 + 사진 signed URL ─────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

    const docId = req.nextUrl.searchParams.get("docId") ?? "";
    if (!docId) return NextResponse.json({ ok: false, error: "docId 필요" }, { status: 400 });

    // 블록 조회
    const { data: blocks, error: bErr } = await supabase
      .from("photo_blocks")
      .select("*")
      .eq("doc_id", docId)
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("no",         { ascending: true });

    if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
    if (!blocks?.length) return NextResponse.json({ ok: true, blocks: [] });

    // 사진 조회
    const blockIds = blocks.map(b => b.id);
    const { data: photos, error: pErr } = await supabase
      .from("block_photos")
      .select("*")
      .in("block_id", blockIds)
      .order("slot_index", { ascending: true });

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

    // signed URL 발급 (10분)
    const photosWithUrl = await Promise.all(
      (photos ?? []).map(async (p) => {
        const { data } = await supabase.storage
          .from("expense-evidence")
          .createSignedUrl(p.storage_path, 600);
        return { ...p, url: data?.signedUrl ?? "" };
      })
    );

    // 블록에 사진 붙이기
    const blocksWithPhotos = blocks.map(b => ({
      ...b,
      photos: photosWithUrl.filter(p => p.block_id === b.id),
    }));

    return NextResponse.json({ ok: true, blocks: blocksWithPhotos });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// ── PATCH: 블록 메타 수정 ─────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

    const body = await req.json() as {
      id:           string;
      right_header?: string;
      left_date?:   string;
      right_date?:  string;
      left_label?:  string;
      right_label?: string;
    };

    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });

    const { error } = await supabase
      .from("photo_blocks")
      .update(fields)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
