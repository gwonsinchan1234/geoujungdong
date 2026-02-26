// app/api/photos/list/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { searchParams } = new URL(req.url);
    const expenseItemId = String(searchParams.get("expenseItemId") || "");

    if (!expenseItemId) {
      return NextResponse.json({ ok: false, error: "expenseItemId 누락" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("expense_item_photos")
      .select("id, expense_item_id, kind, slot, storage_path, original_name, mime_type, size_bytes, created_at")
      .eq("expense_item_id", expenseItemId)
      .order("kind", { ascending: true })
      .order("slot", { ascending: true });

    if (error) throw error;

    const photos = await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: signed, error: sErr } = await supabaseAdmin.storage
          .from("expense-evidence")
          .createSignedUrl(row.storage_path, 60 * 10);

        if (sErr) throw sErr;
        return { ...row, url: signed.signedUrl };
      })
    );

    return NextResponse.json({ ok: true, photos });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message ?? "서버 오류" }, { status: 500 });
  }
}
