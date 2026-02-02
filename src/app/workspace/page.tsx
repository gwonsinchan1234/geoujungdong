"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./WorkspacePage.module.css";

/**
 * [기술/이유]
 * - Next.js App Router Client Component
 * - 드래그&드롭, 파일 미리보기(URL.createObjectURL), 즉시 UI 반응(프리미엄 모션) 때문에 client로 구성
 * - 현재는 UI 완성 → 다음 단계에서 /api/items + Supabase로 실제 데이터/업로드 연결
 */

type Doc = {
  id: string;
  title: string;
  subtitle: string; // 예: 파일명
  updatedAt: string; // 표시용
};

type TemplateSpec = {
  incomingSlots: number; // 반입 사진 슬롯 수
  installSlots: number; // 지급/설치 사진 슬롯 수
};

type Item = {
  id: string;
  evidenceNo: number; // NO.x
  name: string; // 품명
  qtyLabel: string; // "1개" 같은 표시
  templateName: string;
  templateSpec: TemplateSpec;
};

type PhotoKind = "incoming" | "install";

type PhotoSlot = {
  kind: PhotoKind;
  slotIndex: number; // 0-based
  file?: File;
  previewUrl?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatNoX(n: number) {
  return `NO.${n}`;
}

function makeSlots(spec: TemplateSpec): PhotoSlot[] {
  const incoming = Array.from({ length: spec.incomingSlots }, (_, i) => ({
    kind: "incoming" as const,
    slotIndex: i,
  }));
  const install = Array.from({ length: spec.installSlots }, (_, i) => ({
    kind: "install" as const,
    slotIndex: i,
  }));
  return [...incoming, ...install];
}

function countFilled(slots: PhotoSlot[], kind: PhotoKind) {
  return slots.filter((s) => s.kind === kind && !!s.file).length;
}

function uniqueBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function PhotoDropSlot(props: {
  title: string;
  subtitle: string;
  previewUrl?: string;
  onPickFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // [프리미엄 모션] 드래그 들어오면 슬롯이 살아 움직이게
  const [dragging, setDragging] = useState(false);

  function onChoose() {
    if (props.disabled) return;
    inputRef.current?.click();
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    props.onPickFile(f);
    // 같은 파일 다시 선택 가능하도록 초기화
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (props.disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    props.onPickFile(f);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  return (
    <div
      className={`${styles.slot} ${dragging ? styles.slotDragging : ""}`}
      role="button"
      tabIndex={0}
      aria-disabled={props.disabled ? "true" : "false"}
      onClick={onChoose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onChoose();
      }}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={onDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.fileInput}
        onChange={onInputChange}
        disabled={props.disabled}
      />

      {props.previewUrl ? (
        <div className={styles.previewWrap}>
          {/* [이유] 빠른 미리보기용 img (최적화는 추후 Next/Image로 교체 가능) */}
          <img className={styles.previewImg} src={props.previewUrl} alt={props.title} />
          <div className={styles.previewOverlay}>
            <div className={styles.previewMeta}>
              <div className={styles.previewTitle}>{props.title}</div>
              <div className={styles.previewSub}>{props.subtitle}</div>
            </div>
            <div className={styles.previewActions}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onChoose();
                }}
              >
                교체
              </button>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClear();
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.slotEmpty}>
          <div className={styles.slotIcon}>📷</div>
          <div className={styles.slotTitle}>{props.title}</div>
          <div className={styles.slotSub}>{props.subtitle}</div>
          <div className={styles.slotHint}>드래그 또는 클릭하여 업로드</div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  /**
   * [현재 단계] UI 완성용 Mock
   * - 다음 단계에서 docs/items를 /api로 교체하면 됩니다.
   */
  const mockDocs: Doc[] = useMemo(
    () => [
      {
        id: "doc_001",
        title: "강남 사옥 확장공사",
        subtitle: "2023_정리검검_점검시각자료.xlsx",
        updatedAt: "2026-02-02",
      },
      {
        id: "doc_002",
        title: "향담 대리점 리뉴얼",
        subtitle: "2023_정리검검_점검시각자료.xlsx",
        updatedAt: "2026-02-01",
      },
      {
        id: "doc_003",
        title: "절강 신축 공사",
        subtitle: "2023_정리검검_점검시각자료.xlsx",
        updatedAt: "2026-01-30",
      },
      {
        id: "doc_004",
        title: "학교 사옥 환수 공사",
        subtitle: "2023_정리검검_점검시각자료.xlsx",
        updatedAt: "2026-01-28",
      },
    ],
    []
  );

  const mockItems: Item[] = useMemo(() => {
    const raw: Item[] = [
      {
        id: "item_001",
        evidenceNo: 1,
        name: "확장",
        qtyLabel: "1개",
        templateName: "반입/지급-설치",
        templateSpec: { incomingSlots: 1, installSlots: 4 },
      },
      // 일부러 중복 상황 재현 → UI 중복 방지 로직 검증용
      {
        id: "item_001_dup",
        evidenceNo: 1,
        name: "확장",
        qtyLabel: "1개",
        templateName: "반입/지급-설치",
        templateSpec: { incomingSlots: 1, installSlots: 4 },
      },
      {
        id: "item_002",
        evidenceNo: 2,
        name: "안전난간",
        qtyLabel: "10m",
        templateName: "반입/지급-설치",
        templateSpec: { incomingSlots: 1, installSlots: 4 },
      },
      {
        id: "item_003",
        evidenceNo: 3,
        name: "생명줄",
        qtyLabel: "2set",
        templateName: "반입/지급-설치",
        templateSpec: { incomingSlots: 1, installSlots: 4 },
      },
    ];

    // [꼬임 방지] 동일 NO+품명 중복 제거(드롭다운/리스트 중복 노출 방지)
    return uniqueBy(raw, (x) => `${x.evidenceNo}__${x.name}`);
  }, []);

  const [docQuery, setDocQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string>(mockDocs[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string>(mockItems[0]?.id ?? "");

  const selectedDoc = useMemo(
    () => mockDocs.find((d) => d.id === selectedDocId) ?? null,
    [mockDocs, selectedDocId]
  );

  const selectedItem = useMemo(
    () => mockItems.find((it) => it.id === selectedItemId) ?? null,
    [mockItems, selectedItemId]
  );

  // 선택 품목 템플릿에 따라 슬롯 구성
  const [slots, setSlots] = useState<PhotoSlot[]>(() =>
    selectedItem ? makeSlots(selectedItem.templateSpec) : []
  );

  // 품목 변경 시: 템플릿 규격으로 슬롯 재구성(행 섞임 방지)
  useEffect(() => {
    if (!selectedItem) {
      setSlots([]);
      return;
    }
    setSlots((prev) => {
      for (const s of prev) {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      }
      return makeSlots(selectedItem.templateSpec);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId]);

  // 문서 검색 필터
  const filteredDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    if (!q) return mockDocs;
    return mockDocs.filter(
      (d) => d.title.toLowerCase().includes(q) || d.subtitle.toLowerCase().includes(q)
    );
  }, [docQuery, mockDocs]);

  // 품목 검색 필터
  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return mockItems;
    return mockItems.filter((it) => {
      const a = `${it.evidenceNo} ${it.name} ${it.qtyLabel} ${it.templateName}`.toLowerCase();
      return a.includes(q);
    });
  }, [itemQuery, mockItems]);

  const progressDone = 0;
  const progressTotal = 23;

  const incomingFilled = useMemo(() => countFilled(slots, "incoming"), [slots]);
  const installFilled = useMemo(() => countFilled(slots, "install"), [slots]);

  const incomingMax = selectedItem?.templateSpec.incomingSlots ?? 0;
  const installMax = selectedItem?.templateSpec.installSlots ?? 0;

  function updateSlot(kind: PhotoKind, slotIndex: number, file?: File) {
    setSlots((prev) => {
      const next = prev.map((s) => ({ ...s }));
      const idx = next.findIndex((s) => s.kind === kind && s.slotIndex === slotIndex);
      if (idx < 0) return prev;

      // 기존 preview revoke
      if (next[idx].previewUrl) URL.revokeObjectURL(next[idx].previewUrl);

      if (!file) {
        next[idx].file = undefined;
        next[idx].previewUrl = undefined;
        return next;
      }

      // [프론트 1차 방어] 이미지 파일만 허용
      if (!file.type.startsWith("image/")) return prev;

      next[idx].file = file;
      next[idx].previewUrl = URL.createObjectURL(file);
      return next;
    });
  }

  function onClickPreview() {
    alert("미리보기는 다음 단계에서 연결합니다. (현재는 UI 완성/모션 적용 단계)");
  }

  function onClickPdf() {
    alert("PDF 출력은 다음 단계에서 연결합니다. (현재는 UI 완성/모션 적용 단계)");
  }

  return (
    <div className={styles.shell}>
      {/* 상단 바 */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandTitle}>작업대</div>
          <div className={styles.brandSub}>엑셀 한 행(품목) 기준으로 사진을 정확히 매칭합니다.</div>
        </div>

        <div className={styles.steps}>
          <div className={styles.stepActive}>문서 선택</div>
          <div className={styles.stepDot} />
          <div className={styles.step}>품목 선택</div>
          <div className={styles.stepDot} />
          <div className={styles.step}>사진 업로드 / 출력</div>
        </div>

        <div className={styles.topActions}>
          <div className={styles.progressText}>
            {progressDone}/{progressTotal} 완료
          </div>
          <button type="button" className={styles.btn} onClick={onClickPdf}>
            PDF 출력
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {/* 좌측 패널 */}
        <aside className={styles.sidebar}>
          <div className={styles.panelTitle}>문서 선택</div>

          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              value={docQuery}
              onChange={(e) => setDocQuery(e.target.value)}
              placeholder="문서명 또는 파일명으로 검색"
            />
          </div>

          <div className={styles.docList}>
            {filteredDocs.map((d) => {
              const active = d.id === selectedDocId;
              return (
                <button
                  key={d.id}
                  type="button"
                  className={active ? styles.docCardActive : styles.docCard}
                  onClick={() => setSelectedDocId(d.id)}
                >
                  <div className={styles.docTitle}>{d.title}</div>
                  <div className={styles.docSub}>{d.subtitle}</div>
                  <div className={styles.docMeta}>{d.updatedAt}</div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => alert("엑셀 업로드는 다음 단계에서 연결합니다.")}
          >
            + 새 문서 업로드
          </button>
        </aside>

        {/* 메인 작업 영역 */}
        <main className={styles.main}>
          <section className={styles.docHeader}>
            <div className={styles.docHeaderTitle}>{selectedDoc?.title ?? "문서를 선택하세요"}</div>
            <div className={styles.docHeaderSub}>{selectedDoc?.subtitle ?? ""}</div>
          </section>

          <section className={styles.itemSection}>
            <div className={styles.itemTop}>
              <div className={styles.sectionTitle}>품목</div>
              <input
                className={styles.searchInputWide}
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="NO, 품명, 템플릿으로 검색"
              />
            </div>

            <div className={styles.itemTableHead}>
              <div>NO.x</div>
              <div>품명</div>
              <div>수량</div>
              <div>템플릿</div>
              <div />
            </div>

            <div className={styles.itemTable}>
              {filteredItems.map((it) => {
                const active = it.id === selectedItemId;
                return (
                  <button
                    key={it.id}
                    type="button"
                    className={active ? styles.itemRowActive : styles.itemRow}
                    onClick={() => setSelectedItemId(it.id)}
                  >
                    <div className={styles.cellMono}>{formatNoX(it.evidenceNo)}</div>
                    <div className={styles.cellStrong}>{it.name}</div>
                    <div className={styles.cellDim}>{it.qtyLabel}</div>
                    <div className={styles.cellDim}>{it.templateName}</div>
                    <div className={styles.cellRight}>
                      <span className={styles.pill}>
                        반입 {it.templateSpec.incomingSlots} / 지급·설치 {it.templateSpec.installSlots}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={styles.photoSection}>
            <div className={styles.photoHeader}>
              <div className={styles.sectionTitle}>사진 슬롯</div>
              <div className={styles.slotCounter}>
                반입 {incomingFilled}/{incomingMax} · 지급·설치 {installFilled}/{installMax}
              </div>
            </div>

            <div className={styles.slotGrid}>
              {/* 반입 */}
              {Array.from({ length: incomingMax }, (_, i) => {
                const slot = slots.find((s) => s.kind === "incoming" && s.slotIndex === i);
                const idxLabel = clamp(i + 1, 1, 99);
                return (
                  <PhotoDropSlot
                    key={`incoming_${i}`}
                    title={`반입 (${idxLabel}/${incomingMax})`}
                    subtitle="드래그 또는 클릭"
                    previewUrl={slot?.previewUrl}
                    onPickFile={(file) => updateSlot("incoming", i, file)}
                    onClear={() => updateSlot("incoming", i, undefined)}
                  />
                );
              })}

              {/* 지급·설치 */}
              {Array.from({ length: installMax }, (_, i) => {
                const slot = slots.find((s) => s.kind === "install" && s.slotIndex === i);
                const idxLabel = clamp(i + 1, 1, 99);
                return (
                  <PhotoDropSlot
                    key={`install_${i}`}
                    title={`지급·설치 (${idxLabel}/${installMax})`}
                    subtitle="드래그 또는 클릭"
                    previewUrl={slot?.previewUrl}
                    onPickFile={(file) => updateSlot("install", i, file)}
                    onClear={() => updateSlot("install", i, undefined)}
                  />
                );
              })}
            </div>

            <div className={styles.bottomActions}>
              <button type="button" className={styles.btnSecondary} onClick={onClickPreview}>
                미리보기
              </button>
              <button type="button" className={styles.btn} onClick={onClickPdf}>
                PDF 출력
              </button>
            </div>
          </section>

          <section className={styles.devNote}>
            <div className={styles.devNoteTitle}>개발 메모</div>
            <div className={styles.devNoteText}>
              현재는 UI+모션 완성 단계입니다. 다음 단계에서 docs/items를 /api로 교체하고, 사진 업로드는
              Storage + (expense_item_id, kind, slot) 유니크 정책으로 upsert 연결합니다.
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
