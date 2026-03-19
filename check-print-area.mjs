import * as XLSX from "xlsx";
import { readdirSync, readFileSync } from "fs";

const files = readdirSync(".").filter((f) => f.endsWith(".xlsx"));
if (!files.length) process.exit(0);

const buf = readFileSync(files[0]);

const wb = XLSX.read(new Uint8Array(buf), {
  type: "array",
  cellStyles: true,
  cellDates: true,
  cellNF: true,
});

// 항목별세부내역 - 셀별 글꼴(특히 글씨 크기) 정보 덤프
const ws2 = wb.Sheets["항목별세부내역"];
if (ws2) {
  const fontMap = {};

  for (const [addr, cell] of Object.entries(ws2)) {
    if (addr.startsWith("!") || !cell) continue;

    const font = cell.s?.font;
    if (!font) continue;

    fontMap[addr] = {
      value: cell.v,
      fontName: font.name,
      fontSizePt: font.sz,
      bold: !!font.bold,
      italic: !!font.italic,
      underline: !!font.underline,
    };
  }

  console.log(
    "\n[항목별세부내역] 셀별 글꼴 정보(JSON)",
    JSON.stringify(fontMap, null, 2),
  );
}

// 갑지 B5 (내용 있는 셀) 스타일 참고용
const ws1 = wb.Sheets["갑지"];
const b5 = ws1?.["B5"];
console.log("\n갑지 B5 cell.s:", JSON.stringify(b5?.s, null, 2));
