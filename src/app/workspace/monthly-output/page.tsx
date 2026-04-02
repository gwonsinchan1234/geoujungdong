"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabaseClient";
import {
  buildMonthlyOutputHtml,
  type DayEntry,
  type MonthlyOutputCellKey,
  type MonthlyOutputData,
  type MonthlyOutputPerson,
} from "@/lib/monthlyOutputTemplate";

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultEnd(): string {
  const d = new Date();
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
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

function sumType(
  personId: string,
  dayKeys: string[],
  values: Record<string, string>,
  type: "day" | "early" | "lunch" | "ot" | "night",
) {
  let total = 0;
  for (const dateStr of dayKeys) {
    total += numFromCell(values[`${personId}__${dateStr}__${type}`]);
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
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const globalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rangeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 날짜 범위 → DayEntry 배열 ──────────────────────────────
  const dayCols = useMemo((): DayEntry[] => {
    const result: DayEntry[] = [];
    const s = new Date(startDate + "T00:00:00");
    const e = new Date(endDate + "T00:00:00");
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return result;
    const cur = new Date(s);
    while (cur <= e) {
      const y = cur.getFullYear();
      const m = cur.getMonth() + 1;
      const d = cur.getDate();
      result.push({
        dateStr: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        y, m, d,
        dow: cur.getDay(),
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [startDate, endDate]);

  const multiMonth = useMemo(
    () => dayCols.length > 0 && dayCols[0].m !== dayCols[dayCols.length - 1].m,
    [dayCols],
  );

  const dayKeys = useMemo(() => dayCols.map((d) => d.dateStr), [dayCols]);

  const keyOf = useCallback(
    (personId: string, dateStr: string, type: "day" | "early" | "lunch" | "ot" | "night") =>
      `${personId}__${dateStr}__${type}` as MonthlyOutputCellKey,
    [],
  );

  const setCell = useCallback(
    (personId: string, dateStr: string, type: "day" | "early" | "lunch" | "ot" | "night", v: string) => {
      const k = keyOf(personId, dateStr, type);
      setValues((prev) => ({ ...prev, [k]: v }));
    },
    [keyOf],
  );

  // ── LocalStorage ───────────────────────────────────────────
  const lsKey = useMemo(() => `monthly_output_${startDate}_${endDate}`, [startDate, endDate]);

  // ── 저장 헬퍼 ──────────────────────────────────────────────
  const saveGlobalToSupabase = useCallback(async (
    p: MonthlyOutputPerson[], t: string, s: string,
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaveStatus("saving");
    await supabase.from("monthly_output_settings").upsert({
      user_id: user.id, persons: p, title: t, site_name: s,
      updated_at: new Date().toISOString(),
    });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, []);

  const saveRangeToSupabase = useCallback(async (
    vals: Record<string, string>, sd: string, ed: string,
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaveStatus("saving");
    await supabase.from("monthly_output_ranges").upsert({
      user_id: user.id, start_date: sd, end_date: ed, values: vals,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,start_date,end_date" });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, []);

  // 인원/제목/현장명: localStorage 즉시 + Supabase 2초 디바운스
  useEffect(() => {
    try { localStorage.setItem("monthly_output_global", JSON.stringify({ persons, title, siteName })); } catch {}
    if (globalTimer.current) clearTimeout(globalTimer.current);
    globalTimer.current = setTimeout(() => { void saveGlobalToSupabase(persons, title, siteName); }, 2000);
  }, [persons, title, siteName, saveGlobalToSupabase]);

  // 셀 데이터: localStorage 즉시 + Supabase 2초 디바운스
  useEffect(() => {
    try { localStorage.setItem(lsKey, JSON.stringify({ values })); } catch {}
    if (rangeTimer.current) clearTimeout(rangeTimer.current);
    rangeTimer.current = setTimeout(() => { void saveRangeToSupabase(values, startDate, endDate); }, 2000);
  }, [lsKey, values, startDate, endDate, saveRangeToSupabase]);

  // 최초 마운트: Supabase → localStorage 순서로 전역 설정 로드
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("monthly_output_settings")
            .select("persons, title, site_name")
            .eq("user_id", user.id)
            .single();
          if (data) {
            if (Array.isArray(data.persons) && data.persons.length) setPersons(data.persons as MonthlyOutputPerson[]);
            if (data.title) setTitle(data.title as string);
            if (data.site_name) setSiteName(data.site_name as string);
            return;
          }
        }
      } catch {}
      // Supabase 실패 시 localStorage fallback
      try {
        const raw = localStorage.getItem("monthly_output_global");
        if (!raw) return;
        const parsed = JSON.parse(raw) as { persons?: MonthlyOutputPerson[]; title?: string; siteName?: string; };
        if (parsed.persons?.length) setPersons(parsed.persons);
        if (typeof parsed.title === "string") setTitle(parsed.title);
        if (typeof parsed.siteName === "string") setSiteName(parsed.siteName);
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 날짜 범위 변경: Supabase → localStorage 순서로 셀 데이터 로드
  const loadRangeValues = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("monthly_output_ranges")
          .select("values")
          .eq("user_id", user.id)
          .eq("start_date", startDate)
          .eq("end_date", endDate)
          .single();
        if (data?.values) {
          setValues(data.values as Record<MonthlyOutputCellKey, string>);
          return;
        }
      }
    } catch {}
    // Supabase 실패 시 localStorage fallback
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { values?: Record<MonthlyOutputCellKey, string>; };
        if (parsed.values) { setValues(parsed.values); return; }
      }
    } catch {}
    setValues({});
  }, [lsKey, startDate, endDate]);

  useEffect(() => { void loadRangeValues(); }, [loadRangeValues]);

  // ── 집계 ──────────────────────────────────────────────────
  const filledPersons = useMemo(() => persons.filter((p) => p.name.trim()), [persons]);

  const data: MonthlyOutputData = useMemo(() => ({
    title, siteName, startDate, endDate,
    days: dayCols,
    persons: filledPersons,
    values,
  }), [title, siteName, startDate, endDate, dayCols, filledPersons, values]);

  const personSummaries = useMemo(() => {
    return persons.map((person) => {
      const day   = sumType(person.id, dayKeys, values, "day");
      const early = sumType(person.id, dayKeys, values, "early");
      const lunch = sumType(person.id, dayKeys, values, "lunch");
      const ot    = sumType(person.id, dayKeys, values, "ot");
      const night = sumType(person.id, dayKeys, values, "night");
      return {
        id: person.id,
        label: person.name.trim() || "이름 없음",
        role: person.role?.trim() || "직책 미입력",
        early, lunch, day, ot, night,
        total: early + lunch + ot + night,
      };
    });
  }, [dayKeys, persons, values]);

  const personLeaves = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of persons) {
      map[p.id] = dayKeys.filter(
        (dateStr) => (values[`${p.id}__${dateStr}__day` as MonthlyOutputCellKey] ?? "") === "연차"
      ).length;
    }
    return map;
  }, [persons, dayKeys, values]);

  const statCards = useMemo(() => {
    const totals = personSummaries.reduce(
      (acc, item) => { acc.day += item.day; acc.ot += item.ot; acc.night += item.night; acc.total += item.total; return acc; },
      { day: 0, ot: 0, night: 0, total: 0 },
    );
    return [
      { label: "입력 인원", value: filledPersons.length, unit: `전체 ${persons.length}명` },
      { label: "주간 합계", value: totals.day, unit: "시간" },
      { label: "조출 합계", value: personSummaries.reduce((a, i) => a + i.early, 0), unit: "시간" },
      { label: "점심 합계", value: personSummaries.reduce((a, i) => a + i.lunch, 0), unit: "시간" },
      { label: "연장 합계", value: totals.ot, unit: "시간" },
      { label: "야간 합계", value: totals.night, unit: "시간" },
      { label: "총 추가근무", value: personSummaries.reduce((a, i) => a + i.total, 0), unit: "시간" },
    ];
  }, [filledPersons.length, personSummaries, persons.length]);

  // ── 포커스 모드 ────────────────────────────────────────────
  const focusedPerson = useMemo(
    () => persons.find((p) => p.id === focusedPersonId) ?? null,
    [persons, focusedPersonId],
  );

  const personFilledDays = useCallback(
    (personId: string) => {
      let count = 0;
      for (const dateStr of dayKeys) {
        if (TYPE_ROWS.some(({ type }) => !!values[keyOf(personId, dateStr, type)])) count++;
      }
      return count;
    },
    [dayKeys, values, keyOf],
  );

  const navigatePerson = useCallback(
    (dir: 1 | -1) => {
      const idx = persons.findIndex((p) => p.id === focusedPersonId);
      const next = persons[idx + dir];
      if (next) setFocusedPersonId(next.id);
    },
    [focusedPersonId, persons],
  );

  const handleFocusCellKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, ti: number, di: number) => {
      const move = (nTi: number, nDi: number) => {
        const el = document.querySelector<HTMLInputElement>(`[data-focus-cell="${nTi}-${nDi}"]`);
        if (el) { e.preventDefault(); el.focus(); el.select(); }
      };
      if (e.key === "ArrowDown")       move(Math.min(ti + 1, TYPE_ROWS.length - 1), di);
      else if (e.key === "ArrowUp")    move(Math.max(ti - 1, 0), di);
      else if (e.key === "ArrowRight") move(ti, Math.min(di + 1, dayCols.length - 1));
      else if (e.key === "ArrowLeft")  move(ti, Math.max(di - 1, 0));
    },
    [dayCols.length],
  );

  // ── 즉시 저장 ─────────────────────────────────────────────
  const saveAll = useCallback(async () => {
    if (globalTimer.current) clearTimeout(globalTimer.current);
    if (rangeTimer.current)  clearTimeout(rangeTimer.current);
    await Promise.all([
      saveGlobalToSupabase(persons, title, siteName),
      saveRangeToSupabase(values, startDate, endDate),
    ]);
  }, [persons, title, siteName, values, startDate, endDate, saveGlobalToSupabase, saveRangeToSupabase]);

  // ── 주간 O 채우기 ──────────────────────────────────────────
  const fillDayO = useCallback(
    (personId: string) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const day of dayCols) {
          if (day.dow === 0) continue; // 일요일 제외
          const k = `${personId}__${day.dateStr}__day` as MonthlyOutputCellKey;
          if (!next[k]) next[k] = "O" as never;
        }
        return next;
      });
    },
    [dayCols],
  );

  // ── 다운로드 ───────────────────────────────────────────────
  const downloadXlsx = useCallback(async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("월간출력현황");

    const cols = [
      { header: "성명(직책)", width: 16 },
      { header: "구분", width: 12 },
      ...dayCols.map((day) => ({ header: multiMonth ? `${day.m}/${day.d}` : String(day.d), width: 3 })),
      { header: "비고", width: 14 },
      { header: "총 추가근무", width: 12 },
    ];
    ws.columns = cols as never[];

    const thin = { style: "thin", color: { argb: "FF111111" } } as const;
    const border = { top: thin, left: thin, bottom: thin, right: thin } as const;

    ws.mergeCells(1, 1, 1, cols.length);
    ws.getCell(1, 1).value = `${startDate} ~ ${endDate} ${title}${siteName ? ` ${siteName}` : ""}`.trim();
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
      ws.mergeCells(r, 1, r + 4, 1);
      ws.mergeCells(r, cols.length - 1, r + 4, cols.length - 1);
      ws.mergeCells(r, cols.length, r + 4, cols.length);

      ws.getCell(r, 1).value = p.role?.trim() ? `${p.name}\n${p.role}` : p.name;
      ws.getCell(r, 1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      ws.getCell(r, 1).font = { bold: true, size: 10 };
      ws.getCell(r, cols.length - 1).value = p.note ?? "";
      ws.getCell(r, cols.length - 1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

      let sumEarly = 0, sumLunch = 0, sumOt = 0, sumNight = 0;

      const blocks: Array<{ label: string; type: "day" | "early" | "lunch" | "ot" | "night" }> = [
        { label: "주간(시간)", type: "day" },
        { label: "조출(시간)", type: "early" },
        { label: "점심(시간)", type: "lunch" },
        { label: "연장(시간)", type: "ot" },
        { label: "야간(시간)", type: "night" },
      ];

      for (let i = 0; i < blocks.length; i++) {
        const row = ws.getRow(r + i);
        row.height = 16;
        row.getCell(2).value = blocks[i].label;
        row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2FF" } };
        row.getCell(2).font = { bold: true, size: 10 };

        for (let di = 0; di < dayCols.length; di++) {
          const day = dayCols[di];
          const v = values[keyOf(p.id, day.dateStr, blocks[i].type)] ?? "";
          const cell = row.getCell(3 + di);
          cell.value = v || "";
          cell.alignment = { horizontal: "center", vertical: "middle" };
          if (day.dow === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFECACA" } };
          const n = numFromCell(v);
          if (blocks[i].type === "early") sumEarly += n;
          if (blocks[i].type === "lunch") sumLunch += n;
          if (blocks[i].type === "ot")    sumOt    += n;
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
    dlBlob(
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `${startDate}_${endDate}_출력현황.xlsx`,
    );
  }, [dayCols, filledPersons, keyOf, multiMonth, siteName, startDate, endDate, title, values]);

  const downloadPng = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/monthly-output/png", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, fileName: `${startDate}_${endDate}_출력현황.png` }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `PNG 생성 실패 (${res.status})`);
      }
      dlBlob(await res.blob(), `${startDate}_${endDate}_출력현황.png`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "PNG 다운로드 실패");
    } finally {
      setDownloading(false);
    }
  }, [data, startDate, endDate]);

  const addPerson  = () => setPersons((prev) => [...prev, makePerson()]);
  const addPeople  = (count: number) => setPersons((prev) => [...prev, ...Array.from({ length: count }, () => makePerson())]);
  const removePerson = (id: string) => setPersons((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));

  // ── 렌더 ──────────────────────────────────────────────────
  return (
    <div className={`${styles.page} ${denseMode ? styles.pageDense : ""}`}>
      {/* Hero */}
      <section className={`${styles.hero} ${denseMode ? styles.heroDense : ""}`}>
        <div>
          <p className={styles.eyebrow}>Monthly Output</p>
          <h1 className={styles.heroTitle}>월간 출력현황 편집기</h1>
          <p className={styles.heroDescription}>
            10명 이상도 한 화면에서 수정하기 쉽게 상단은 압축하고 표 영역은 최대한 넓혔습니다.
          </p>
          {saveStatus === "saving" && <p className={styles.saveStatus}>저장 중…</p>}
          {saveStatus === "saved"  && <p className={`${styles.saveStatus} ${styles.saveStatusDone}`}>저장됨 ✓</p>}
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
          <button type="button" className={styles.primaryButton} onClick={() => void saveAll()}>저장하기</button>
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

      {/* 기본 설정 */}
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
              <span className={styles.fieldLabel}>시작 날짜</span>
              <input type="date" className={styles.textInput} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>종료 날짜</span>
              <input type="date" className={styles.textInput} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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

      {/* 인원 개요 */}
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

      {/* 포커스 모드 */}
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
                    <button type="button" className={styles.focusOFillBtn} onClick={() => fillDayO(focusedPerson.id)}>주간 O 채우기</button>
                    <button type="button" className={styles.focusNavBtn} onClick={() => navigatePerson(1)}>다음 ▶</button>
                  </div>
                  <div className={styles.focusTableWrap}>
                    <table className={styles.focusTable}>
                      <thead>
                        <tr>
                          <th className={styles.focusCorner}>구분</th>
                          {dayCols.map((day) => (
                            <th key={day.dateStr} className={`${styles.focusDayHead} ${day.dow === 0 ? styles.holidayCell : ""}`}>
                              {multiMonth ? `${day.m}/${day.d}` : day.d}
                            </th>
                          ))}
                        </tr>
                        <tr>
                          <th className={styles.focusCorner} />
                          {dayCols.map((day) => (
                            <th key={`dow-${day.dateStr}`} className={`${styles.focusDaySubHead} ${day.dow === 0 ? styles.holidayCell : ""}`}>
                              {["일", "월", "화", "수", "목", "금", "토"][day.dow]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {TYPE_ROWS.map(({ label, type }, ti) => (
                          <tr key={type}>
                            <td className={styles.focusTypeCell}>{label}</td>
                            {dayCols.map((day, di) => {
                              const k = keyOf(focusedPerson.id, day.dateStr, type);
                              const val = values[k] ?? "";
                              const isDay = type === "day";
                              return (
                                <td key={k} className={`${styles.focusValueCell} ${day.dow === 0 ? styles.holidayCell : ""} ${isDay && val === "O" ? styles.focusValueCellO : ""}`}>
                                  <input
                                    data-focus-cell={`${ti}-${di}`}
                                    className={`${styles.focusCellInput} ${isDay && val === "O" ? styles.focusCellInputO : ""}`}
                                    value={val}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setCell(focusedPerson.id, day.dateStr, type, isDay ? (v === "O" || v === "o" ? "O" : v.replace(/[Oo]/g, "")) : v);
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    onClick={isDay ? () => {
                                      if (val === "") setCell(focusedPerson.id, day.dateStr, "day", "O");
                                      else if (val === "O") setCell(focusedPerson.id, day.dateStr, "day", "");
                                    } : undefined}
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
                    <SumBox personId={focusedPerson.id} dayKeys={dayKeys} values={values} />
                  </div>
                </>
              ) : (
                <p className={styles.focusEmpty}>왼쪽에서 인원을 선택하세요.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 월간 입력 테이블 */}
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
                {dayCols.map((day) => (
                  <th key={day.dateStr} className={`${styles.headerCell} ${styles.dayHead} ${day.dow === 0 ? styles.holidayCell : ""}`}>
                    {multiMonth ? `${day.m}/${day.d}` : day.d}
                  </th>
                ))}
                <th className={`${styles.headerCell} ${styles.sideHead} ${styles.stickyHead}`} rowSpan={2}>비고</th>
                <th className={`${styles.headerCell} ${styles.sideHead} ${styles.stickyHead}`} rowSpan={2}>총 추가근무</th>
              </tr>
              <tr>
                {dayCols.map((day) => (
                  <th key={`dow-${day.dateStr}`} className={`${styles.headerCell} ${styles.daySubHead} ${day.dow === 0 ? styles.holidayCell : ""}`}>
                    {["일", "월", "화", "수", "목", "금", "토"][day.dow]}
                  </th>
                ))}
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
                          <button type="button" className={styles.rowOFillBtn} onClick={() => fillDayO(p.id)}>O 채우기</button>
                          <button type="button" className={styles.rowDeleteBtn} onClick={() => removePerson(p.id)}>삭제</button>
                        </div>
                      </td>
                      <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>주간(시간)</td>
                      {dayCols.map((day) => {
                        const k = keyOf(p.id, day.dateStr, "day");
                        const val = values[k] ?? "";
                        return (
                          <td key={k} className={`${styles.valueCell} ${day.dow === 0 ? styles.holidayCell : ""} ${val === "O" ? styles.valueCellO : ""}`}>
                            <input
                              className={`${styles.cellInput} ${val === "O" ? styles.cellInputO : ""}`}
                              value={val}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCell(p.id, day.dateStr, "day", v === "O" || v === "o" ? "O" : v.replace(/[Oo]/g, ""));
                              }}
                              onFocus={(e) => e.target.select()}
                              onClick={() => {
                                if (val === "") setCell(p.id, day.dateStr, "day", "O");
                                else if (val === "O") setCell(p.id, day.dateStr, "day", "");
                              }}
                              inputMode="decimal"
                            />
                          </td>
                        );
                      })}
                      <td className={`${styles.noteCell} ${toneClass}`} rowSpan={5}>
                        {(personLeaves[p.id] ?? 0) > 0 ? (
                          <input
                            className={`${styles.noteInput} ${styles.noteInputLeave}`}
                            value={`연차${personLeaves[p.id]}`}
                            readOnly
                          />
                        ) : (
                          <input
                            className={styles.noteInput}
                            value={p.note ?? ""}
                            onChange={(e) => setPersons((prev) => prev.map((item) => (item.id === p.id ? { ...item, note: e.target.value } : item)))}
                            placeholder="비고"
                          />
                        )}
                      </td>
                      <td className={`${styles.sumCell} ${toneClass}`} rowSpan={5}>
                        <SumBox personId={p.id} dayKeys={dayKeys} values={values} />
                      </td>
                    </tr>
                    <tr>
                      <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>조출(시간)</td>
                      {dayCols.map((day) => {
                        const k = keyOf(p.id, day.dateStr, "early");
                        return (
                          <td key={k} className={`${styles.valueCell} ${day.dow === 0 ? styles.holidayCell : ""}`}>
                            <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, day.dateStr, "early", e.target.value)} inputMode="decimal" />
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>점심(시간)</td>
                      {dayCols.map((day) => {
                        const k = keyOf(p.id, day.dateStr, "lunch");
                        return (
                          <td key={k} className={`${styles.valueCell} ${day.dow === 0 ? styles.holidayCell : ""}`}>
                            <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, day.dateStr, "lunch", e.target.value)} inputMode="decimal" />
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>연장(시간)</td>
                      {dayCols.map((day) => {
                        const k = keyOf(p.id, day.dateStr, "ot");
                        return (
                          <td key={k} className={`${styles.valueCell} ${day.dow === 0 ? styles.holidayCell : ""}`}>
                            <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, day.dateStr, "ot", e.target.value)} inputMode="decimal" />
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className={`${styles.typeCell} ${styles.stickyType} ${toneClass}`}>야간(시간)</td>
                      {dayCols.map((day) => {
                        const k = keyOf(p.id, day.dateStr, "night");
                        return (
                          <td key={k} className={`${styles.valueCell} ${day.dow === 0 ? styles.holidayCell : ""}`}>
                            <input className={styles.cellInput} value={values[k] ?? ""} onChange={(e) => setCell(p.id, day.dateStr, "night", e.target.value)} inputMode="decimal" />
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

        <p className={styles.tip}>카톡 전송은 `카톡용 PNG`만 보내면 되고, 수정용 원본은 브라우저 로컬 저장으로 날짜별 유지됩니다.</p>
      </section>
    </div>
  );
}

function SumBox({ personId, dayKeys, values }: { personId: string; dayKeys: string[]; values: Record<string, string> }) {
  const early = sumType(personId, dayKeys, values, "early");
  const lunch = sumType(personId, dayKeys, values, "lunch");
  const ot    = sumType(personId, dayKeys, values, "ot");
  const night = sumType(personId, dayKeys, values, "night");
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
