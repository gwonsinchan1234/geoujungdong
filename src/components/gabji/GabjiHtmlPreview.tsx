"use client";

// 모바일 전용 HTML 미리보기
// PDFViewer(iframe) 대신 HTML/CSS로 갑지 직접 렌더링 → 입력값 즉시 반영
// CSS zoom 으로 A4(794px) 를 화면 폭에 맞게 축소 — 가로 스크롤 없음

import React, { useRef, useEffect, useState } from "react";
import type { GabjiDoc, GabjiItem } from "./types";
import { fmtWon, fmtWonOrZero, calcTotals } from "./types";
import styles from "./gabji.module.css";

function fmtDate(s: string) {
  if (!s) return "";
  const p = s.split("-");
  return p.length === 3 ? `${p[0]}년 ${p[1]}월 ${p[2]}일` : s;
}
function fmtShort(s: string) { return s ? s.replace(/-/g, ".") : ""; }

const A4_PX = 794; // 210mm @ 96dpi

export default function GabjiHtmlPreview({
  doc, items,
}: { doc: GabjiDoc; items: GabjiItem[] }) {
  const { prevTotal, currTotal, total } = calcTotals(items);
  const month = doc.year_month ? parseInt(doc.year_month.split("-")[1], 10) : "";

  const contractStr = doc.contract_amount > 0
    ? `${fmtWon(doc.contract_amount)}원${doc.contract_amount_note ? `  (${doc.contract_amount_note})` : ""}` : "";
  const periodStr = (doc.start_date || doc.end_date)
    ? `${fmtShort(doc.start_date)} ~ ${fmtShort(doc.end_date)}` : "";
  const safetyStr = doc.budgeted_safety_cost > 0
    ? `${fmtWon(doc.budgeted_safety_cost)} 원` : "";

  // 컨테이너 폭 측정 → zoom 계산
  const outerRef = useRef<HTMLDivElement>(null);
  const [zoomVal, setZoomVal] = useState(() =>
    typeof window !== "undefined"
      ? Math.min(1, (window.innerWidth - 16) / A4_PX)
      : 1
  );

  useEffect(() => {
    const update = () => {
      if (!outerRef.current) return;
      const cw = outerRef.current.clientWidth;
      setZoomVal(cw > 16 ? Math.min(1, (cw - 16) / A4_PX) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className={styles.htmlPreviewOuter}>
      {/* zoom 으로 A4 폭 → 화면 폭 축소. layout에도 반영되므로 가로 스크롤 없음 */}
      <div style={{ zoom: zoomVal, width: A4_PX }}>
        <div className={styles.a4Wrap}>

          <div className={styles.formNo}>[별지 제1호 서식]</div>
          <div className={styles.docTitle}>산업안전보건관리비 사용내역서</div>

          {/* ── 기본정보 ─────────────────────────────────── */}
          <table className={styles.infoTable}>
            <colgroup>
              <col style={{ width: "18.3%" }} />
              <col style={{ width: "38.3%" }} />
              <col style={{ width: "15.7%" }} />
              <col style={{ width: "27.7%" }} />
            </colgroup>
            <tbody>
              <tr>
                <th className={styles.iTh}>건 설 업 체 명</th>
                <td className={styles.iTd}>{doc.construction_company}</td>
                <th className={styles.iTh}>공&nbsp;&nbsp;&nbsp;&nbsp;사&nbsp;&nbsp;&nbsp;&nbsp;명</th>
                <td className={styles.iTd}>{doc.project_name}</td>
              </tr>
              <tr>
                <th className={styles.iTh}>소&nbsp;&nbsp;&nbsp;&nbsp;재&nbsp;&nbsp;&nbsp;&nbsp;지</th>
                <td className={styles.iTd}>{doc.address}</td>
                <th className={styles.iTh}>대&nbsp;&nbsp;&nbsp;&nbsp;표&nbsp;&nbsp;&nbsp;&nbsp;자</th>
                <td className={styles.iTd}>{doc.representative_name}</td>
              </tr>
              <tr>
                <th className={styles.iTh}>공&nbsp;&nbsp;사&nbsp;&nbsp;금&nbsp;&nbsp;액</th>
                <td className={styles.iTd}>{contractStr}</td>
                <th className={styles.iTh}>공&nbsp;&nbsp;사&nbsp;&nbsp;기&nbsp;&nbsp;간</th>
                <td className={styles.iTd}>{periodStr}</td>
              </tr>
              <tr>
                <th className={styles.iTh}>발&nbsp;&nbsp;&nbsp;&nbsp;주&nbsp;&nbsp;&nbsp;&nbsp;자</th>
                <td className={styles.iTd}>{doc.client_name}</td>
                <th className={styles.iTh}>누 계 공 정 율</th>
                <td className={styles.iTd}>
                  {doc.cumulative_progress_rate > 0 ? `${doc.cumulative_progress_rate}%` : ""}
                </td>
              </tr>
              <tr>
                <th className={styles.iTh}>계상된 안전관리비</th>
                <td className={styles.iTdSafety} colSpan={3}>{safetyStr}</td>
              </tr>
            </tbody>
          </table>

          {/* ── 사용금액 ──────────────────────────────────── */}
          <table className={styles.usageTable}>
            <colgroup>
              <col style={{ width: "37.1%" }} />
              <col style={{ width: "19.4%" }} />
              <col style={{ width: "20.7%" }} />
              <col style={{ width: "22.7%" }} />
            </colgroup>
            <tbody>
              <tr>
                <td className={styles.usageSectionTitle} colSpan={4}>
                  사&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;용&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;금&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;액
                </td>
              </tr>
              <tr>
                <th className={styles.uTh}>항&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목</th>
                <th className={styles.uTh}>전월 사용누계</th>
                <th className={styles.uTh}>금월({month}월)<br />사용금액</th>
                <th className={styles.uTh}>누계 사용금액</th>
              </tr>
              <tr className={styles.sumRow}>
                <td className={styles.sumLabel}>계</td>
                <td className={styles.amtCell}>{fmtWonOrZero(prevTotal)}</td>
                <td className={styles.amtCell}>{fmtWonOrZero(currTotal)}</td>
                <td className={styles.amtCell}>{fmtWonOrZero(total)}</td>
              </tr>
              {items.map(item => (
                <tr key={item.item_code}>
                  <td className={styles.itemLabel}>{item.item_code}. {item.item_name}</td>
                  <td className={styles.amtCell}>{fmtWon(item.prev_amount)}</td>
                  <td className={styles.amtCell}>{fmtWon(item.current_amount)}</td>
                  <td className={styles.amtCell}>{fmtWon(item.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.legalText}>
            위와 같이 산업안전보건관리비를 사용하였음을 확인합니다.
          </div>
          <div className={styles.writeDate}>{fmtDate(doc.write_date)}</div>

          {/* ── 서명 ──────────────────────────────────────── */}
          <table className={styles.signTable}>
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "19%" }} />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <th className={styles.sTh} rowSpan={2} style={{ verticalAlign: "middle" }}>
                  확<br />인<br />자
                </th>
                <th className={styles.sTh}>직&nbsp;&nbsp;책</th>
                <td className={styles.sVal}>{doc.checker1_position}</td>
                <th className={styles.sTh}>성&nbsp;&nbsp;명</th>
                <td className={styles.sVal}>{doc.checker1_name}</td>
                <td className={styles.sSeal}>(서명 또는 인)</td>
              </tr>
              <tr>
                <th className={styles.sTh}>직&nbsp;&nbsp;책</th>
                <td className={styles.sVal}>{doc.checker2_position}</td>
                <th className={styles.sTh}>성&nbsp;&nbsp;명</th>
                <td className={styles.sVal}>{doc.checker2_name}</td>
                <td className={styles.sSeal}>(서명 또는 인)</td>
              </tr>
            </tbody>
          </table>

        </div>
      </div>
    </div>
  );
}
