"use client";

// @react-pdf/renderer 기반 갑지 PDF
// ──────────────────────────────────────────────────────────────
// 측정값 출처: (1월)안전관리비 사용내역서(범일대우)_REV0.xlsx 실측
//
// ■ 컬럼 너비 (wpx, 실제 파일 기준)
//   A=21  B=165  C=170  D=175  E=142  F=45  G=205
//   콘텐츠 영역 B~G 합계: 902px
//
//   기본정보 4열 (label | value | label | value):
//     B       = 165/902 = 18.3%
//     C+D     = 345/902 = 38.3%
//     E       = 142/902 = 15.7%
//     F+G     = 250/902 = 27.7%
//
//   사용금액 4열 (항목 | 전월 | 금월 | 누계):
//     B+C     = 335/902 = 37.1%
//     D       = 175/902 = 19.4%
//     E+F     = 187/902 = 20.7%
//     G       = 205/902 = 22.7%
//
// ■ 행 높이 (hpt, 실제 파일 기준, ×0.80 스케일)
//   원본 42pt × 0.80 = 33.6 → 34pt (데이터 행 공통)
//   원본 39.95pt × 0.80 = 32pt (제목 행)
//   원본 30pt × 0.80 = 24pt (법적문구/날짜)
//   서명 행 1: 35.45pt × 0.80 = 28pt
//   서명 행 2: 46.15pt × 0.80 = 37pt
// ──────────────────────────────────────────────────────────────

import React from "react";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import type { GabjiDoc, GabjiItem } from "./types";
import { fmtWon, fmtWonOrZero, calcTotals } from "./types";

// ── 한글 폰트 등록 ──────────────────────────────────────────────
Font.register({
  family: "NanumGothic",
  fonts: [
    { src: "/fonts/NanumGothic-Regular.ttf", fontWeight: "normal" },
    { src: "/fonts/NanumGothic-Bold.ttf",    fontWeight: "bold"   },
  ],
});

// ── 컬럼 비율 상수 ──────────────────────────────────────────────
// 기본정보 테이블
const IW = { lb1: "18.3%", v1: "38.3%", lb2: "15.7%", v2: "27.7%" } as const;
// 사용금액 테이블
const UW = { item: "37.1%", prev: "19.4%", curr: "20.7%", tot: "22.7%"  } as const;

// ── 행 높이 상수 ──────────────────────────────────────────────
const ROW = 34;      // 데이터 행 공통 (42pt × 0.80)
const ROW_TITLE = 32; // 제목 행
const ROW_TEXT  = 24; // 법적문구/날짜
const ROW_SIG   = 33; // 서명 행 (1·2 동일)

// ── 셀 기본 테두리 ─────────────────────────────────────────────
const B_IN  = { borderRightWidth:0.5, borderRightColor:"#888", borderRightStyle:"solid" as const,
                borderBottomWidth:0.5, borderBottomColor:"#888", borderBottomStyle:"solid" as const };
const B_OUT = { borderWidth:1.5, borderColor:"#000", borderStyle:"solid" as const };

