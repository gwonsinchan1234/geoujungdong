// [왜] slot 0~3 SSOT. 저장 = (itemId, kind, slot) 기준 upsert. 슬롯 미지정 시 빈 슬롯 0부터 자동 배정.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTemplateSpec } from "@/components/PhotoSheet/templateSpec";

export const runtime = "nodejs";

const KIND_API_TO_DB = { incoming: "inbound", install: "issue_install" } as const;
type ApiKind = keyof typeof KIND_API_TO_DB;

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const form = await req.formData();
    const itemId = String(form.get("itemId") || form.get("expenseItemId") || "").trim();
    const templateId = String(form.get("templateId") || "").trim();
    const kindRaw = String(form.get("kind") || "");
    const slotRaw = form.get("slot") != null ? String(form.get("slot")) : null;
    const file = form.get("file") as File | null;

    if (!itemId || !templateId || !kindRaw || !file) {
      return NextResponse.json(
        { ok: false, error: "필수값 누락(itemId, templateId, kind, file)" },
        { status: 400 }
      );
    }

    const spec = getTemplateSpec(templateId);
    if (!spec) {
      return NextResponse.json({ ok: false, error: "유효하지 않은 templateId입니다." }, { status: 400 });
    }

    const kind = kindRaw as ApiKind;
    if (!KIND_API_TO_DB[kind]) {
      return NextResponse.json({ ok: false, error: "kind는 incoming 또는 install 이어야 합니다." }, { status: 400 });
    }

    const kindDb = KIND_API_TO_DB[kind];
    const maxSlots = kind === "incoming" ? spec.incomingSlots : spec.installSlots;

    let slotDb: number;
    if (slotRaw !== null && slotRaw !== "") {
      const parsed = Number(slotRaw);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
        return NextResponse.json({ ok: false, error: "slot은 0~3 범위의 정수여야 합니다." }, { status: 400 });
      }
      if (parsed >= maxSlots) {
        return NextResponse.json(
          { ok: false, error: `slot은 0~${maxSlots - 1} 범위여야 합니다. (template: ${templateId})` },
          { status: 400 }
        );
      }
      slotDb = parsed;
    } else {
      const { data: existingRows } = await supabaseAdmin
        .from("expense_item_photos")
        .select("slot")
        .eq("expense_item_id", itemId)
        .eq("kind", kindDb);
      const used = new Set((existingRows ?? []).map((r) => r.slot));
      let found = -1;
      for (let s = 0; s < maxSlots; s++) {
        if (!used.has(s)) {
          found = s;
          break;
        }
      }
      if (found < 0) {
        return NextResponse.json(
          { ok: false, error: `해당 kind의 빈 슬롯이 없습니다. (0~${maxSlots - 1} 모두 사용 중)` },
          { status: 400 }
        );
      }
      slotDb = found;
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "이미지 파일만 허용됩니다." }, { status: 400 });
    }

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("expense_item_photos")
      .select("id, storage_path")
      .eq("expense_item_id", itemId)
      .eq("kind", kindDb)
      .eq("slot", slotDb)
      .maybeSingle();

    if (exErr) throw exErr;

    const safeName = file.name.replaceAll(" ", "_");
    const ext = safeName.includes(".") ? (safeName.split(".").pop() || "jpg") : "jpg";
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
    const path = `expense_items/${itemId}/${kindDb}/${slotDb}.${safeExt}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from("expense-evidence")
      .upload(path, buf, { upsert: true, contentType: file.type });

    if (upErr) throw upErr;

    const payload = {
      expense_item_id: itemId,
      template_id: templateId,
      kind: kindDb,
      slot: slotDb,
      storage_path: path,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    };

    let dbRes;
    if (existing?.id) {
      dbRes = await supabaseAdmin
        .from("expense_item_photos")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
    } else {
      dbRes = await supabaseAdmin.from("expense_item_photos").insert(payload).select("*").single();
    }

    if (dbRes.error) throw dbRes.error;

    return NextResponse.json({
      ok: true,
      photo: { ...dbRes.data, kind, slot: slotDb },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "서버 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
