"use client";

// 항목별세부내역서 PDF — @react-pdf/renderer
// GabjiPdf.tsx 와 동일한 폰트·테두리 패턴 사용
//
// 출력 레이아웃:
//   제목 → 헤더 → 합계 → 카테고리별(헤더+항목) 반복
// 항목이 많으면 자동 다음 페이지로 이어짐

import React from "react";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import type { ItemData } from "./types";
import { CATEGORY_LABELS, fmtNum } from "./types";

// ── 한글 폰트 (GabjiPdf와 동일 경로) ───────────────────────────
Font.register({
  family: "NanumGothic",
  fonts: [
    { src: "/fonts/NanumGothic-Regular.ttf", fontWeight: "normal" },
    { src: "/fonts/NanumGothic-Bold.ttf",    fontWeight: "bold"   },
  ],
});

// ── 컬럼 너비 ───────────────────────────────────────────────────
const CW = {
  no:    "8%",
  date:  "10%",
  name:  "35%",
  qty:   "7%",
  unit:  "7%",
  price: "16%",
  amt:   "17%",
} as const;

// ── 행 높이 (동적 계산용 기본값 — 실제 사용 안 함) ──────────────
const ROW_TH   = 24;
const ROW_TOT  = 24;
const ROW_CAT  = 22;
const ROW_ITEM = 19;

// ── 테두리 ──────────────────────────────────────────────────────
const B_IN: Record<string, unknown> = {
  borderRightWidth:  0.5, borderRightColor:  "#888", borderRightStyle:  "solid",
  borderBottomWidth: 0.5, borderBottomColor: "#888", borderBottomStyle: "solid",
};
const B_OUT = { borderWidth: 1.5, borderColor: "#000", borderStyle: "solid" as const };

// ── 스타일 (행 높이는 동적으로 주입) ────────────────────────────
const S_BASE = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 7.5,
    color: "#000",
    paddingTop: 32, paddingBottom: 28,
    paddingLeft: 28, paddingRight: 28,
  },
  title: {
    textAlign: "center", fontSize: 14, fontWeight: "bold",
    letterSpacing: 3, height: 32, justifyContent: "center",
    alignItems: "center", marginBottom: 4,
  },
  row: { flexDirection: "row" },
});

function makeS(rTH: number, rTot: number, rCat: number, rItem: number) {
  const fs = Math.max(5.5, Math.min(7, rItem * 0.42)); // 행 높이 비례 폰트
  return {
    thCell:      { ...B_IN, height: rTH,   backgroundColor: "#ebebeb", fontWeight: "bold" as const,  fontSize: Math.max(5.5, fs * 0.95), textAlign: "center" as const,  justifyContent: "center" as const, alignItems: "center" as const, paddingLeft: 2, paddingRight: 2 },
    totLabelCell:{ ...B_IN, height: rTot,  backgroundColor: "#f0f0f0", fontWeight: "bold" as const,  fontSize: Math.max(6,   fs * 1.1),  textAlign: "center" as const,  justifyContent: "center" as const, alignItems: "center" as const },
    totAmtCell:  { ...B_IN, height: rTot,  backgroundColor: "#f0f0f0", fontWeight: "bold" as const,  fontSize: Math.max(6,   fs),        textAlign: "right" as const,   justifyContent: "center" as const, paddingLeft: 4, paddingRight: 5 },
    catCell:     { ...B_IN, height: rCat,  backgroundColor: "#f7f7f7", fontWeight: "bold" as const,  fontSize: Math.max(6,   fs),        justifyContent: "center" as const, paddingLeft: 5, paddingRight: 4 },
    catAmtCell:  { ...B_IN, height: rCat,  backgroundColor: "#f7f7f7", fontWeight: "bold" as const,  fontSize: Math.max(6,   fs),        textAlign: "right" as const,   justifyContent: "center" as const, paddingLeft: 4, paddingRight: 5 },
    dataCell:    { ...B_IN, height: rItem, fontSize: fs, textAlign: "center" as const, justifyContent: "center" as const, paddingLeft: 2, paddingRight: 2 },
    dataCellL:   { ...B_IN, height: rItem, fontSize: fs, justifyContent: "center" as const, paddingLeft: 4, paddingRight: 3 },
    dataCellR:   { ...B_IN, height: rItem, fontSize: fs, textAlign: "right" as const,  justifyContent: "center" as const, paddingLeft: 3, paddingRight: 4 },
  };
}

