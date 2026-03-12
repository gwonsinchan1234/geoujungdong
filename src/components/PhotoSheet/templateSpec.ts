/**
 * [왜] SSOT: 템플릿별 슬롯 수·엑셀 좌표·미리보기 그리드를 한 곳에서 정의.
 * 미리보기 = Export 동일 레이아웃 보장.
 */

export type TemplateExcelSpec = {
  photoRanges: { incoming: (string | null)[]; install: (string | null)[] };
  textCells: {
    no: string;
    date: string;
    item: string;
    qty?: string;
  };
  /** 한 시트 내 NO 블록 앵커 셀(각 블록의 NO 셀 주소). 블록 순서대로 채움. */
  blocks: string[];
};

export type TemplatePreviewSpec = {
  /** 슬롯별 grid 영역: { gridArea } 또는 순서대로 배치 시 사용 */
  incoming: Array<{ gridArea?: string }>;
  install: Array<{ gridArea?: string }>;
};

export type TemplateSpecRecord = {
  templateId: string;
  sheetName: string;
  /** 미리보기/출력 시 맨 위에 표시할 제목 (예: 사진대지(안전시설물)) */
  previewTitle: string;
  incomingSlots: number;
  installSlots: number;
  excel: TemplateExcelSpec;
  preview: TemplatePreviewSpec;
};

/** 1+1: 안전시설물 사진대지 (test.xlsx 좌표 반영) */
const safety_facilities_1x1: TemplateSpecRecord = {
  templateId: "safety_facilities_1x1",
  sheetName: "2.안전시설물 사진대지",
  previewTitle: "사진대지(안전시설물)",
  incomingSlots: 1,
  installSlots: 1,
  excel: {
    photoRanges: {
      incoming: ["B6:E14"],
      install: ["F6:I14"],
    },
    textCells: {
      no: "B4",
      date: "C15",
      item: "C16",
    },
    blocks: ["B4"],
  },
  preview: {
    incoming: [{ gridArea: "1 / 1 / 2 / 2" }],
    install: [{ gridArea: "1 / 2 / 2 / 3" }],
  },
};

/** 2+2 골격 (좌표 추후 채움) */
const template_2x2: TemplateSpecRecord = {
  templateId: "template_2x2",
  sheetName: "2x2 사진대지",
  previewTitle: "사진대지(2x2)",
  incomingSlots: 2,
  installSlots: 2,
  excel: {
    photoRanges: {
      incoming: ["B6:E14", "F6:I14"],
      install: ["B16:E24", "F16:I24"],
    },
    textCells: { no: "B4", date: "C25", item: "C26" },
    blocks: ["B4"],
  },
  preview: {
    incoming: [{ gridArea: "1 / 1 / 2 / 2" }, { gridArea: "1 / 2 / 2 / 3" }],
    install: [{ gridArea: "2 / 1 / 3 / 2" }, { gridArea: "2 / 2 / 3 / 3" }],
  },
};

/** 3+3 골격 */
const template_3x3: TemplateSpecRecord = {
  templateId: "template_3x3",
  sheetName: "3x3 사진대지",
  previewTitle: "사진대지(3x3)",
  incomingSlots: 3,
  installSlots: 3,
  excel: {
    photoRanges: {
      incoming: ["B6:D12", "E6:G12", "H6:J12"],
      install: ["B14:D20", "E14:G20", "H14:J20"],
    },
    textCells: { no: "B4", date: "C21", item: "C22" },
    blocks: ["B4"],
  },
  preview: {
    incoming: [{ gridArea: "1 / 1 / 2 / 2" }, { gridArea: "1 / 2 / 2 / 3" }, { gridArea: "1 / 3 / 2 / 4" }],
    install: [{ gridArea: "2 / 1 / 3 / 2" }, { gridArea: "2 / 2 / 3 / 3" }, { gridArea: "2 / 3 / 3 / 4" }],
  },
};

/** 4+4 골격 */
const template_4x4: TemplateSpecRecord = {
  templateId: "template_4x4",
  sheetName: "4x4 사진대지",
  previewTitle: "사진대지(4x4)",
  incomingSlots: 4,
  installSlots: 4,
  excel: {
    photoRanges: {
      incoming: ["B6:D11", "E6:G11", "H6:J11", "K6:M11"],
      install: ["B13:D18", "E13:G18", "H13:J18", "K13:M18"],
    },
    textCells: { no: "B4", date: "C19", item: "C20" },
    blocks: ["B4"],
  },
  preview: {
    incoming: [
      { gridArea: "1 / 1 / 2 / 2" },
      { gridArea: "1 / 2 / 2 / 3" },
      { gridArea: "1 / 3 / 2 / 4" },
      { gridArea: "1 / 4 / 2 / 5" },
    ],
    install: [
      { gridArea: "2 / 1 / 3 / 2" },
      { gridArea: "2 / 2 / 3 / 3" },
      { gridArea: "2 / 3 / 3 / 4" },
      { gridArea: "2 / 4 / 3 / 5" },
    ],
  },
};

export const TEMPLATE_REGISTRY: Record<string, TemplateSpecRecord> = {
  [safety_facilities_1x1.templateId]: safety_facilities_1x1,
  [template_2x2.templateId]: template_2x2,
  [template_3x3.templateId]: template_3x3,
  [template_4x4.templateId]: template_4x4,
};

export const DEFAULT_TEMPLATE_ID = "safety_facilities_1x1";

export function getTemplateSpec(templateId: string): TemplateSpecRecord | null {
  return TEMPLATE_REGISTRY[templateId] ?? null;
}

/** 레거시 호환: 단일 슬롯 수만 필요할 때 */
export const TEMPLATE_SPEC = TEMPLATE_REGISTRY[DEFAULT_TEMPLATE_ID]
  ? {
      incomingSlots: TEMPLATE_REGISTRY[DEFAULT_TEMPLATE_ID].incomingSlots,
      installSlots: TEMPLATE_REGISTRY[DEFAULT_TEMPLATE_ID].installSlots,
    }
  : { incomingSlots: 4, installSlots: 4 };
