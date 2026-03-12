// [왜] TemplateSpec 기반 block-fill: item.template_id로 스펙 선택, excel.photoRanges/textCells/blocks로 주입. 내보내기 시에만 엑셀 생성.

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import path from "path";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTemplateSpec, DEFAULT_TEMPLATE_ID } from "@/components/PhotoSheet/templateSpec";

export const runtime = "nodejs";

const BUCKET = "expense-evidence";

type DbPhotoKind = "inbound" | "issue_install";

type PhotoRow = {
  kind: DbPhotoKind;
  slot: number;
  storage_path: string;
  template_id?: string;
};

async function fetchImageBuffer(admin: ReturnType<typeof getSupabaseAdmin>, storagePath: string) {
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  const res = await fetch(signed.signedUrl);
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf as ArrayBuffer);
  const lower = storagePath.toLowerCase();
  const ext =
    lower.endsWith(".png") ? "png" :
    lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpeg" :
    "jpeg";
  return { buf, ext: ext as "png" | "jpeg" };
}

function addImageToRange(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  imageBuf: Buffer,
  ext: "png" | "jpeg",
  range: string
) {
  // Runtime: Node Buffer; TS @types can conflict with ExcelJS Buffer type
  // @ts-expect-error Buffer type compatibility (Node vs ExcelJS)
  const imageId = workbook.addImage({ buffer: imageBuf, extension: ext });
  worksheet.addImage(imageId, range);
}

function cloneWorksheetLikeTemplate(
  wb: ExcelJS.Workbook,
  templateWs: ExcelJS.Worksheet,
  newName: string
) {
  const newWs = wb.addWorksheet(newName);
  templateWs.columns.forEach((c, i) => {
    newWs.getColumn(i + 1).width = c.width;
  });
  templateWs.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const targetRow = newWs.getRow(rowNumber);
    targetRow.height = row.height;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.value = cell.value;
      targetCell.style = { ...cell.style };
    });
    targetRow.commit();
  });
  const anyTemplate = templateWs as unknown as Record<string, unknown>;
  const merges = anyTemplate?._merges as Record<string, unknown> | undefined;
  if (merges) {
    for (const mergeRange of Object.keys(merges)) {
      try {
        newWs.mergeCells(mergeRange);
      } catch {
        // ignore
      }
    }
  }
  return newWs;
}

export async function GET(req: Request) {
  try {
    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("docId");
    if (!docId) return NextResponse.json({ error: "docId required" }, { status: 400 });

    const { data: doc, error: docErr } = await admin
      .from("expense_docs")
      .select("*")
      .eq("id", docId)
      .single();

    if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

    const { data: items, error: itemErr } = await admin
      .from("expense_items")
      .select("*")
      .eq("doc_id", docId)
      .order("evidence_no", { ascending: true });

    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

    const wb = new ExcelJS.Workbook();
    const templatePath = path.join(process.cwd(), "public", "templates", "항목별사용내역서_template.xlsx");
    await wb.xlsx.readFile(templatePath);

    const ws = wb.worksheets[0];
    const rowStartMap: Record<number, number> = { 2: 8, 3: 20, 9: 60 };
    const col = { usedAt: "B", name: "C", qty: "D", unit: "E", amt: "F", no: "G" };
    const byCat: Record<number, unknown[]> = {};
    for (const it of items ?? []) {
      const c = Number((it as { category_no?: number }).category_no ?? 0);
      if (!byCat[c]) byCat[c] = [];
      byCat[c].push(it);
    }
    for (const [catStr, arr] of Object.entries(byCat)) {
      const cat = Number(catStr);
      const startRow = rowStartMap[cat];
      if (!startRow) continue;
      arr.forEach((it: unknown, idx: number) => {
        const row = it as { used_at?: string; item_name?: string; qty?: unknown; unit_price?: unknown; amount?: unknown; evidence_no?: string };
        const r = startRow + idx;
        ws.getCell(`${col.usedAt}${r}`).value = String(row.used_at ?? "");
        ws.getCell(`${col.name}${r}`).value = String(row.item_name ?? "");
        ws.getCell(`${col.qty}${r}`).value = row.qty != null ? String(row.qty) : "";
        ws.getCell(`${col.unit}${r}`).value = row.unit_price != null ? String(row.unit_price) : "";
        ws.getCell(`${col.amt}${r}`).value = row.amount != null ? String(row.amount) : "";
        ws.getCell(`${col.no}${r}`).value = String(row.evidence_no ?? "");
      });
    }

    const itemList = (items ?? []) as { id: string; evidence_no?: string; used_at?: string; item_name?: string }[];
    let photoTemplateWs: ExcelJS.Worksheet | null = null;

    for (const it of itemList) {
      const { data: photos, error: pErr } = await admin
        .from("expense_item_photos")
        .select("kind, slot, storage_path, template_id")
        .eq("expense_item_id", it.id);

      if (pErr) throw pErr;

      const templateId = (photos?.[0] as PhotoRow | undefined)?.template_id ?? DEFAULT_TEMPLATE_ID;
      const spec = getTemplateSpec(templateId);
      if (!spec) continue;

      if (!photoTemplateWs) {
        const found = wb.getWorksheet(spec.sheetName);
        if (!found) {
          return NextResponse.json(
            { error: `사진대지 시트를 찾을 수 없습니다: ${spec.sheetName}` },
            { status: 500 }
          );
        }
        photoTemplateWs = found;
        photoTemplateWs.state = "veryHidden";
      }

      const evNo = it.evidence_no ?? "";
      const sheetName = `NO.${evNo || "미정"}`;
      const finalName = wb.getWorksheet(sheetName) ? `${sheetName}_${String(it.id).slice(0, 6)}` : sheetName;
      const photoWs = cloneWorksheetLikeTemplate(wb, photoTemplateWs, finalName);

      const list = (photos ?? []) as PhotoRow[];
      const incomingBySlot: Array<PhotoRow | null> = Array(spec.incomingSlots).fill(null);
      const installBySlot: Array<PhotoRow | null> = Array(spec.installSlots).fill(null);

      for (const p of list) {
        if (p.kind === "inbound" && p.slot >= 0 && p.slot < spec.incomingSlots) incomingBySlot[p.slot] = p;
        if (p.kind === "issue_install" && p.slot >= 0 && p.slot < spec.installSlots) installBySlot[p.slot] = p;
      }

      const tc = spec.excel.textCells;
      const blockAnchor = spec.excel.blocks[0];
      if (blockAnchor) photoWs.getCell(blockAnchor).value = `NO.${evNo || ""}`;
      if (tc.date) photoWs.getCell(tc.date).value = it.used_at ?? "";
      if (tc.item) photoWs.getCell(tc.item).value = it.item_name ?? "";

      for (let s = 0; s < spec.incomingSlots; s++) {
        const row = incomingBySlot[s];
        const range = spec.excel.photoRanges.incoming[s];
        if (!row || !range) continue;
        const { buf, ext } = await fetchImageBuffer(admin, row.storage_path);
        addImageToRange(wb, photoWs, buf, ext, range);
      }
      for (let s = 0; s < spec.installSlots; s++) {
        const row = installBySlot[s];
        const range = spec.excel.photoRanges.install[s];
        if (!row || !range) continue;
        const { buf, ext } = await fetchImageBuffer(admin, row.storage_path);
        addImageToRange(wb, photoWs, buf, ext, range);
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="항목별사용내역서_${(doc as { month_key?: string }).month_key ?? docId}.xlsx"`,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
