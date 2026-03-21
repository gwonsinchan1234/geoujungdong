import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type DocRow = {
  id: string;
  person_name: string;
  payment_date: string;
  month_key: string;
  amount: number;
  status: "미완료" | "완료";
  attachment_count: number;
  created_at: string;
};

function toMonthKey(value?: string | null) {
  if (!value) return "";
  const v = String(value).trim();
  return /^\d{4}-\d{2}$/.test(v) ? v : "";
}

export async function GET(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);

    const search = String(searchParams.get("search") ?? "").trim();
    const month = toMonthKey(searchParams.get("month"));
    const person = String(searchParams.get("person") ?? "").trim();

    let query = admin
      .from("safety_labor_documents")
      .select("id, person_name, payment_date, month_key, amount, status, attachment_count, created_at")
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (month) query = query.eq("month_key", month);
    if (person) query = query.ilike("person_name", `%${person}%`);
    if (search) query = query.or(`person_name.ilike.%${search}%,status.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, rows: (data ?? []) as DocRow[] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));

    const personName = String(body?.personName ?? "").trim();
    const paymentDate = String(body?.paymentDate ?? "").trim();
    const amountNum = Number(body?.amount ?? 0);

    if (!personName) return NextResponse.json({ ok: false, error: "personName required" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      return NextResponse.json({ ok: false, error: "paymentDate must be YYYY-MM-DD" }, { status: 400 });
    }
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      return NextResponse.json({ ok: false, error: "amount must be >= 0" }, { status: 400 });
    }

    const monthKey = paymentDate.slice(0, 7);

    const { data, error } = await admin
      .from("safety_labor_documents")
      .insert([
        {
          person_name: personName,
          payment_date: paymentDate,
          month_key: monthKey,
          amount: amountNum,
          status: "미완료",
          attachment_count: 0,
        },
      ])
      .select("id, person_name, payment_date, month_key, amount, status, attachment_count, created_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, row: data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
