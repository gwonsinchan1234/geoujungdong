import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!url || !serviceKey) {
      // 로그는 부가 기능이므로, 환경변수 미설정 시 조용히 스킵
      return NextResponse.json({ ok: true, skipped: true });
    }

    const body = await req.json().catch(() => ({}));
    const question = String(body?.question ?? "").trim();
    const answer = String(body?.answer ?? "").trim();
    const userIdRaw = body?.user_id ?? body?.userId;
    const user_id =
      userIdRaw != null && String(userIdRaw).trim()
        ? String(userIdRaw).trim()
        : null;

    if (!question) {
      return NextResponse.json({ ok: false, error: "question required" }, { status: 400 });
    }
    if (!answer) {
      return NextResponse.json({ ok: false, error: "answer required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin.from("chat_logs").insert({
      question,
      answer,
      user_id,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
