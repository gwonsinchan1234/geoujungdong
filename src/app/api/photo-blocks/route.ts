// src/app/api/photo-blocks/route.ts
//
// GET   /api/photo-blocks?docId=xxx  → 블록 목록 + 사진 signed URL 조회
// POST  /api/photo-blocks            → 블록 upsert (자연키: doc_id, sheet_name, no)
//                                      메타데이터 최종 저장용 (클라이언트 "저장" 버튼)
// PATCH /api/photo-blocks            → 블록 메타 수정 (by id, 하위 호환용)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DEV_USER_ID } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SIGNED_URL_TTL = 3600; // 1시간

// ── GET: 블록 목록 + 사진 signed URL ─────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const docId    = req.nextUrl.searchParams.get("docId") ?? "";
    if (!docId) {
      return NextResponse.json({ ok: false, error: "docId 필요" }, { status: 400 });
    }

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
          .createSignedUrl(p.storage_path, SIGNED_URL_TTL);
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

// ── POST: 블록 upsert (자연키: doc_id, sheet_name, no) ────────────
// 클라이언트 "저장" 버튼 → 메타데이터를 서버에 최종 반영
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body     = await req.json() as {
      doc_id:        string;
      user_id?:      string;
      sheet_name:    string;
      no:            number;
      right_header?: string;
      left_date?:    string;
      right_date?:   string;
      left_label?:   string;
      right_label?:  string;
      sort_order?:   number;
    };

    const { doc_id, sheet_name, no } = body;
    if (!doc_id || !sheet_name || no == null) {
      return NextResponse.json(
        { ok: false, error: "doc_id / sheet_name / no 필요" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("photo_blocks")
      .upsert(
        {
          doc_id,
          user_id:      body.user_id     ?? DEV_USER_ID,
          sheet_name,
          no,
          right_header: body.right_header ?? "지급/설치 사진",
          left_date:    body.left_date    ?? "",
          right_date:   body.right_date   ?? "",
          left_label:   body.left_label   ?? "",
          right_label:  body.right_label  ?? "",
          sort_order:   body.sort_order   ?? 0,
        },
        { onConflict: "doc_id,sheet_name,no" }
      )
      .select("id")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, blockId: data.id });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}

// ── PATCH: 블록 메타 수정 (by id, 하위 호환용) ─────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body     = await req.json() as {
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
