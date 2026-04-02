"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import {
  buildMonthlyOutputHtml,
  type MonthlyOutputCellKey,
  type MonthlyOutputData,
  type MonthlyOutputPerson,
} from "@/lib/monthlyOutputTemplate";

function nowYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function dlBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function makePerson(): MonthlyOutputPerson {
  return { id: crypto.randomUUID(), name: "", role: "" };
}

function numFromCell(value: string | undefined) {
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumType(personId: string, lastDay: number, values: Record<string, string>, type: "day" | "early" | "lunch" | "ot" | "night") {
  let total = 0;
  for (let d = 1; d <= lastDay; d++) {
    total += numFromCell(values[`${personId}__${d}__${type}`]);
  }
  return total;
}

const TYPE_ROWS = [
  { label: "주간(시간)", type: "day" as const },
  { label: "조출(시간)", type: "early" as const },
  { label: "점심(시간)", type: "lunch" as const },
  { label: "연장(시간)", type: "ot" as const },
  { label: "야간(시간)", type: "night" as const },
];

const toneClasses = [
  "toneBlue",
  "toneSky",
  "toneGreen",
  "toneLime",
  "toneYellow",
] as const;

export default function MonthlyOutputPage() {
  const [ym, setYm] = useState(nowYm());
  const [title, setTitle] = useState("안전감시단 출력현황");
  const [siteName, setSiteName] = useState("");
  const [persons, setPersons] = useState<MonthlyOutputPerson[]>(() => [makePerson()]);
  const [values, setValues] = useState<Record<MonthlyOutputCellKey, string>>({});
  const [downloading, setDownloading] = useState(false);
  const [denseMode, setDenseMode] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);

  const [y, m] = useMemo(() => {
    const mm = ym.match(/^(\d{4})-(\d{2})$/);
    const year = mm ? Number(mm[1]) : new Date().getFullYear();
    const month = mm ? Number(mm[2]) : new Date().getMonth() + 1;
    return [year, month];
  }, [ym]);

  const lastDay = useMemo(() => daysInMonth(y, m), [y, m]);

  const keyOf = useCallback((personId: string, day: number, type: "day" | "early" | "lunch" | "ot" | "night") => {
    return `${personId}__${day}__${type}` as MonthlyOutputCellKey;
  }, []);

  const setCell = useCallback((personId: string, day: number, type: "day" | "early" | "lunch" | "ot" | "night", v: string) => {
    const k = keyOf(personId, day, type);
    setValues((prev) => ({ ...prev, [k]: v }));
  }, [keyOf]);

  useEffect(() => {
    try {
      const data = { ym, title, siteName, persons, values };
      localStorage.setItem(`monthly_output_${ym}`, JSON.stringify(data));
    } catch {}
  }, [ym, title, siteName, persons, values]);

  const loadLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(`monthly_output_${ym}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        persons?: MonthlyOutputPerson[];
        values?: Record<MonthlyOutputCellKey, string>;
        title?: string;
        siteName?: string;
      };
      if (parsed.persons) setPersons(parsed.persons);
      if (parsed.values) setValues(parsed.values);
      if (typeof parsed.title === "string") setTitle(parsed.title);
      if (typeof parsed.siteName === "string") setSiteName(parsed.siteName);
    } catch {}
  }, [ym]);

  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  const filledPersons = useMemo(() => persons.filter((p) => p.name.trim()), [persons]);

  const data: MonthlyOutputData = useMemo(() => ({
    title,
    siteName,
    year: y,
    month: m,
    persons: filledPersons,
    values,
  }), [title, siteName, y, m, filledPersons, values]);

  const personSummaries = useMemo(() => {
    return persons.map((person) => {
      const day = sumType(person.id, lastDay, values, "day");
      const early = sumType(person.id, lastDay, values, "early");
      const lunch = sumType(person.id, lastDay, values, "lunch");
      const ot = sumType(person.id, lastDay, values, "ot");
      const night = sumType(person.id, lastDay, values, "night");
      return {
        id: person.id,
        label: person.name.trim() || "이름 없음",
        role: person.role?.trim() || "직책 미입력",
        early,
        lunch,
        day,
        ot,
        night,
        total: early + lunch + ot + night,
      };
    });
  }, [lastDay, persons, values]);

  const statCards = useMemo(() => {
    const totals = personSummaries.reduce(
      (acc, item) => {
        acc.day += item.day;
        acc.ot += item.ot;
        acc.night += item.night;
        acc.total += item.total;
        return acc;
      },
      { day: 0, ot: 0, night: 0, total: 0 },
    );

    return [
      { label: "입력 인원", value: filledPersons.length, unit: `전체 ${persons.length}명` },
      { label: "주간 합계", value: totals.day, unit: "시간" },
      { label: "조출 합계", value: personSummaries.reduce((acc, item) => acc + item.early, 0), unit: "시간" },
      { label: "점심 합계", value: personSummaries.reduce((acc, item) => acc + item.lunch, 0), unit: "시간" },
      { label: "연장 합계", value: totals.ot, unit: "시간" },
      { label: "야간 합계", value: totals.night, unit: "시간" },
      { label: "총 추가근무", value: personSummaries.reduce((acc, item) => acc + item.total, 0), unit: "시간" },
    ];
  }, [filledPersons.length, personSummaries, persons.length]);

  const dayCols = useMemo(() => Array.from({ length: lastDay }, (_, i) => i + 1), [lastDay]);

  const focusedPerson = useMemo(
    () => persons.find((p) => p.id === focusedPersonId) ?? null,
    [persons, focusedPersonId]
  );

  const personFilledDays = useCallback(
    (personId: string) => {
      let count = 0;
      for (let d = 1; d <= lastDay; d++) {
        if (TYPE_ROWS.some(({ type }) => !!values[keyOf(personId, d, type)])) count++;
      }
      return count;
    },
    [lastDay, values, keyOf]
  );

  const navigatePerson = useCallback(
    (dir: 1 | -1) => {
      const idx = persons.findIndex((p) => p.id === focusedPersonId);
      const next = persons[idx + dir];
      if (next) setFocusedPersonId(next.id);
    },
    [focusedPersonId, persons]
  );

  const handleFocusCellKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, ti: number, di: number) => {
      const move = (nTi: number, nDi: number) => {
        const el = document.querySelector<HTMLInputElement>(`[data-focus-cell="${nTi}-${nDi}"]`);
        if (el) { e.preventDefault(); el.focus(); el.select(); }
      };
      if (e.key === "ArrowDown") move(Math.min(ti + 1, TYPE_ROWS.length - 1), di);
      else if (e.key === "ArrowUp") move(Math.max(ti - 1, 0), di);
      else if (e.key === "ArrowRight") move(ti, Math.min(di + 1, lastDay - 1));
      else if (e.key === "ArrowLeft") move(ti, Math.max(di - 1, 0));
    },
    [lastDay]
  );

  const downloadXlsx = useCallback(async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("월간출력현황");

    const cols = [
      { header: "성명(직책)", width: 16 },
      { header: "구분", width: 12 },
      ...Array.from({ length: lastDay }, (_, i) => ({ header: String(i + 1), width: 3 })),
      { header: "비고", width: 14 },
      { header: "총 추가근무", width: 12 },
    ];
    ws.columns = cols as never[];

    const thin = { style: "thin", color: { argb: "FF111111" } } as const;
    const border = { top: thin, left: thin, bottom: thin, right: thin } as const;

    ws.mergeCells(1, 1, 1, cols.length);
    ws.getCell(1, 1).value = `${y}년 ${m}월 ${title} ${siteName ? ` ${siteName}` : ""}`.trim();
    ws.getCell(1, 1).alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.getRow(1).height = 22;

    const headerRow = ws.getRow(2);
    headerRow.values = cols.map((c) => c.header);
    headerRow.height = 18;
    for (let c = 1; c <= cols.length; c++) {
      const cell = headerRow.getCell(c);
      cell.border = border;
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7D6" } };
    }

    let r = 3;
    for (const p of filledPersons) {
      const blocks: Array<{ label: string; type: "day" | "early" | "lunch" | "ot" | "night" }> = [
        { label: "주간(시간)", type: "day" },
        { label: "조출(시간)", type: "early" },
        { label: "점심(시간)", type: "lunch" },
        { label: "연장(시간)", type: "ot" },
        { label: "야간(시간)", type: "night" },
      ];

      ws.mergeCells(r, 1, r + 4, 1);
      ws.mergeCells(r, cols.length - 1, r + 4, cols.length - 1);
      ws.mergeCells(r, cols.length, r + 4, cols.length);

      ws.getCell(r, 1).value = p.role?.trim() ? `${p.name}\n${p.role}` : p.name;
      ws.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      ws.getCell(r, 1).font = { bold: true, size: 10 };

      ws.getCell(r, cols.length - 1).value = p.note ?? "";
      ws.getCell(r, cols.length - 1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      let sumEarly = 0;
      let sumLunch = 0;
      let sumOt = 0;
      let sumNight = 0;

      for (let i = 0; i < blocks.length; i++) {
        const row = ws.getRow(r + i);
        row.height = 16;
        row.getCell(2).value = blocks[i].label;
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2FF" } };
        row.getCell(2).font = { bold: true, size: 10 };

        for (let d = 1; d <= lastDay; d++) {
          const v = values[keyOf(p.id, d, blocks[i].type)] ?? "";
          const cell = row.getCell(2 + d);
          cell.value = v || "";
          cell.alignment = { horizontal: "center", vertical: "middle" };
          const date = new Date(y, m - 1, d);
          if (date.getDay() === 0) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE2E2" } };
          }
          const n = numFromCell(v);
          if (blocks[i].type === "early") sumEarly += n;
          if (blocks[i].type === "lunch") sumLunch += n;
          if (blocks[i].type === "ot") sumOt += n;
          if (blocks[i].type === "night") sumNight += n;
        }
      }

      const totalExtra = sumEarly + sumLunch + sumOt + sumNight;
      ws.getCell(r, cols.length).value = `조출 ${sumEarly || ""}\n점심 ${sumLunch || ""}\n연장 ${sumOt || ""}\n야간 ${sumNight || ""}\n총 추가근무 ${totalExtra || ""}`.trim();
      ws.getCell(r, cols.length).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      ws.getCell(r, cols.length).font = { size: 10 };

      for (let rr = r; rr <= r + 4; rr++) {
        for (let cc = 1; cc <= cols.length; cc++) {
          ws.getRow(rr).getCell(cc).border = border;
        }
      }
      r += 5;
    }

    const buf = await wb.xlsx.writeBuffer();
    dlBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${y}-${String(m).padStart(2, "0")}_출력현황.xlsx`);
  }, [filledPersons, keyOf, lastDay, m, siteName, title, values, y]);

  const downloadPng = useCallback(async () => {
    setDownloading(true);
    try {
      const html = buildMonthlyOutputHtml(data);
      const res = await fetch("/api/monthly-output/png", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          fileName: `${y}-${String(m).padStart(2, "0")}_출력현황.png`,
          htmlPreview: html.length,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `PNG 생성 실패 (${res.status})`);
      }
      const blob = await res.blob();
      dlBlob(blob, `${y}-${String(m).padStart(2, "0")}_출력현황.png`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "PNG 다운로드 실패");
    } finally {
      setDownloading(false);
    }
  }, [data, m, y]);

  const addPerson = () => setPersons((prev) => [...prev, makePerson()]);
  const addPeople = (count: number) => {
    setPersons((prev) => [...prev, ...Array.from({ length: count }, () => makePerson())]);
  };
  const removePerson = (id: string) => setPersons((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));

  return (
    <div className={`${styles.page} ${denseMode ? styles.pageDense : ""}`}>
      <section className={`${styles.hero} ${denseMode ? styles.heroDense : ""}`}>
        <div>
          <p className={styles.eyebrow}>Monthly Output</p>
          <h1 className={styles.heroTitle}>월간 출력현황 편집기</h1>
          <p className={styles.heroDescription}>
            10명 이상도 한 화면에서 수정하기 쉽게 상단은 압축하고 표 영역은 최대한 넓혔습니다.
          </p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => setDenseMode((prev) => !prev)}>
            {denseMode ? "여백 보기" : "집중 편집"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setShowSummary((prev) => !prev)}>
            {showSummary ? "월요약 접기" : "월요약 펼치기"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={addPerson}>인원 추가</button>
          <button type="button" className={styles.secondaryButton} onClick={() => addPeople(5)}>5명 추가</button>
          <button type="button" className={styles.secondaryButton} onClick={() => addPeople(10)}>10명 추가</button>
          <button
            type="button"
            className={focusMode ? styles.primaryButton : styles.secondaryButton}
            onClick={() => {
              if (!focusMode) setFocusedPersonId((prev) => prev ?? persons[0]?.id ?? null);
              setFocusMode((prev) => !prev);
            }}
          >
            {focusMode ? "테이블 모드" : "포커스 모드"}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => void downloadXlsx()}>엑셀 저장</button>
          <button type="button" className={styles.primaryButton} disabled={downloading} onClick={() => void downloadPng()}>
            {downloading ? "PNG 생성 중…" : "카톡용 PNG"}
          </button>
        </div>
      </section>

      <section className={`${styles.controlGrid} ${denseMode ? styles.controlGridDense : ""}`}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>기본 설정</h2>
              <p className={styles.panelMeta}>툴바처럼 고정해서 쓰는 영역입니다.</p>
            </div>
          </div>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>기준 월</span>
              <input className={styles.textInput} value={ym} onChange={(e) => setYm(e.target.value)} placeholder="YYYY-MM" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>현장명</span>
              <input className={styles.textInput} value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="현장명" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>제목</span>
              <input className={styles.textInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
            </label>
          </div>
        </div>

        <div className={`${styles.panel} ${showSummary ? "" : styles.panelCollapsed}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>월 요약</h2>
              <p className={styles.panelMeta}>필요할 때만 펼쳐서 확인하면 됩니다.</p>
            </div>
            <button type="button" className={styles.sectionToggleButton} onClick={() => setShowSummary((prev) => !prev)}>
              {showSummary ? "월요약 접기" : "월요약 펼치기"}
            </button>
          </div>
          <div className={`${styles.statGrid} ${showSummary ? "" : styles.hiddenSection}`}>
            {statCards.map((card) => (
              <div key={card.label} className={styles.statCard}>
                <span className={styles.statLabel}>{card.label}</span>
                <strong className={styles.statValue}>{card.value || 0}</strong>
                <span className={styles.statUnit}>{card.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.panel} ${showOverview ? "" : styles.panelCollapsed}`}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>인원 개요</h2>
            <p className={styles.panelMeta}>실무 입력 중에는 접어두고 필요할 때만 확인하세요.</p>
          </div>
          <button type="button" className={styles.sectionToggleButton} onClick={() => setShowOverview((prev) => !prev)}>
            {showOverview ? "인원개요 접기" : "인원개요 펼치기"}
          </button>
        </div>
        <div className={`${styles.personGrid} ${showOverview ? "" : styles.hiddenSection}`}>
          {personSummaries.map((person) => (
            <div key={person.id} className={styles.personCard}>
              <div className={styles.personCardTop}>
                <div>
                  <strong className={styles.personName}>{person.label}</strong>
                  <p className={styles.personRole}>{person.role}</p>
                </div>
                <span className={styles.personBadge}>{person.total || 0}h</span>
              </div>
              <div className={styles.personMetrics}>
                <span>주간 {person.day || 0}</span>
                <span>조출 {person.early || 0}</span>
                <span>점심 {person.lunch || 0}</span>
                <span>연장 {person.ot || 0}</span>
                <span>야간 {person.night || 0}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {focusMode && (
        <section className={styles.panel}>
          <div className={styles.focusModeWrap}>
            <div className={styles.focusPersonList}>
              {persons.map((p) => {
                const filled = personFilledDays(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.focusPersonItem} ${p.id === focusedPersonId ? styles.focusPersonActive : ""}`}
                    onClick={() => setFocusedPersonId(p.id)}
                  >
                    <span className={`${styles.focusDot} ${filled > 0 ? styles.focusDotOn : ""}`} />
                    <div className={styles.focusPersonInfo}>
                      <strong>{p.name || "이름 없음"}</strong>
                      {p.role && <small>{p.role}</small>}
                    </div>
                    {filled > 0 && <span className={styles.focusCount}>{filled}일</span>}
                  </button>
                );
              })}
            </div>
            <div className={styles.focusGridWrap}>
              {focusedPerson ? (
                <>
                  <div className={styles.focusGridHeader}>
                    <button type="button" className={styles.focusNavBtn} onClick={() => navigatePerson(-1)}>◀ 이전</button>
                    <div className={styles.focusPersonTitle}>
                      <strong>{focusedPerson.name || "이름 없음"}</strong>
                      {focusedPerson.role && <span>{focusedPerson.role}</span>}
                    </div>
                    <button type="button" className={styles.focusNavBtn} onClick={() => navigatePerson(1)}>다음 ▶</button>
                  </div>
                  <div className={styles.focusTableWrap}>
                    <table className={styles.focusTable}>
                      <thead>
                        <tr>
                          <th className={styles.focusCorner}>구분</th>
                          {dayCols.map((d) => {
                            const dow = new Date(y, m - 1, d).getDay();
                            return (
                              <th key={d} className={`${styles.focusDayHead} ${dow === 0 ? styles.holidayCell : ""}`}>{d}</th>
                            );
                          })}
                        </tr>
                        <tr>
                          <th className={styles.focusCorner} />
                          {dayCols.map((d) => {
                            const dow = new Date(y, m - 1, d).getDay();
                            return (
                              <th key={`dow-${d}`} className={`${styles.focusDaySubHead} ${dow === 0 ? styles.holidayCell : ""}`}>
                                {["일", "월", "화", "수", "목", "금", "토"][dow]}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {TYPE_ROWS.map(({ label, type }, ti) => (
                          <tr key={type}>
                            <td className={styles.focusTypeCell}>{label}</td>
                            {dayCols.map((d, di) => {
                              const k = keyOf(focusedPerson.id, d, type);
                              const dow = new Date(y, m - 1, d).getDay();
                              return (
                                <td key={k} className={`${styles.focusValueCell} ${dow === 0 ? styles.holidayCell : ""}`}>
                                  <input
                                    data-focus-cell={`${ti}-${di}`}
                                    className={styles.focusCellInput}
                                    value={values[k] ?? ""}
                                    onChange={(e) => setCell(focusedPerson.id, d, type, e.target.value)}
                                    onKeyDown={(e) => handleFocusCellKey(e, ti, di)}
                                    inputMode="decimal"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.focusSumArea}>
                    <SumBox personId={focusedPerson.id} lastDay={lastDay} values={values} />
                  </div>
                </>
              ) : (
                <p className={styles.focusEmpty}>왼쪽에서 인원을 선택하세요.</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className={`${styles.panel} ${focusMode ? styles.hiddenSection : ""}`}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>월간 입력 테이블</h2>
            <p className={styles.panelMeta}>엑셀처럼 한 번에 많이 보고 수정할 수 있게 표 중심으로 배치했습니다.</p>
          </div>
          <div className={styles.legend}>
            <span className={styles.legendChip}>인원 {persons.length}명</span>
            <span className={`${styles.legendChip} ${styles.legendSunday}`}>일요일 열</span>
            <span className={`${styles.legendChip} ${styles.legendSummary}`}>합계 영역</span>
          </div>
        </div>

        <div className={`${styles.tableWrap} ${denseMode ? styles.tableWrapDense : ""}`}>
          <table className={`${styles.table} ${denseMode ? styles.tableDense : ""}`}>
            <thead>
              <tr>
                <th className={`${styles.headerCell} ${styles.cornerHead} ${styles.stickyName} ${styles.stickyHead}`} rowSpan={2}>성명(직책)</th>
                <th className={`${styles.headerCell} ${styles.cornerHead} ${styles.stickyType} ${styles.stickyHead}`} rowSpan={2}>구분</th>
                {dayCols.map((d) => {
                  const dow = new Date(y, m - 1, d).getDay();
                  return (
                    <th key={d} className={`${styles.headerCell} ${styles.dayHead} ${dow === 0 ? styles.holidayCell : ""}`}>
                      {d}
                    </th>
                  );
                })}
                <th className={`${styles.headerCell} ${styles.sideHead} ${styles.stickyHead}`} rowSpan={2}>비고</th>
                <th className={`${styles.headerCell} ${styles.sideHead} ${styles.stickyHead}`} rowSpan={2}>총 추가근무</th>
              </tr>
              <tr>
                {dayCols.map((d) => {
                  const dow = new Date(y, m - 1, d).getDay();
                  return (
                    <th key={`dow-${d}`} className={`${styles.headerCell} ${styles.daySubHead} ${dow === 0 ? styles.holidayCell : ""}`}>
                      {["일", "월", "화", "수", "목", "금", "토"][dow]}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {persons.map((p, index) => {
                const toneClass = styles[toneClasses[index % toneClasses.length]];
                return (
                <React.Fragment key={p.id}>
                  <tr className={styles.personFirstRow}>
                    <td className={`${styles.nameCell} ${styles.stickyName} ${toneClass}`} rowSpan={5}>
                      <div className={styles.nameEditor}>
                        <input
                          className={styles.personInput}
                          value={p.name}
                          onChange={(e) => setPersons((prev) => prev.map((item) => (item.id === p.id ? { ...item, name: e.target.value } : item)))}
                          placeholder="이름"
                        />
                        <input
                          className={styles.personInput}
                          value={p.role ?? ""}
                          onChange={(e) => setPersons((prev) => prev.map((item) => (item.id === p.id ? { ...item, role: e.target.value } : item)))}
                          placeholder="직책"
                        />
                        <button type="button" className={styles.rowDeleteBtn} onClick={() => removePerson(p.id)}>삭제</button>
                      </div>
                    </td>
                    <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>주간(시간)</td>
                    {dayCols.map((d) => {
                      const dow = new Date(y, m - 1, d).getDay();
                      const k = keyOf(p.id, d, "day");
                      return (
                        <td key={k} className={`${styles.valueCell} ${dow === 0 ? styles.holidayCell : ""}`}>
                          <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, d, "day", e.target.value)} inputMode="decimal" />
                        </td>
                      );
                    })}
                    <td className={`${styles.noteCell} ${toneClass}`} rowSpan={5}>
                      <input
                        className={styles.noteInput}
                        value={p.note ?? ""}
                        onChange={(e) => setPersons((prev) => prev.map((item) => (item.id === p.id ? { ...item, note: e.target.value } : item)))}
                        placeholder="비고"
                      />
                    </td>
                    <td className={`${styles.sumCell} ${toneClass}`} rowSpan={5}>
                      <SumBox personId={p.id} lastDay={lastDay} values={values} />
                    </td>
                  </tr>
                  <tr>
                    <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>조출(시간)</td>
                    {dayCols.map((d) => {
                      const dow = new Date(y, m - 1, d).getDay();
                      const k = keyOf(p.id, d, "early");
                      return (
                        <td key={k} className={`${styles.valueCell} ${dow === 0 ? styles.holidayCell : ""}`}>
                          <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, d, "early", e.target.value)} inputMode="decimal" />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>점심(시간)</td>
                    {dayCols.map((d) => {
                      const dow = new Date(y, m - 1, d).getDay();
                      const k = keyOf(p.id, d, "lunch");
                      return (
                        <td key={k} className={`${styles.valueCell} ${dow === 0 ? styles.holidayCell : ""}`}>
                          <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, d, "lunch", e.target.value)} inputMode="decimal" />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>연장(시간)</td>
                    {dayCols.map((d) => {
                      const dow = new Date(y, m - 1, d).getDay();
                      const k = keyOf(p.id, d, "ot");
                      return (
                        <td key={k} className={`${styles.valueCell} ${dow === 0 ? styles.holidayCell : ""}`}>
                          <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, d, "ot", e.target.value)} inputMode="decimal" />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>야간(시간)</td>
                    {dayCols.map((d) => {
                      const dow = new Date(y, m - 1, d).getDay();
                      const k = keyOf(p.id, d, "night");
                      return (
                        <td key={k} className={`${styles.valueCell} ${dow === 0 ? styles.holidayCell : ""}`}>
                          <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, d, "night", e.target.value)} inputMode="decimal" />
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
              })}
            </tbody>
          </table>
        </div>

        <p className={styles.tip}>카톡 전송은 `카톡용 PNG`만 보내면 되고, 수정용 원본은 브라우저 로컬 저장으로 월별 유지됩니다.</p>
      </section>
    </div>
  );
}

function SumBox({ personId, lastDay, values }: { personId: string; lastDay: number; values: Record<string, string> }) {
  const early = sumType(personId, lastDay, values, "early");
  const lunch = sumType(personId, lastDay, values, "lunch");
  const ot = sumType(personId, lastDay, values, "ot");
  const night = sumType(personId, lastDay, values, "night");
  const total = early + lunch + ot + night;

  return (
    <div className={styles.sumBox}>
      <Line label="조출" value={early} />
      <Line label="점심" value={lunch} />
      <Line label="연장" value={ot} />
      <Line label="야간" value={night} />
      <div className={styles.sumDivider}>
        <Line label="총 추가근무" value={total} bold />
      </div>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`${styles.sumLine} ${bold ? styles.sumLineBold : ""}`}>
      <span>{label}</span>
      <span>{value || ""}</span>
    </div>
  );
}
