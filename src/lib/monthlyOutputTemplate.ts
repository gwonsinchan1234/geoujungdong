export type MonthlyOutputPerson = {
  id: string;
  name: string;
  role?: string;
  note?: string;
};

export type DayEntry = {
  dateStr: string; // "YYYY-MM-DD"
  y: number;
  m: number;
  d: number;
  dow: number; // 0=일 … 6=토
};

export type MonthlyOutputCellKey =
  | `${string}__${string}__day`
  | `${string}__${string}__early`
  | `${string}__${string}__lunch`
  | `${string}__${string}__ot`
  | `${string}__${string}__night`;

export type MonthlyOutputData = {
  title: string;
  siteName: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  days: DayEntry[];
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

function getVal(
  values: MonthlyOutputData["values"],
  personId: string,
  dateStr: string,
  type: "day" | "early" | "lunch" | "ot" | "night",
): string {
  return (values[`${personId}__${dateStr}__${type}` as MonthlyOutputCellKey] ?? "").trim();
}

function sumRow(
  values: MonthlyOutputData["values"],
  personId: string,
  type: "day" | "early" | "lunch" | "ot" | "night",
  days: DayEntry[],
): number {
  let s = 0;
  for (const day of days) {
    const n = Number(getVal(values, personId, day.dateStr, type).replace(/[^\d.]/g, ""));
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

export function buildMonthlyOutputHtml(data: MonthlyOutputData): string {
  const days = data.days;
  const multiMonth = days.length > 0 && days[0].m !== days[days.length - 1].m;
  const dayWidth = days.length > 20 ? 24 : 28;

  const ROWS: { label: string; type: "day" | "early" | "lunch" | "ot" | "night" }[] = [
    { label: "주간", type: "day" },
    { label: "조출", type: "early" },
    { label: "점심", type: "lunch" },
    { label: "연장", type: "ot" },
    { label: "야간", type: "night" },
  ];

  const headDays = days
    .map((day) => {
      const label = multiMonth ? `${day.m}/${day.d}` : String(day.d);
      return `<th class="dh${day.dow === 0 ? " sun" : ""}">${label}</th>`;
    })
    .join("");

  const headDow = days
    .map((day) =>
      `<th class="dh${day.dow === 0 ? " sun" : ""}">${["일", "월", "화", "수", "목", "금", "토"][day.dow]}</th>`
    )
    .join("");

  const [titleY, titleM] = data.startDate.split("-").map(Number);
  const titleDate = `${titleY}년 ${titleM}월`;

  const bodyRows = data.persons
    .map((p) => {
      const sums = {
        early: sumRow(data.values, p.id, "early", days),
        lunch: sumRow(data.values, p.id, "lunch", days),
        ot: sumRow(data.values, p.id, "ot", days),
        night: sumRow(data.values, p.id, "night", days),
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

      const leaveCount = days.filter(
        (day) => getVal(data.values, p.id, day.dateStr, "day") === "연차"
      ).length;
      const leaveHtml = leaveCount > 0 ? `<span class="leave-badge">연차${leaveCount}</span>` : "";
      const noteText = p.note?.trim() ? esc(p.note) : "";
      const noteCombined = [leaveHtml, noteText].filter(Boolean).join("<br/>");

      return ROWS.map(({ label, type }, i) => {
        const dayCells = days
          .map((day) => {
            const v = esc(getVal(data.values, p.id, day.dateStr, type));
            return `<td class="dc${day.dow === 0 ? " sun" : ""}">${v}</td>`;
          })
          .join("");

        if (i === 0) {
          return `<tr class="prow">
            <td class="nc" rowspan="${rs}">${esc(p.name)}${p.role ? `<div class="rc">${esc(p.role)}</div>` : ""}</td>
            <td class="kc">${label}</td>
            ${dayCells}
            <td class="notec" rowspan="${rs}">${noteCombined}</td>
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
thead th {
  background: #f0f0f0;
  font-weight: 700;
  color: #333;
}
th.dh { width: ${dayWidth}px; font-size: 9px; }
th.nh { width: 88px; }
th.kh { width: 52px; }
th.nth { width: 50px; }
th.sh { width: 78px; }
th.dh.sun, td.dc.sun { background: #fecaca; color: #b91c1c; }
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
  vertical-align: middle;
  text-align: center;
  padding: 4px 3px;
  color: #555;
}
.leave-badge {
  display: inline-block;
  font-size: 8px;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 3px;
  padding: 1px 4px;
  margin-bottom: 2px;
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
tr.prow td, tr.prow th { border-top: 2px solid #888; }
</style>
</head>
<body>
<div class="doc-title">${esc(titleDate)} ${esc(data.title || "출력현황")}${data.siteName ? " " + esc(data.siteName) : ""}</div>
<table>
  <colgroup>
    <col style="width:88px"/>
    <col style="width:52px"/>
    ${days.map(() => `<col style="width:${dayWidth}px"/>`).join("")}
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