// ── 셀 스타일 조합 (noRight / noBottom) ─────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cx(base: any, extra: any = {}, nr = false, nb = false): any {
  return {
    ...base, ...extra,
    ...(nr ? { borderRightWidth:  0 } : {}),
    ...(nb ? { borderBottomWidth: 0 } : {}),
  };
}

interface Props { items: ItemData[] }

// ── A4 가용 높이 계산 ────────────────────────────────────────────
const A4_H_PT    = 841.89;              // A4 세로 (pt)
const PAD_V      = 32 + 28;            // paddingTop + paddingBottom
const TITLE_H    = 36;                 // 제목 height + marginBottom
const AVAIL_H    = A4_H_PT - PAD_V - TITLE_H; // ≈ 745pt

const EMPTY_ROWS = 2; // 빈 카테고리 기본 행 수

/** 전체 행 수를 세서 한 장에 꼭 맞는 행 높이를 반환 */
function calcRowH(grouped: Map<number, ItemData[]>) {
  // 고정 행: 열헤더 1 + 합계 1
  let fixed = 2;
  // 각 카테고리: 카테고리헤더 1 + 항목(또는 빈행)
  for (let n = 1; n <= 9; n++) {
    const rows = grouped.get(n)?.length ?? 0;
    fixed += 1 + Math.max(rows, EMPTY_ROWS);
  }
  // 카테고리헤더·열헤더·합계는 항목행 대비 약 1.25배 높이
  // totalH = (fixed - 9 - 2) * rItem + (9 + 2) * rItem * 1.25 = fixed * rItem + 11 * rItem * 0.25
  // → rItem = AVAIL_H / (fixed + 11 * 0.25)
  const rItem = Math.floor(AVAIL_H / (fixed + 11 * 0.25));
  return {
    rItem: Math.min(rItem, ROW_ITEM),        // 너무 크면 기본값 상한
    rCat:  Math.min(Math.round(rItem * 1.2), ROW_CAT),
    rTH:   Math.min(Math.round(rItem * 1.3), ROW_TH),
    rTot:  Math.min(Math.round(rItem * 1.3), ROW_TOT),
  };
}

