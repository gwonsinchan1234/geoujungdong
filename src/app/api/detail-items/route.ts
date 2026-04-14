import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function makeClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return getSupabaseAdmin();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {},
    },
  });
}

type DetailItem = {
  id: string;
  categoryNo: number;
  evidenceNo: string;
  usageDate: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  note: string;
  sortOrder: number;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = String(searchParams.get("documentId") ?? "").trim();
    if (!documentId) {
      return NextResponse.json({ ok: false, error: "documentId가 필요합니다." }, { status: 400 });
    }

    const supabase = makeClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

    const { data, error } = await supabase
      .from("detail_items")
      .select("*")
      .eq("document_id", documentId)
      .order("category_no", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("evidence_no", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const items: DetailItem[] = (data ?? []).map((r: any) => ({
      id: String(r.id),
      categoryNo: Number(r.category_no) || 1,
      evidenceNo: String(r.evidence_no ?? ""),
      usageDate: String(r.usage_date ?? ""),
      name: String(r.name ?? ""),
      quantity: Number(r.quantity) || 1,
      unit: String(r.unit ?? "EA"),
      unitPrice: Number(r.unit_price) || 0,
      amount: Number(r.amount) || 0,
      note: String(r.note ?? ""),
      sortOrder: Number(r.sort_order) || 0,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = makeClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

    const body = (await req.json()) as { documentId?: string; items?: unknown };
    const documentId = String(body.documentId ?? "").trim();
    if (!documentId) {
      return NextResponse.json({ ok: false, error: "documentId가 필요합니다." }, { status: 400 });
    }
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ ok: false, error: "items 배열이 필요합니다." }, { status: 400 });
    }

    const rows = body.items
      .filter((it) => it && typeof it === "object")
      .map((it: any, idx: number) => ({
        ...(it.id ? { id: String(it.id) } : {}),
        document_id: documentId,
        category_no: Number(it.categoryNo) || 1,
        evidence_no: String(it.evidenceNo ?? ""),
        usage_date: String(it.usageDate ?? ""),
        name: String(it.name ?? ""),
        quantity: Number(it.quantity) || 1,
        unit: String(it.unit ?? "EA"),
        unit_price: Number(it.unitPrice) || 0,
        amount: Number(it.amount) || 0,
        note: String(it.note ?? ""),
        sort_order: Number(it.sortOrder) || idx,
      }));

    const { error } = await supabase
      .from("detail_items")
      .upsert(rows, { onConflict: "document_id,category_no,evidence_no" });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

