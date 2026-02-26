// src/app/api/photo-blocks/photos/route.ts
// POST   → 사진 업로드 (Storage + block_photos INSERT, 인증 불필요 — admin 클라이언트 사용)
// DELETE → 사진 삭제 (Storage + block_photos DELETE)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DEV_USER_ID } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// ── POST: 사진 업로드 (FormData: blockId, side, slotIndex, file) ──
export async function POST(req: NextRequest) {
  try {
    const supabase  = getSupabaseAdmin();
    const formData  = await req.formData();
    const blockId   = String(formData.get("blockId")   ?? "");
    const side      = String(formData.get("side")      ?? "");
    const slotIndex = Number(formData.get("slotIndex") ?? -1);
    const userId    = String(formData.get("userId")    ?? DEV_USER_ID);
    const file      = formData.get("file") as File | null;

    if (!blockId || !side || slotIndex < 0 || slotIndex > 3 || !file) {
      return NextResponse.json({ ok: false, error: "blockId / side / slotIndex / file 필요" }, { status: 400 });
    }

    const path = `${userId}/${blockId}/${side}/${slotIndex}.jpg`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: upErr } = await supabase.storage
      .from("expense-evidence")
      .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    const { error: dbErr } = await supabase
      .from("block_photos")
      .upsert({ block_id: blockId, side, slot_index: slotIndex, storage_path: path },
               { onConflict: "block_id,side,slot_index" });

    if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });

    const { data: signed } = await supabase.storage
      .from("expense-evidence")
      .createSignedUrl(path, 600);

    return NextResponse.json({ ok: true, url: signed?.signedUrl ?? "" });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}

// ── DELETE: 사진 삭제 ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { photoId } = await req.json() as { photoId: string };
    if (!photoId) return NextResponse.json({ ok: false, error: "photoId 필요" }, { status: 400 });

    const { data: photo } = await supabase
      .from("block_photos")
      .select("storage_path")
      .eq("id", photoId)
      .single();

    if (!photo) return NextResponse.json({ ok: false, error: "사진 없음" }, { status: 404 });

    await supabase.storage.from("expense-evidence").remove([photo.storage_path]);
    await supabase.from("block_photos").delete().eq("id", photoId);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}