// ── 스타일 ──────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 8,
    color: "#000",
    paddingTop: 36, paddingBottom: 30,
    paddingLeft: 30, paddingRight: 30,
  },

  // 별지 표기
  formNo: {
    fontSize: 6.5,
    color: "#555",
    marginBottom: 2,
  },

  // 대제목
  title: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 3,
    height: ROW_TITLE,
    justifyContent: "center",
    alignItems: "center",
  },

  row: { flexDirection: "row" },

  // ── 기본정보 테이블 ──────────────────────────────────────────
  iTh: {
    ...B_IN,
    height: ROW,
    backgroundColor: "#ebebeb",
    fontWeight: "bold",
    fontSize: 7.5,
    paddingLeft: 4, paddingRight: 4,
    textAlign: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  iTd: {
    ...B_IN,
    height: ROW,
    fontSize: 7.5,
    fontWeight: "bold",
    paddingLeft: 5, paddingRight: 5,
    textAlign: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  // 계산된 안전관리비 값 셀 (colspan=3)
  iTdSafety: {
    height: ROW,
    fontSize: 8,
    fontWeight: "bold",
    paddingLeft: 5, paddingRight: 5,
    textAlign: "center",
    justifyContent: "center",
    flex: 1,
  },

  // ── 사용금액 테이블 ──────────────────────────────────────────
  usageSectionTitle: {
    height: ROW,
    textAlign: "center",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 10,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 0.5, borderBottomColor: "#888", borderBottomStyle: "solid",
  },
  uTh: {
    ...B_IN,
    height: ROW,
    backgroundColor: "#ebebeb",
    fontWeight: "bold",
    fontSize: 7.5,
    paddingLeft: 3, paddingRight: 3,
    textAlign: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  // 합계 행
  sumCell: {
    ...B_IN,
    height: ROW,
    backgroundColor: "#efefef",
    fontWeight: "bold",
    fontSize: 8.5,
    paddingLeft: 5, paddingRight: 5,
    justifyContent: "center",
  },
  sumCellAmt: {
    ...B_IN,
    height: ROW,
    backgroundColor: "#efefef",
    fontWeight: "bold",
    fontSize: 8,
    paddingLeft: 4, paddingRight: 5,
    textAlign: "right",
    justifyContent: "center",
  },
  // 항목 행
  itemCell: {
    ...B_IN,
    height: ROW,
    fontSize: 7.5,
    paddingLeft: 5, paddingRight: 4,
    justifyContent: "center",
  },
  amtCell: {
    ...B_IN,
    height: ROW,
    fontSize: 8,
    textAlign: "right",
    paddingLeft: 4, paddingRight: 5,
    justifyContent: "center",
  },

  // ── 하단 ─────────────────────────────────────────────────────
  legalText: {
    height: ROW_TEXT,
    textAlign: "center",
    fontSize: 8.5,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  writeDate: {
    height: ROW_TEXT,
    textAlign: "center",
    fontSize: 8.5,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },

  // ── 서명 행 ──────────────────────────────────────────────────
  sigTh: {
    ...B_IN,
    backgroundColor: "#ebebeb",
    fontWeight: "bold",
    fontSize: 7.5,
    paddingLeft: 3, paddingRight: 3,
    textAlign: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  sigVal: {
    ...B_IN,
    fontSize: 7.5,
    paddingLeft: 4, paddingRight: 4,
    textAlign: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  sigSeal: {
    ...B_IN,
    fontSize: 7,
    paddingLeft: 3, paddingRight: 3,
    textAlign: "center",
    color: "#555",
    justifyContent: "center",
    alignItems: "center",
  },
});

// ── 헬퍼: 스타일 병합 (noRight/noBottom 옵션) ──────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cx(base: any, extra: any = {}, nr = false, nb = false): any {
  return { ...base, ...extra,
    ...(nr ? { borderRightWidth: 0  } : {}),
    ...(nb ? { borderBottomWidth: 0 } : {}),
  };
}

// ── 날짜 포맷 ───────────────────────────────────────────────────
function fmtDate(s: string) {
  if (!s) return "";
  const p = s.split("-");
  return p.length === 3 ? `${p[0]}년 ${p[1]}월 ${p[2]}일` : s;
}
function fmtShort(s: string) { return s ? s.replace(/-/g, ".") : ""; }

interface Props { doc: GabjiDoc; items: GabjiItem[]; valueFontSize?: string }

// ── PDF 문서 ─────────────────────────────────────────────────────
export default function GabjiPdf({ doc, items, valueFontSize }: Props) {
  // Excel에서 파싱된 폰트 크기 (pt 단위 숫자). 없으면 S.iTd 기본값 사용
  const iTdFontSize = valueFontSize ? (parseFloat(valueFontSize) || undefined) : undefined;
  const { prevTotal, currTotal, total } = calcTotals(items);
  const month = doc.year_month ? parseInt(doc.year_month.split("-")[1], 10) : "";

  const contractStr = doc.contract_amount > 0
    ? `${fmtWon(doc.contract_amount)}원${doc.contract_amount_note ? `  (${doc.contract_amount_note})` : ""}`
    : "";
  const periodStr = doc.start_date || doc.end_date
    ? `${fmtShort(doc.start_date)} ~ ${fmtShort(doc.end_date)}` : "";
  const safetyStr = doc.budgeted_safety_cost > 0
    ? `${fmtWon(doc.budgeted_safety_cost)} 원` : "";

  // 기본정보 4행 (label1, value1, label2, value2)
  const infoRows: [string, string, string, string][] = [
    ["건 설 업 체 명", doc.construction_company, "공    사    명", doc.project_name],
    ["소    재    지", doc.address,              "대    표    자", doc.representative_name],
    ["공  사  금  액", contractStr,              "공  사  기  간", periodStr],
    ["발    주    자", doc.client_name,          "누 계 공 정 율",
      doc.cumulative_progress_rate > 0 ? `${doc.cumulative_progress_rate}%` : ""],
  ];

  const lastIdx = items.length - 1;

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* ── 별지 표기 ── */}
        <Text style={S.formNo}>[별지 제1호 서식]</Text>

        {/* ── 제목 ── */}
        <View style={S.title}>
          <Text>산업안전보건관리비 사용내역서</Text>
        </View>

        {/* ── 기본정보 테이블 ── */}
        <View style={B_OUT}>

          {/* 4열 4행 */}
          {infoRows.map(([lb1, v1, lb2, v2], ri) => (
            <View key={ri} style={S.row}>
              <View style={cx(S.iTh, { width: IW.lb1 })}>
                <Text>{lb1}</Text>
              </View>
              <View style={cx(S.iTd, { width: IW.v1, ...(iTdFontSize && { fontSize: iTdFontSize }) })}>
                <Text>{v1}</Text>
              </View>
              <View style={cx(S.iTh, { width: IW.lb2 })}>
                <Text>{lb2}</Text>
              </View>
              <View style={cx(S.iTd, { width: IW.v2, ...(iTdFontSize && { fontSize: iTdFontSize }) }, true)}>
                <Text>{v2}</Text>
              </View>
            </View>
          ))}

          {/* 계상된 안전관리비 (colspan=3) */}
          <View style={S.row}>
            <View style={cx(S.iTh, { width: IW.lb1 }, false, true)}>
              <Text>계상된 안전관리비</Text>
            </View>
            <View style={cx(S.iTdSafety, {}, true, true)}>
              <Text>{safetyStr}</Text>
            </View>
          </View>

        </View>

        {/* ── 사용금액 테이블 ── */}
        <View style={{ ...B_OUT, marginTop: 4 }}>

          {/* "사 용 금 액" */}
          <View style={S.usageSectionTitle}>
            <Text>사     용     금     액</Text>
          </View>

          {/* 컬럼 헤더 */}
          <View style={S.row}>
            <View style={cx(S.uTh, { width: UW.item })}>
              <Text>항{" ".repeat(14)}목</Text>
            </View>
            <View style={cx(S.uTh, { width: UW.prev })}>
              <Text>전월 사용누계</Text>
            </View>
            <View style={cx(S.uTh, { width: UW.curr })}>
              <Text>금월({month}월){"\n"}사용금액</Text>
            </View>
            <View style={cx(S.uTh, { width: UW.tot }, true)}>
              <Text>누계 사용금액</Text>
            </View>
          </View>

          {/* 합계(계) 행 */}
          <View style={S.row}>
            <View style={cx(S.sumCell, { width: UW.item, textAlign: "center" })}>
              <Text>계</Text>
            </View>
            <View style={cx(S.sumCellAmt, { width: UW.prev })}>
              <Text>{fmtWonOrZero(prevTotal)}</Text>
            </View>
            <View style={cx(S.sumCellAmt, { width: UW.curr })}>
              <Text>{fmtWonOrZero(currTotal)}</Text>
            </View>
            <View style={cx(S.sumCellAmt, { width: UW.tot }, true)}>
              <Text>{fmtWonOrZero(total)}</Text>
            </View>
          </View>

          {/* 항목 1~9 */}
          {items.map((item, idx) => {
            const last = idx === lastIdx;
            return (
              <View key={item.item_code} style={S.row}>
                <View style={cx(S.itemCell, { width: UW.item }, false, last)}>
                  <Text>{item.item_code}. {item.item_name}</Text>
                </View>
                <View style={cx(S.amtCell, { width: UW.prev }, false, last)}>
                  <Text>{fmtWon(item.prev_amount)}</Text>
                </View>
                <View style={cx(S.amtCell, { width: UW.curr }, false, last)}>
                  <Text>{fmtWon(item.current_amount)}</Text>
                </View>
                <View style={cx(S.amtCell, { width: UW.tot }, true, last)}>
                  <Text>{fmtWon(item.total_amount)}</Text>
                </View>
              </View>
            );
          })}

        </View>

        {/* ── 법적 문구 ── */}
        <View style={S.legalText}>
          <Text>위와 같이 산업안전보건관리비를 사용하였음을 확인합니다.</Text>
        </View>

        {/* ── 작성일 ── */}
        <View style={S.writeDate}>
          <Text>{fmtDate(doc.write_date)}</Text>
        </View>

        {/* ── 서명 테이블 (2행 — 확인자1 / 확인자2) ── */}
        <View style={B_OUT}>

          {/* 확인자 1 */}
          <View style={{ ...S.row, height: ROW_SIG }}>
            <View style={cx(S.sigTh, { width: "8%"  })}>
              <Text>확인자</Text>
            </View>
            <View style={cx(S.sigTh, { width: "8%"  })}>
              <Text>직  책</Text>
            </View>
            <View style={cx(S.sigVal,{ width: "19%" })}>
              <Text>{doc.checker1_position}</Text>
            </View>
            <View style={cx(S.sigTh, { width: "8%"  })}>
              <Text>성  명</Text>
            </View>
            <View style={cx(S.sigVal,{ width: "19%" })}>
              <Text>{doc.checker1_name}</Text>
            </View>
            <View style={cx(S.sigSeal,{ flex: 1 }, true)}>
              <Text>(서명 또는 인)</Text>
            </View>
          </View>

          {/* 확인자 2 */}
          <View style={{ ...S.row, height: ROW_SIG }}>
            <View style={cx(S.sigTh, { width: "8%"  }, false, true)}>
              <Text>확인자</Text>
            </View>
            <View style={cx(S.sigTh, { width: "8%"  }, false, true)}>
              <Text>직  책</Text>
            </View>
            <View style={cx(S.sigVal,{ width: "19%" }, false, true)}>
              <Text>{doc.checker2_position}</Text>
            </View>
            <View style={cx(S.sigTh, { width: "8%"  }, false, true)}>
              <Text>성  명</Text>
            </View>
            <View style={cx(S.sigVal,{ width: "19%" }, false, true)}>
              <Text>{doc.checker2_name}</Text>
            </View>
            <View style={cx(S.sigSeal,{ flex: 1 }, true, true)}>
              <Text>(서명 또는 인)</Text>
            </View>
          </View>

        </View>

      </Page>
    </Document>
  );
}
