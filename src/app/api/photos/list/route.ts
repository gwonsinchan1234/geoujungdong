// [왜] slot 0~3 SSOT. grouped[slot] = url.
// 500 방지: env 검사, itemId 안전 추출, 테이블/컬럼 없으면 200+빈 데이터 반환, signedUrl 실패 시 해당 행만 url null.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTemplateSpec, DEFAULT_TEMPLATE_ID } from "@/components/PhotoSheet/templateSpec";

export const runtime = "nodejs";

const KIND_DB_TO_API: Record<string, string> = { inbound: "incoming", issue_install: "install" };

const EMPTY_GROUPED = {
  incoming: [null, null, null, null] as (string | null)[],
  install: [null, null, null, null] as (string | null)[],
};

function getItemIdFromRequest(req: Request): string {
  try {
    const url = req.url ?? "";
    const searchParams = new URL(url, "http://localhost").searchParams;
    const id =
      searchParams.get("itemId") ??
      searchParams.get("expenseItemId") ??
      "";
    return String(id).trim();
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const itemId = getItemIdFromRequest(req);
    if (!itemId) {
      return NextResponse.json(
        { ok: false, error: "itemId(또는 expenseItemId) 쿼리 파라미터가 필요합니다." },
        { status: 400 }
      );
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl?.trim() || !supabaseKey?.trim()) {
      console.error("[photos/list] Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return NextResponse.json(
        { ok: false, error: "서버 설정이 누락되었습니다. (Supabase env)" },
        { status: 503 }
      );
    }

    const { data: rows, error } = await supabaseAdmin
      .from("expense_item_photos")
      .select("id, expense_item_id, template_id, kind, slot, storage_path")
      .eq("expense_item_id", itemId)
      .order("kind", { ascending: true })
      .order("slot", { ascending: true });

    if (error) {
      const code = (error as { code?: string }).code ?? "";
      const message = (error as { message?: string }).message ?? String(error);
      console.warn("[photos/list] DB error", code, message);

      if (code === "42P01") {
        console.warn("[photos/list] 테이블 없음: expense_item_photos. 빈 데이터 반환.");
        return NextResponse.json({
          ok: true,
          template_id: DEFAULT_TEMPLATE_ID,
          photos: [],
          grouped: { incoming: [...EMPTY_GROUPED.incoming], install: [...EMPTY_GROUPED.install] },
        });
      }
      if (code === "42703") {
        console.warn("[photos/list] 컬럼 불일치. 마이그레이션 적용 후 재시도. 빈 데이터 반환.");
        return NextResponse.json({
          ok: true,
          template_id: DEFAULT_TEMPLATE_ID,
          photos: [],
          grouped: { incoming: [...EMPTY_GROUPED.incoming], install: [...EMPTY_GROUPED.install] },
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error: message,
          hint:
            code === "42P01"
              ? "테이블 expense_item_photos가 없습니다."
              : code === "42703"
                ? "컬럼명 불일치. 마이그레이션 20260204000000 적용 확인."
                : undefined,
        },
        { status: 500 }
      );
    }

    let templateId = DEFAULT_TEMPLATE_ID;
    if (Array.isArray(rows) && rows.length > 0 && rows[0] != null) {
      const first = rows[0] as { template_id?: string };
      if (typeof first.template_id === "string" && first.template_id.trim()) {
        templateId = first.template_id.trim();
      }
    }

    let spec = null;
    try {
      spec = getTemplateSpec(templateId);
    } catch {
      spec = null;
    }
    const incomingLen = spec?.incomingSlots ?? 4;
    const installLen = spec?.installSlots ?? 4;

    const list = Array.isArray(rows) ? rows : [];
    const withUrls = await Promise.all(
      list.map(async (row) => {
        const r = row as { storage_path?: string; kind?: string; slot?: number };
        let url: string | null = null;
        if (r.storage_path) {
          try {
            const { data: signed, error: sErr } = await supabaseAdmin.storage
              .from("expense-evidence")
              .createSignedUrl(r.storage_path, 60 * 10);
            if (!sErr && signed?.signedUrl && typeof signed.signedUrl === "string" && signed.signedUrl.length > 0) {
              url = signed.signedUrl;
            } else if (sErr) {
              console.warn("[photos/list] signedUrl failed", r.storage_path, sErr);
            }
          } catch {
            console.warn("[photos/list] signedUrl exception", r.storage_path);
          }
        }
        const kindApi = KIND_DB_TO_API[r.kind ?? ""] ?? r.kind ?? "";
        const slot =
          typeof r.slot === "number" && Number.isInteger(r.slot) ? r.slot : Number(r.slot) || 0;
        return { ...row, kind: kindApi, slot, url };
      })
    );

    const incoming: (string | null)[] = Array(incomingLen).fill(null);
    const install: (string | null)[] = Array(installLen).fill(null);

    for (const p of withUrls) {
      const urlStr =
        p.url && typeof p.url === "string" && p.url.length > 0 ? p.url : null;
      if (!urlStr) continue;
      const slot = Number(p.slot);
      if (!Number.isInteger(slot) || slot < 0) continue;
      if (p.kind === "incoming" && slot < incomingLen) {
        incoming[slot] = urlStr;
      }
      if (p.kind === "install" && slot < installLen) {
        install[slot] = urlStr;
      }
    }

    return NextResponse.json({
      ok: true,
      template_id: templateId,
      photos: withUrls,
      grouped: { incoming, install },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "서버 오류";
    console.error("[photos/list] catch", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
