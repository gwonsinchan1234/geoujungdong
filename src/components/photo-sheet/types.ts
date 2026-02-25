export type BlockPhoto = {
  id:           string;
  block_id:     string;
  side:         "left" | "right";
  slot_index:   number;   // 0~3
  storage_path: string;
  url:          string;   // signed URL
};

export type PhotoBlock = {
  id:           string;
  doc_id:       string;
  sheet_name:   string;
  no:           number;
  right_header: string;   // "지급 사진" | "현장 설치 사진"
  left_date:    string;
  right_date:   string;
  left_label:   string;
  right_label:  string;
  sort_order:   number;
  photos:       BlockPhoto[];
};

// 슬롯 클릭 콜백 (편집 모드)
export type OnSlotClick = (blockId: string, side: "left" | "right", slotIndex: number) => void;
export type OnPhotoDelete = (photoId: string, blockId: string, side: "left" | "right", slotIndex: number) => void;

// 블록 메타데이터 수정 콜백 (날짜 / 항목 라벨)
export type OnMetaUpdate = (
  blockId: string,
  fields: Partial<Pick<PhotoBlock, "left_date" | "right_date" | "left_label" | "right_label" | "right_header">>
) => void;
