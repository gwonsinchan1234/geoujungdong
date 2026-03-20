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

// ── 행 높이 ─────────────────────────────────────────────────────
const ROW_TH   = 24; // 헤더
const ROW_TOT  = 24; // 합계
const ROW_CAT  = 22; // 카테고리
const ROW_ITEM = 19; // 항목

// ── 테두리 ──────────────────────────────────────────────────────
const B_IN: Record<string, unknown> = {
  borderRightWidth:  0.5, borderRightColor:  "#888", borderRightStyle:  "solid",
  borderBottomWidth: 0.5, borderBottomColor: "#888", borderBottomStyle: "solid",
};
const B_OUT = { borderWidth: 1.5, borderColor: "#000", borderStyle: "solid" as const };

// ── 스타일 ──────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 7.5,
    color: "#000",
    paddingTop: 32, paddingBottom: 28,
    paddingLeft: 28, paddingRight: 28,
  },
  title: {
    textAlign:   "center",
    fontSize:    14,
    fontWeight:  "bold",
    letterSpacing: 3,
    height:      32,
    justifyContent: "center",
    alignItems:  "center",
    marginBottom: 4,
  },
  row: { flexDirection: "row" },

  // 열 헤더
  thCell: {
    ...B_IN,
    height:          ROW_TH,
    backgroundColor: "#ebebeb",
    fontWeight:      "bold",
    fontSize:        7,
    textAlign:       "center",
    justifyContent:  "center",
    alignItems:      "center",
    paddingLeft: 2, paddingRight: 2,
  },
  // 합계 행 (라벨)
  totLabelCell: {
    ...B_IN,
    height:          ROW_TOT,
    backgroundColor: "#f0f0f0",
    fontWeight:      "bold",
    fontSize:        8.5,
    textAlign:       "center",
    justifyContent:  "center",
    alignItems:      "center",
  },
  // 합계 행 (금액)
  totAmtCell: {
    ...B_IN,
    height:          ROW_TOT,
    backgroundColor: "#f0f0f0",
    fontWeight:      "bold",
    fontSize:        8,
    textAlign:       "right",
    justifyContent:  "center",
    paddingLeft: 4, paddingRight: 5,
  },
  // 카테고리 행
  catCell: {
    ...B_IN,
    height:          ROW_CAT,
    backgroundColor: "#f7f7f7",
    fontWeight:      "bold",
    fontSize:        7.5,
    justifyContent:  "center",
    paddingLeft: 5, paddingRight: 4,
  },
  catAmtCell: {
    ...B_IN,
    height:          ROW_CAT,
    backgroundColor: "#f7f7f7",
    fontWeight:      "bold",
    fontSize:        7.5,
    textAlign:       "right",
    justifyContent:  "center",
    paddingLeft: 4, paddingRight: 5,
  },
  // 항목 행 — 가운데 정렬
  dataCell: {
    ...B_IN,
    height:         ROW_ITEM,
    fontSize:       7,
    textAlign:      "center",
    justifyContent: "center",
    paddingLeft: 2, paddingRight: 2,
  },
  // 항목 행 — 왼쪽 정렬 (품명)
  dataCellL: {
    ...B_IN,
    height:         ROW_ITEM,
    fontSize:       7,
    justifyContent: "center",
    paddingLeft: 4, paddingRight: 3,
  },
  // 항목 행 — 오른쪽 정렬 (금액)
  dataCellR: {
    ...B_IN,
    height:         ROW_ITEM,
    fontSize:       7,
    textAlign:      "right",
    justifyContent: "center",
    paddingLeft: 3, paddingRight: 4,
  },
});

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

export default function ItemListPdf({ items }: Props) {
  const grandTotal = items.reduce((s, i) => s + i.amount, 0);

  // 카테고리별 그룹
  const grouped = new Map<number, ItemData[]>();
  for (let n = 1; n <= 9; n++) grouped.set(n, []);
  for (const item of items) grouped.get(item.categoryNo)?.push(item);

  const allCategories = Array.from(grouped.entries()); // 빈 카테고리도 모두 표시

  // 마지막 행 판별 (하단 이중 테두리 방지)
  // 카테고리 9가 항상 마지막 — 항목이 있으면 마지막 항목, 없으면 4번째 빈 행이 마지막
  const EMPTY_ROWS = 4; // 데이터 없는 카테고리의 기본 빈 행 수
  const cat9Items = grouped.get(9) ?? [];
  const lastItemId = cat9Items.length > 0
    ? cat9Items[cat9Items.length - 1].id : null;

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* ── 제목 ── */}
        <View style={S.title}>
          <Text>항목별 세부내역서</Text>
        </View>

        {/* ── 테이블 ── */}
        <View style={B_OUT}>

          {/* 열 헤더 */}
          <View style={S.row}>
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
          <View style={S.row}>
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
                <View style={S.row}>
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
                        <View key={`empty-${i}`} style={S.row}>
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
                        <View key={item.id} style={S.row}>
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
