// src/app/api/photo-blocks/route.ts
// GET  /api/photo-blocks?docId=xxx  → 블록 목록 + 사진 조회
// PATCH /api/photo-blocks           → 블록 메타 수정 (인증 불필요 — admin 클라이언트 사용)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// ── GET: 블록 목록 + 사진 signed URL ─────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const docId = req.nextUrl.searchParams.get("docId") ?? "";
    if (!docId) return NextResponse.json({ ok: false, error: "docId 필요" }, { status: 400 });

    const { data: blocks, error: bErr } = await supabase
      .from("photo_blocks")
      .select("*")
      .eq("doc_id", docId)
      .order("sort_order", { ascending: true })
      .order("no",         { ascending: true });

    if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
    if (!blocks?.length) return NextResponse.json({ ok: true, blocks: [] });

    const blockIds = blocks.map(b => b.id);
    const { data: photos, error: pErr } = await supabase
      .from("block_photos")
      .select("*")
      .in("block_id", blockIds)
      .order("slot_index", { ascending: true });

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

    const photosWithUrl = await Promise.all(
      (photos ?? []).map(async (p) => {
        const { data } = await supabase.storage
          .from("expense-evidence")
          .createSignedUrl(p.storage_path, 600);
        return { ...p, url: data?.signedUrl ?? "" };
      })
    );

    const blocksWithPhotos = blocks.map(b => ({
      ...b,
      photos: photosWithUrl.filter(p => p.block_id === b.id),
    }));

    return NextResponse.json({ ok: true, blocks: blocksWithPhotos });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}

// ── PATCH: 블록 메타 수정 ─────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json() as {
      id:            string;
      right_header?: string;
      left_date?:    string;
      right_date?:   string;
      left_label?:   string;
      right_label?:  string;
    };

    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });

    const { error } = await supabase.from("photo_blocks").update(fields).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}
