// src/app/api/upload-excel/route.ts
// [기술/이유]
// - Next.js App Router Route Handler (Server)
// - Excel 업로드 → DB 테이블 스키마(신찬님 스크린샷 컬럼)로 안전하게 insert
// - 날짜/숫자 파싱 실패 행은 저장 금지(재발 방지)
// - source_fingerprint 로 중복 방지/추적용(선택: DB에 unique 걸어도 됨)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { parseItemUsageSheet } from "@/lib/excel/parseItemUsageSheet";

export const runtime = "nodejs"; // ✅ 이유: xlsx/crypto 사용은 node runtime이 가장 안전

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL(또는 NEXT_PUBLIC_SUPABASE_URL)와 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  return createClient(url, key);
}

// ✅ 신찬님 테이블(스크린샷) 컬럼명에 맞춘 매핑
// id(uuid), doc_id(uuid), evidence_no(text), item_name(text),
// used_at(text), qty(numeric), unit_price(numeric), amount(numeric),
// category_no(int?), source_row_no(int4), source_fingerprint(text), created_at(timestamptz)
type DbInsertRow = {
  doc_id: string;
  evidence_no: string;
  item_name: string;
  used_at: string;
  qty: number;
  unit_price: number;
  amount: number;
  category_no: number | null;
  source_row_no: number | null;
  source_fingerprint: string;
};

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim());
  return Number.isInteger(n) ? n : null;
}

/**
 * category 예시: "2. 안전시설비 등 구매비 등"
 * -> category_no = 2
 * 없으면 null
 */
function extractCategoryNo(category: string): number | null {
  const s = String(category ?? "").trim();
  const m = s.match(/^(\d+)\s*[\.\)]/); // "2." or "2)"
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * fingerprint 규칙:
 * - doc_id + used_at + item_name + qty + unit_price + amount + (source_row_no)
 * - 같은 행 재업로드 시 "같은 지문"이 나오게 설계
 */
function makeFingerprint(r: {
  doc_id: string;
  used_at: string;
  item_name: string;
  qty: number;
  unit_price: number;
  amount: number;
  source_row_no: number | null;
}): string {
  const base = [
    r.doc_id,
    r.used_at,
    r.item_name,
    String(r.qty),
    String(r.unit_price),
    String(r.amount),
    String(r.source_row_no ?? ""),
  ].join("|");
  return sha256(base);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // ✅ 필수: docId (UUID)
    const docId = String(formData.get("docId") ?? "").trim();
    if (!docId) {
      return NextResponse.json(
        { ok: false, error: "docId가 없습니다. formData에 docId(UUID)를 넣어주세요." },
        { status: 400 }
      );
    }

    // ✅ 필수: file
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "file이 없습니다." }, { status: 400 });
    }

    const buf = await file.arrayBuffer();

    // ✅ 기존 파서 사용(신찬님이 올려준 1번 코드)
    const parsed = parseItemUsageSheet(buf);

    if (!parsed.length) {
      return NextResponse.json(
        { ok: false, error: "엑셀에서 추출된 실사용 데이터가 0건입니다. (헤더/형식 확인 필요)" },
        { status: 400 }
      );
    }

    const rowsToInsert: DbInsertRow[] = [];
    const skipped: Array<{ evidenceNo: number; reason: string }> = [];

    for (const r of parsed) {
      // parseItemUsageSheet가 이미 useDateISO를 만들지만,
      // 혹시 빈 값이면 저장 금지
      if (!r.useDateISO) {
        skipped.push({ evidenceNo: r.evidenceNo, reason: "used_at(사용일자) 없음" });
        continue;
      }

      // item_name(사용내역) 필수로 봄
      const itemName = String(r.description ?? "").trim();
      if (!itemName) {
        skipped.push({ evidenceNo: r.evidenceNo, reason: "item_name(사용내역) 없음" });
        continue;
      }

      // qty/unit_price/amount 숫자 필수(테이블 numeric)
      if (r.qty === null || r.unitPrice === null || r.amount === null) {
        skipped.push({
          evidenceNo: r.evidenceNo,
          reason: `숫자 파싱 실패(qty/unit_price/amount). 원본(qty="${r.qtyRaw}", unit_price="${r.unitPriceRaw}", amount="${r.amountRaw}")`,
        });
        continue;
      }

      const categoryNo = extractCategoryNo(r.category);

      // source_row_no: 파서에서 absolute row index를 안 넘기고 있으므로
      // 지금은 evidenceNo로 대체(추적용). 원하면 파서에 excel_row_index를 추가하세요.
      // (지금 단계에서는 꼬임 방지 위해 최소 변경)
      const sourceRowNo = toIntOrNull(r.evidenceNo);

      const fp = makeFingerprint({
        doc_id: docId,
        used_at: r.useDateISO,
        item_name: itemName,
        qty: r.qty,
        unit_price: r.unitPrice,
        amount: r.amount,
        source_row_no: sourceRowNo,
      });

      rowsToInsert.push({
        doc_id: docId,
        evidence_no: String(r.evidenceNo), // ✅ 테이블이 text라서 문자열로
        item_name: itemName,
        used_at: r.useDateISO, // ✅ 테이블이 text
        qty: r.qty,
        unit_price: r.unitPrice,
        amount: r.amount,
        category_no: categoryNo,
        source_row_no: sourceRowNo,
        source_fingerprint: fp,
      });
    }

    if (!rowsToInsert.length) {
      return NextResponse.json(
        { ok: false, error: "저장할 데이터가 0건입니다.", skipped: skipped.slice(0, 200) },
        { status: 400 }
      );
    }

    // ✅ 중복 방지(권장):
    // DB에 (doc_id, source_fingerprint) unique를 걸어두면 가장 안전합니다.
    // 지금은 최소 변경으로 insert 시도 → 충돌 나면 에러 메시지로 확인 가능.
    const supabase = getSupabase();
    const { error } = await supabase.from("expense_items").insert(rowsToInsert);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          hint:
            "테이블 컬럼명이 이 코드와 정확히 일치하는지 확인하세요. (expense_items: doc_id, evidence_no, item_name, used_at, qty, unit_price, amount, category_no, source_row_no, source_fingerprint)",
          savedAttempt: rowsToInsert.length,
          skippedCount: skipped.length,
          skipped: skipped.slice(0, 80),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      docId,
      saved: rowsToInsert.length,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 80),
      msg: `완료: ${rowsToInsert.length}건 저장 (스킵 ${skipped.length}건)`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
