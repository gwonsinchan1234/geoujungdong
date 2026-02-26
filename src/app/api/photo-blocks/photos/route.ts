// src/app/api/photo-blocks/photos/route.ts
// POST   → 메타 저장만 (Storage 업로드는 클라이언트 직접 처리)
// DELETE → 사진 삭제 (Storage + block_photos DELETE)

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

// ── POST: 메타 저장 (클라이언트가 Storage에 직접 업로드 후 호출) ──
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

    const { blockId, side, slotIndex, storagePath } =
      await req.json() as { blockId: string; side: string; slotIndex: number; storagePath: string };

    if (!blockId || !side || slotIndex < 0 || slotIndex > 3 || !storagePath) {
      return NextResponse.json(
        { ok: false, error: "blockId / side / slotIndex / storagePath 필요" },
        { status: 400 }
      );
    }

    // 블록 소유권 확인
    const { data: block } = await supabase
      .from("photo_blocks")
      .select("id")
      .eq("id", blockId)
      .eq("user_id", user.id)
      .single();

    if (!block) return NextResponse.json({ ok: false, error: "블록 없음 또는 권한 없음" }, { status: 403 });

    // DB upsert (같은 슬롯 재업로드 시 덮어씀)
    const { error: dbErr } = await supabase
      .from("block_photos")
      .upsert({
        block_id:     blockId,
        side,
        slot_index:   slotIndex,
        storage_path: storagePath,
      }, { onConflict: "block_id,side,slot_index" });

    if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });

    // signed URL 즉시 반환 (10분)
    const { data: signed } = await supabase.storage
      .from("expense-evidence")
      .createSignedUrl(storagePath, 600);

    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? "" });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}

// ── DELETE: 사진 삭제 ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

    const { photoId } = await req.json() as { photoId: string };
    if (!photoId) return NextResponse.json({ ok: false, error: "photoId 필요" }, { status: 400 });

    // 소유권 확인 후 storage_path 가져오기
    const { data: photo } = await supabase
      .from("block_photos")
      .select("storage_path, block_id")
      .eq("id", photoId)
      .single();

    if (!photo) return NextResponse.json({ ok: false, error: "사진 없음" }, { status: 404 });

    // 블록 소유권 확인
    const { data: block } = await supabase
      .from("photo_blocks")
      .select("id")
      .eq("id", photo.block_id)
      .eq("user_id", user.id)
      .single();

    if (!block) return NextResponse.json({ ok: false, error: "권한 없음" }, { status: 403 });

    // Storage 삭제
    await supabase.storage.from("expense-evidence").remove([photo.storage_path]);

    // DB 삭제
    await supabase.from("block_photos").delete().eq("id", photoId);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}
