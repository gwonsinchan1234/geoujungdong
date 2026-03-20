// src/app/api/photo-blocks/photos/route.ts
//
// POST   → 사진 업로드
//          · 블록 자연키(doc_id, sheet_name, no)로 upsert (photo_blocks 테이블)
//          · 슬롯 중복 방어: 서버 SELECT 검사 + DB UNIQUE(block_id,side,slot_index) 이중 방어
//          · private 버킷 업로드 + signed URL 발급 (1시간)
//
// DELETE → 사진 삭제 (Storage + block_photos)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, DEV_USER_ID } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SIGNED_URL_TTL = 3600; // 1시간
const MAX_SLOTS      = 4;    // 슬롯 0~3

// ── POST: 사진 업로드 ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const fd       = await req.formData();

    // 블록 자연키
    const docId     = String(fd.get("docId")     ?? "").trim();
    const sheetName = String(fd.get("sheetName") ?? "").trim();
    const blockNo   = Number(fd.get("blockNo")   ?? -1);

    // 블록 메타 (upsert 시 반영)
    const rightHeader = String(fd.get("rightHeader") ?? "지급/설치 사진");
    const leftDate    = String(fd.get("leftDate")    ?? "");
    const rightDate   = String(fd.get("rightDate")   ?? "");
    const leftLabel   = String(fd.get("leftLabel")   ?? "");
    const rightLabel  = String(fd.get("rightLabel")  ?? "");
    const sortOrder   = Number(fd.get("sortOrder")   ?? 0);

    // 슬롯
    const side      = String(fd.get("side")      ?? "");
    const slotIndex = Number(fd.get("slotIndex") ?? -1);
    const userId    = String(fd.get("userId")    ?? "").trim() || DEV_USER_ID;
    const file      = fd.get("file") as File | null;

    // ── 입력 검증 ──────────────────────────────────────────────────
    if (!docId || !sheetName || blockNo < 0) {
      return NextResponse.json(
        { ok: false, error: "docId / sheetName / blockNo 필요" },
        { status: 400 }
      );
    }
    if (side !== "left" && side !== "right") {
      return NextResponse.json(
        { ok: false, error: "side 는 left 또는 right" },
        { status: 400 }
      );
    }
    if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
      return NextResponse.json(
        { ok: false, error: `slotIndex 는 0~${MAX_SLOTS - 1}` },
        { status: 400 }
      );
    }
    if (!file) {
      return NextResponse.json({ ok: false, error: "file 필요" }, { status: 400 });
    }

    // ── 1. 블록 SELECT → INSERT or UPDATE (UNIQUE 제약 없이 안전하게) ──
    const { data: existingBlock } = await supabase
      .from("photo_blocks")
      .select("id")
      .eq("doc_id",     docId)
      .eq("sheet_name", sheetName)
      .eq("no",         blockNo)
      .maybeSingle();

    let blockId: string;
    if (existingBlock) {
      // 이미 있으면 메타 업데이트
      const { error: upErr } = await supabase
        .from("photo_blocks")
        .update({ right_header: rightHeader, left_date: leftDate, right_date: rightDate, left_label: leftLabel, right_label: rightLabel, sort_order: sortOrder })
        .eq("id", existingBlock.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      blockId = existingBlock.id as string;
    } else {
      // 없으면 새로 삽입 (user_id는 null — DEV_USER_ID가 auth.users에 없을 수 있음)
      const { data: inserted, error: insErr } = await supabase
        .from("photo_blocks")
        .insert({
          doc_id:       docId,
          user_id:      null,
          sheet_name:   sheetName,
          no:           blockNo,
          right_header: rightHeader,
          left_date:    leftDate,
          right_date:   rightDate,
          left_label:   leftLabel,
          right_label:  rightLabel,
          sort_order:   sortOrder,
        })
        .select("id")
        .single();
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      blockId = inserted.id as string;
    }

    // ── 2. 슬롯 중복 검증 (서버 이중 방어) ─────────────────────────
    const { data: existing } = await supabase
      .from("block_photos")
      .select("id")
      .eq("block_id",   blockId)
      .eq("side",       side)
      .eq("slot_index", slotIndex)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { ok: false, error: "이미 사진이 있는 슬롯입니다. 먼저 삭제 후 업로드하세요." },
        { status: 409 }
      );
    }

    // ── 3. private 버킷 업로드 (upsert: false → 중복 시 에러) ───────
    const storagePath = `${userId}/${blockId}/${side}/${slotIndex}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("expense-evidence")
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // ── 4. block_photos INSERT (DB UNIQUE 가 최후 방어선) ───────────
    const { data: photo, error: dbErr } = await supabase
      .from("block_photos")
      .insert({ block_id: blockId, side, slot_index: slotIndex, storage_path: storagePath })
      .select("id")
      .single();

    if (dbErr) {
      // Storage 파일 롤백
      await supabase.storage.from("expense-evidence").remove([storagePath]);
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
    }

    // ── 5. signed URL 발급 (1시간) ───────────────────────────────────
    const { data: signed } = await supabase.storage
      .from("expense-evidence")
      .createSignedUrl(storagePath, SIGNED_URL_TTL);

    return NextResponse.json({
      ok:          true,
      photoId:     photo.id     as string,
      blockId,
      storagePath,
      signedUrl:   signed?.signedUrl ?? "",
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}

// ── DELETE: 사진 삭제 ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { photoId } = await req.json() as { photoId: string };

    if (!photoId) {
      return NextResponse.json({ ok: false, error: "photoId 필요" }, { status: 400 });
    }

    const { data: photo } = await supabase
      .from("block_photos")
      .select("storage_path")
      .eq("id", photoId)
      .single();

    if (!photo) {
      return NextResponse.json({ ok: false, error: "사진 없음" }, { status: 404 });
    }

    await supabase.storage.from("expense-evidence").remove([photo.storage_path]);
    await supabase.from("block_photos").delete().eq("id", photoId);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
  }
}
