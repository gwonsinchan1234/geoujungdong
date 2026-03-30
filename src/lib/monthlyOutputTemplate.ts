export type MonthlyOutputPerson = {
  id: string;
  name: string;
  role?: string;
  note?: string;
};

export type MonthlyOutputCellKey =
  | `${string}__${number}__day`
  | `${string}__${number}__early`
  | `${string}__${number}__lunch`
  | `${string}__${number}__ot`
  | `${string}__${number}__night`;

export type MonthlyOutputData = {
  title: string;
  siteName: string;
  year: number;
  month: number;
  persons: MonthlyOutputPerson[];
  values: Record<MonthlyOutputCellKey, string>;
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isSunday(year: number, month: number, day: number): boolean {
  return new Date(year, month - 1, day).getDay() === 0;
}

function getDow(year: number, month: number, day: number): string {
  return ["일", "월", "화", "수", "목", "금", "토"][new Date(year, month - 1, day).getDay()] ?? "";
}

function getVal(
  values: MonthlyOutputData["values"],
  personId: string,
  day: number,
  type: "day" | "early" | "lunch" | "ot" | "night",
): string {
  return (values[`${personId}__${day}__${type}` as MonthlyOutputCellKey] ?? "").trim();
}

function sumRow(
  values: MonthlyOutputData["values"],
  personId: string,
  type: "day" | "early" | "lunch" | "ot" | "night",
  lastDay: number,
): number {
  let s = 0;
  for (let d = 1; d <= lastDay; d++) {
    const n = Number(getVal(values, personId, d, type).replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

export function buildMonthlyOutputHtml(data: MonthlyOutputData): string {
  const lastDay = daysInMonth(data.year, data.month);
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  const ROWS: { label: string; type: "day" | "early" | "lunch" | "ot" | "night" }[] = [
    { label: "주간", type: "day" },
    { label: "조출", type: "early" },
    { label: "점심", type: "lunch" },
    { label: "연장", type: "ot" },
    { label: "야간", type: "night" },
  ];

  const headDays = days
    .map((d) => {
      const sun = isSunday(data.year, data.month, d);
      return `<th class="dh${sun ? " sun" : ""}">${d}</th>`;
    })
    .join("");

  const headDow = days
    .map((d) => {
      const sun = isSunday(data.year, data.month, d);
      return `<th class="dh${sun ? " sun" : ""}">${getDow(data.year, data.month, d)}</th>`;
    })
    .join("");

  const bodyRows = data.persons
    .map((p) => {
      const sums = {
        early: sumRow(data.values, p.id, "early", lastDay),
        lunch: sumRow(data.values, p.id, "lunch", lastDay),
        ot: sumRow(data.values, p.id, "ot", lastDay),
        night: sumRow(data.values, p.id, "night", lastDay),
      };
      const total = sums.early + sums.lunch + sums.ot + sums.night;
      const rs = ROWS.length;

      const sumHtml = `
        <div class="sl"><span>조출</span><b>${sums.early || ""}</b></div>
        <div class="sl"><span>점심</span><b>${sums.lunch || ""}</b></div>
        <div class="sl"><span>연장</span><b>${sums.ot || ""}</b></div>
        <div class="sl"><span>야간</span><b>${sums.night || ""}</b></div>
        <div class="sl tot"><span>총 추가근무</span><b>${total || ""}</b></div>
      `;

      return ROWS.map(({ label, type }, i) => {
        const dayCells = days
          .map((d) => {
            const sun = isSunday(data.year, data.month, d);
            const v = esc(getVal(data.values, p.id, d, type));
            return `<td class="dc${sun ? " sun" : ""}">${v}</td>`;
          })
          .join("");

        if (i === 0) {
          return `<tr class="prow">
            <td class="nc" rowspan="${rs}">${esc(p.name)}${p.role ? `<div class="rc">${esc(p.role)}</div>` : ""}</td>
            <td class="kc">${label}</td>
            ${dayCells}
            <td class="notec" rowspan="${rs}">${esc(p.note ?? "")}</td>
            <td class="sumc" rowspan="${rs}">${sumHtml}</td>
          </tr>`;
        }
        return `<tr><td class="kc">${label}</td>${dayCells}</tr>`;
      }).join("");
    })
    .join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>${esc(data.title || "월간 출력현황")}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
  font-size: 10px;
  color: #111;
  background: #fff;
  padding: 12px;
}
.doc-title {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-align: center;
  padding: 8px 0 2px;
  color: #111;
}
.doc-sub {
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  color: #555;
  padding-bottom: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
th, td {
  border: 1px solid #ccc;
  text-align: center;
  vertical-align: middle;
  font-size: 9px;
  padding: 1px 0;
  line-height: 1.2;
}
/* 헤더 행 */
thead th {
  background: #f0f0f0;
  font-weight: 700;
  color: #333;
}
th.dh { width: 28px; font-size: 9px; }
th.nh { width: 88px; }
th.kh { width: 52px; }
th.nth { width: 50px; }
th.sh { width: 78px; }
th.dh.sun, td.dc.sun { background: #fff0f0; color: #dc2626; }
/* 바디 셀 */
td.nc {
  font-weight: 800;
  font-size: 9.5px;
  background: #fafafa;
  vertical-align: middle;
  padding: 4px 3px;
}
.rc {
  font-weight: 600;
  font-size: 8.5px;
  color: #555;
  margin-top: 3px;
}
td.kc {
  background: #f7f7f7;
  font-weight: 700;
  font-size: 8.5px;
  color: #444;
  white-space: nowrap;
}
td.dc {
  font-weight: 600;
  font-size: 9px;
}
td.notec {
  font-size: 8.5px;
  background: #fafafa;
  vertical-align: top;
  padding: 4px 3px;
  color: #555;
}
td.sumc {
  background: #fafafa;
  text-align: left;
  vertical-align: top;
  padding: 4px 5px;
}
.sl {
  display: flex;
  justify-content: space-between;
  font-size: 8.5px;
  color: #555;
  line-height: 1.5;
}
.sl b { font-weight: 700; color: #111; }
.tot {
  border-top: 1px solid #ccc;
  margin-top: 3px;
  padding-top: 3px;
  font-weight: 800;
}
.tot span, .tot b { color: #111; font-weight: 800; }
/* 인원 구분 */
tr.prow td, tr.prow th { border-top: 2px solid #888; }
</style>
</head>
<body>
<div class="doc-title">${esc(data.year + "년 " + data.month + "월")} ${esc(data.title || "출력현황")}${data.siteName ? " — " + esc(data.siteName) : ""}</div>
${data.siteName ? `<div class="doc-sub">${esc(data.siteName)}</div>` : ""}
<table>
  <colgroup>
    <col style="width:88px"/>
    <col style="width:52px"/>
    ${days.map(() => `<col style="width:28px"/>`).join("")}
    <col style="width:50px"/>
    <col style="width:78px"/>
  </colgroup>
  <thead>
    <tr>
      <th class="nh" rowspan="2">성명(직책)</th>
      <th class="kh" rowspan="2">구분</th>
      ${headDays}
      <th class="nth" rowspan="2">비고</th>
      <th class="sh" rowspan="2">총 추가근무</th>
    </tr>
    <tr>${headDow}</tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>
</body>
</html>`;
}
