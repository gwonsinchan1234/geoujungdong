// [왜] templateId·evidence_no·photos(kind,slot) SSOT. 렌더는 slot 0..3 고정 반복 + find(kind, slot).

export type PhotoSheetPhoto = {
  kind: "incoming" | "install";
  slot: number;
  url: string;
};

export type PhotoSheetItem = {
  no: number;
  date: string;
  itemName: string;
  /** SSOT: 렌더 시 slot 0..3 반복, find(kind, slot)로 매핑. map 사용 금지. */
  photos: PhotoSheetPhoto[];
  templateId?: string;
  evidence_no?: string;
};
