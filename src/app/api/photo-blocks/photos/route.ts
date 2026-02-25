// src/app/api/photo-blocks/photos/route.ts
// POST   → 사진 업로드 (Storage + block_photos INSERT)
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

// ── POST: 사진 업로드 ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

    const formData  = await req.formData();
    const blockId   = String(formData.get("blockId")   ?? "");
    const side      = String(formData.get("side")      ?? "");   // 'left' | 'right'
    const slotIndex = Number(formData.get("slotIndex") ?? -1);
    const file      = formData.get("file") as File | null;

    if (!blockId || !side || slotIndex < 0 || slotIndex > 3 || !file) {
      return NextResponse.json({ ok: false, error: "blockId / side / slotIndex / file 필요" }, { status: 400 });
    }

    // 블록 소유권 확인
    const { data: block } = await supabase
      .from("photo_blocks")
      .select("id")
      .eq("id", blockId)
      .eq("user_id", user.id)
      .single();

    if (!block) return NextResponse.json({ ok: false, error: "블록 없음 또는 권한 없음" }, { status: 403 });

    // Storage 경로: {userId}/{blockId}/{side}/{slotIndex}.{ext}
    const ext  = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/${blockId}/${side}/${slotIndex}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from("expense-evidence")
      .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    // DB upsert (같은 슬롯 재업로드 시 덮어씀)
    const { error: dbErr } = await supabase
      .from("block_photos")
      .upsert({
        block_id:     blockId,
        side,
        slot_index:   slotIndex,
        storage_path: path,
      }, { onConflict: "block_id,side,slot_index" });

    if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });

    // signed URL 즉시 반환 (10분)
    const { data: signed } = await supabase.storage
      .from("expense-evidence")
      .createSignedUrl(path, 600);

    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? "" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
