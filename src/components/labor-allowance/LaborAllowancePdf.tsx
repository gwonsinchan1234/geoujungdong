"use client";

import React from "react";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import type { LaborHistoryRow } from "./types";

Font.register({
  family: "NanumGothic",
  fonts: [
    { src: "/fonts/NanumGothic-Regular.ttf", fontWeight: "normal" },
    { src: "/fonts/NanumGothic-Bold.ttf", fontWeight: "bold" },
  ],
});

const B_IN = {
  borderRightWidth: 0.5,
  borderRightColor: "#888",
  borderRightStyle: "solid" as const,
  borderBottomWidth: 0.5,
  borderBottomColor: "#888",
  borderBottomStyle: "solid" as const,
};

const B_OUT = { borderWidth: 1.5, borderColor: "#000", borderStyle: "solid" as const };

const ROW = 22;
const CW = {
  no: "8%",
  name: "24%",
  date: "14%",
  amt: "18%",
  attach: "10%",
  status: "26%",
} as const;

const S = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 7.5,
    color: "#000",
    paddingTop: 32,
    paddingBottom: 28,
    paddingLeft: 28,
    paddingRight: 28,
  },
  title: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 2,
    marginBottom: 6,
  },
  meta: {
    fontSize: 7,
    color: "#444",
    textAlign: "center",
    marginBottom: 10,
  },
  th: {
    ...B_IN,
    height: ROW,
    backgroundColor: "#ebebeb",
    fontWeight: "bold",
    fontSize: 7.2,
    textAlign: "center",
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 2,
    paddingRight: 2,
  },
  td: {
    ...B_IN,
    height: ROW,
    fontSize: 7,
    textAlign: "center",
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 3,
    paddingRight: 3,
  },
  tdR: {
    ...B_IN,
    height: ROW,
    fontSize: 7,
    textAlign: "right",
    justifyContent: "center",
    paddingLeft: 3,
    paddingRight: 5,
  },
  tdL: {
    ...B_IN,
    height: ROW,
    fontSize: 7,
    textAlign: "left",
    justifyContent: "center",
    paddingLeft: 5,
    paddingRight: 3,
  },
  sumRow: { flexDirection: "row" },
  sumLabel: {
    ...B_IN,
    height: ROW,
    backgroundColor: "#f0f0f0",
    fontWeight: "bold",
    fontSize: 7.5,
    width: "74%",
    textAlign: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  sumAmt: {
    ...B_IN,
    height: ROW,
    backgroundColor: "#f0f0f0",
    fontWeight: "bold",
    fontSize: 7.5,
    width: "26%",
    textAlign: "right",
    justifyContent: "center",
    paddingRight: 5,
    borderRightWidth: 0,
  },
  row: { flexDirection: "row" },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cx(base: any, extra: any = {}, nr = false, nb = false): any {
  return {
    ...base,
    ...extra,
    ...(nr ? { borderRightWidth: 0 } : {}),
    ...(nb ? { borderBottomWidth: 0 } : {}),
  };
}

function fmtNum(n: number) {
  return n.toLocaleString("ko-KR");
}

export interface LaborAllowancePdfMeta {
  month: string;
  search: string;
  person: string;
}

interface Props {
  rows: LaborHistoryRow[];
  meta: LaborAllowancePdfMeta;
}

const ROWS_PER_PAGE = 26;

export default function LaborAllowancePdf({ rows, meta }: Props) {
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const metaLine = [
    meta.month ? `기준월 ${meta.month}` : null,
    meta.search ? `검색 ${meta.search}` : null,
    meta.person ? `담당 ${meta.person}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const chunks: LaborHistoryRow[][] = [];
  for (let i = 0; i < Math.max(rows.length, 1); i += ROWS_PER_PAGE) {
    chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  return (
    <Document>
      {chunks.map((chunk, pi) => {
        const isLast = pi === chunks.length - 1;
        const displayRows = chunk.length === 0 && pi === 0 ? [] : chunk;
        const showEmpty = rows.length === 0 && pi === 0;

        return (
          <Page key={pi} size="A4" style={S.page}>
            {pi === 0 && (
              <>
                <Text style={S.title}>안전관리자 인건비 및 업무수당</Text>
                <Text style={S.meta}>{metaLine || " "}</Text>
              </>
            )}
            {pi > 0 && (
              <Text style={{ ...S.meta, marginBottom: 8 }}>
                안전관리자 인건비 (계속) — {pi + 1}쪽
              </Text>
            )}

            <View style={B_OUT}>
              <View style={S.row}>
                <View style={cx(S.th, { width: CW.no })}>
                  <Text>NO</Text>
                </View>
                <View style={cx(S.th, { width: CW.name })}>
                  <Text>이름</Text>
                </View>
                <View style={cx(S.th, { width: CW.date })}>
                  <Text>지급일</Text>
                </View>
                <View style={cx(S.th, { width: CW.amt })}>
                  <Text>금액</Text>
                </View>
                <View style={cx(S.th, { width: CW.attach })}>
                  <Text>첨부</Text>
                </View>
                <View style={cx(S.th, { width: CW.status }, true)}>
                  <Text>상태</Text>
                </View>
              </View>

              {showEmpty ? (
                <View style={S.row}>
                  <View
                    style={{
                      ...B_IN,
                      borderRightWidth: 0,
                      height: ROW * 2,
                      width: "100%",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: 8,
                      borderBottomWidth: 0,
                    }}
                  >
                    <Text>조회 데이터가 없습니다.</Text>
                  </View>
                </View>
              ) : (
                displayRows.map((r, idx) => {
                  const globalIdx = pi * ROWS_PER_PAGE + idx;
                  const nbBeforeSum = isLast && idx === displayRows.length - 1;
                  return (
                    <View key={r.id} style={S.row}>
                      <View style={cx(S.td, { width: CW.no }, false, nbBeforeSum)}>
                        <Text>{globalIdx + 1}</Text>
                      </View>
                      <View style={cx(S.tdL, { width: CW.name }, false, nbBeforeSum)}>
                        <Text>{r.person_name}</Text>
                      </View>
                      <View style={cx(S.td, { width: CW.date }, false, nbBeforeSum)}>
                        <Text>{r.payment_date}</Text>
                      </View>
                      <View style={cx(S.tdR, { width: CW.amt }, false, nbBeforeSum)}>
                        <Text>{fmtNum(Number(r.amount) || 0)}</Text>
                      </View>
                      <View style={cx(S.td, { width: CW.attach }, false, nbBeforeSum)}>
                        <Text>{r.attachment_count ?? 0}</Text>
                      </View>
                      <View style={cx(S.td, { width: CW.status }, true, nbBeforeSum)}>
                        <Text>{r.status}</Text>
                      </View>
                    </View>
                  );
                })
              )}

              {isLast && rows.length > 0 && (
                <View style={S.sumRow}>
                  <View style={{ ...S.sumLabel, borderBottomWidth: 0 }}>
                    <Text>합계</Text>
                  </View>
                  <View style={{ ...S.sumAmt, borderBottomWidth: 0 }}>
                    <Text>{fmtNum(total)} 원</Text>
                  </View>
                </View>
              )}
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
