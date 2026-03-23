// src/app/api/photo-blocks/photos/route.ts
//
// POST   → 사진 업로드
//          · 클라이언트가 Authorization: Bearer <access_token> 헤더를 전달하면
//            해당 JWT로 인증된 Supabase 클라이언트를 생성해 RLS를 통과시킨다.
//          · 토큰이 없으면 getSupabaseAdmin() fallback (service_role 또는 anon)
//          · 블록 자연키(doc_id, sheet_name, no)로 upsert (photo_blocks 테이블)
//          · 슬롯 재업로드 처리: 기존 block_photos 레코드를 먼저 DELETE 후 INSERT
//
// DELETE → 사진 삭제 (Storage + block_photos)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, DEV_USER_ID } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SIGNED_URL_TTL = 3600; // 1시간
const MAX_SLOTS      = 4;    // 슬롯 0~3

// ── 인증된 Supabase 클라이언트 생성 ──────────────────────────────
function makeSupabaseClient(userToken: string) {
  if (userToken) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      return createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${userToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }
  return getSupabaseAdmin();
}

// ── POST: 사진 업로드 ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Authorization: Bearer <token> 헤더에서 사용자 JWT 추출
    const authHeader = req.headers.get("authorization") ?? "";
    const userToken  = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const supabase   = makeSupabaseClient(userToken);

    const fd         = await req.formData();

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

    // ── 1. 블록 SELECT → INSERT or UPDATE ──────────────────────────
    const { data: existingBlock } = await supabase
      .from("photo_blocks")
      .select("id")
      .eq("doc_id",     docId)
      .eq("sheet_name", sheetName)
      .eq("no",         blockNo)
      .maybeSingle();

    let blockId: string;
    if (existingBlock) {
      const { error: upErr } = await supabase
        .from("photo_blocks")
        .update({ right_header: rightHeader, left_date: leftDate, right_date: rightDate, left_label: leftLabel, right_label: rightLabel, sort_order: sortOrder })
        .eq("id", existingBlock.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      blockId = existingBlock.id as string;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("photo_blocks")
        .insert({
          doc_id:       docId,
          user_id:      userId || null,
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

    // ── 2. 기존 block_photos 삭제 (재업로드 시 UNIQUE 충돌 방지) ───
    //      기존 Storage 파일도 함께 제거
    const { data: oldPhoto } = await supabase
      .from("block_photos")
      .select("id, storage_path")
      .eq("block_id",   blockId)
      .eq("side",       side)
      .eq("slot_index", slotIndex)
      .maybeSingle();

    if (oldPhoto) {
      if (oldPhoto.storage_path) {
        await supabase.storage.from("expense-evidence").remove([oldPhoto.storage_path]);
      }
      await supabase.from("block_photos").delete().eq("id", oldPhoto.id);
    }

    // ── 3. private 버킷 업로드 ──────────────────────────────────────
    const storagePath = `${userId}/${blockId}/${side}/${slotIndex}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("expense-evidence")
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: "image/jpeg",
        upsert: true, // 혹시 남은 파일이 있어도 덮어쓰기
      });

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // ── 4. block_photos INSERT ────────────────────────────────────────
    const { data: photo, error: dbErr } = await supabase
      .from("block_photos")
      .insert({ block_id: blockId, side, slot_index: slotIndex, storage_path: storagePath })
      .select("id")
      .single();

    if (dbErr) {
      await supabase.storage.from("expense-evidence").remove([storagePath]);
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
    }

    // ── 5. signed URL 발급 (1시간) ────────────────────────────────────
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
    const authHeader = req.headers.get("authorization") ?? "";
    const userToken  = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const supabase   = makeSupabaseClient(userToken);

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