export default function ItemListPdf({ items }: Props) {
  const grandTotal = items.reduce((s, i) => s + i.amount, 0);

  // 카테고리별 그룹
  const grouped = new Map<number, ItemData[]>();
  for (let n = 1; n <= 9; n++) grouped.set(n, []);
  for (const item of items) grouped.get(item.categoryNo)?.push(item);

  const allCategories = Array.from(grouped.entries());

  // 동적 행 높이 + 스타일
  const { rItem, rCat, rTH, rTot } = calcRowH(grouped);
  const S = { ...S_BASE, ...makeS(rTH, rTot, rCat, rItem) };

  // 마지막 행 판별 (하단 이중 테두리 방지)
  const cat9Items = grouped.get(9) ?? [];
  const lastItemId = cat9Items.length > 0
    ? cat9Items[cat9Items.length - 1].id : null;

  return (
    <Document>
      <Page size="A4" style={S_BASE.page}>

        {/* ── 제목 ── */}
        <View style={S_BASE.title}>
          <Text>항목별 세부내역서</Text>
        </View>

        {/* ── 테이블 ── */}
        <View style={B_OUT}>

          {/* 열 헤더 */}
          <View style={S_BASE.row}>
            <View style={cx(S.thCell, { width: CW.no   })}>
              <Text>번호</Text>
            </View>
            <View style={cx(S.thCell, { width: CW.date })}>
              <Text>사용일자</Text>
            </View>
            <View style={cx(S.thCell, { width: CW.name })}>
              <Text>품명 / 규격</Text>
            </View>
            <View style={cx(S.thCell, { width: CW.qty  })}>
              <Text>수량</Text>
            </View>
            <View style={cx(S.thCell, { width: CW.unit })}>
              <Text>단위</Text>
            </View>
            <View style={cx(S.thCell, { width: CW.price})}>
              <Text>단가</Text>
            </View>
            <View style={cx(S.thCell, { width: CW.amt  }, true)}>
              <Text>금액</Text>
            </View>
          </View>

          {/* 합계 행 */}
          <View style={S_BASE.row}>
            <View style={cx(S.totLabelCell, { flex: 1 })}>
              <Text>합  계</Text>
            </View>
            <View style={cx(S.totAmtCell, { width: CW.amt }, true)}>
              <Text>{fmtNum(grandTotal)}</Text>
            </View>
          </View>

          {/* 카테고리별 항목 (9개 모두 표시) */}
          {allCategories.map(([catNo, catItems]) => {
            const catTotal = catItems.reduce((s, i) => s + i.amount, 0);
            const isEmpty = catItems.length === 0;
            const isLastCat = catNo === 9;
            return (
              <View key={catNo}>
                {/* 카테고리 헤더 */}
                <View style={S_BASE.row}>
                  <View style={cx(S.catCell, { flex: 1 })}>
                    <Text>{catNo}. {CATEGORY_LABELS[catNo]}</Text>
                  </View>
                  <View style={cx(S.catAmtCell, { width: CW.amt }, true)}>
                    <Text>{catTotal > 0 ? fmtNum(catTotal) : ""}</Text>
                  </View>
                </View>

                {/* 항목 행 */}
                {isEmpty
                  ? /* 빈 카테고리: 기본 4행 */
                    Array.from({ length: EMPTY_ROWS }, (_, i) => {
                      const isLast = isLastCat && i === EMPTY_ROWS - 1;
                      return (
                        <View key={`empty-${i}`} style={S_BASE.row}>
                          <View style={cx(S.dataCell,  { width: CW.no    }, false, isLast)}><Text> </Text></View>
                          <View style={cx(S.dataCell,  { width: CW.date  }, false, isLast)}><Text> </Text></View>
                          <View style={cx(S.dataCellL, { width: CW.name  }, false, isLast)}><Text> </Text></View>
                          <View style={cx(S.dataCell,  { width: CW.qty   }, false, isLast)}><Text> </Text></View>
                          <View style={cx(S.dataCell,  { width: CW.unit  }, false, isLast)}><Text> </Text></View>
                          <View style={cx(S.dataCellR, { width: CW.price }, false, isLast)}><Text> </Text></View>
                          <View style={cx(S.dataCellR, { width: CW.amt   }, true,  isLast)}><Text> </Text></View>
                        </View>
                      );
                    })
                  : /* 실제 항목 */
                    catItems.map((item, idx) => {
                      const isLast = item.id === lastItemId;
                      return (
                        <View key={item.id} style={S_BASE.row}>
                          <View style={cx(S.dataCell,  { width: CW.no    }, false, isLast)}>
                            <Text>{item.evidenceNo || `NO.${idx + 1}`}</Text>
                          </View>
                          <View style={cx(S.dataCell,  { width: CW.date  }, false, isLast)}>
                            <Text>{item.usageDate}</Text>
                          </View>
                          <View style={cx(S.dataCellL, { width: CW.name  }, false, isLast)}>
                            <Text>{item.name}</Text>
                          </View>
                          <View style={cx(S.dataCell,  { width: CW.qty   }, false, isLast)}>
                            <Text>{item.quantity ? fmtNum(item.quantity) : ""}</Text>
                          </View>
                          <View style={cx(S.dataCell,  { width: CW.unit  }, false, isLast)}>
                            <Text>{item.unit}</Text>
                          </View>
                          <View style={cx(S.dataCellR, { width: CW.price }, false, isLast)}>
                            <Text>{item.unitPrice ? fmtNum(item.unitPrice) : ""}</Text>
                          </View>
                          <View style={cx(S.dataCellR, { width: CW.amt   }, true,  isLast)}>
                            <Text>{fmtNum(item.amount)}</Text>
                          </View>
                        </View>
                      );
                    })
                }
              </View>
            );
          })}

        </View>

      </Page>
    </Document>
  );
}
