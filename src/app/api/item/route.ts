// src/app/api/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = String(searchParams.get("docId") ?? "").trim();

    if (!docId) {
      return NextResponse.json(
        { ok: false, error: "docId가 필요합니다. 예) /api/items?docId=xxxx" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("expense_items")
      .select("*")
      .eq("doc_id", docId)
      .order("evidence_no", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
