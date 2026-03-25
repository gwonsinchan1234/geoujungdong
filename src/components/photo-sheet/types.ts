export type PhotoLayout =
  | "auto"
  | "2a" | "2b"
  | "3a" | "3b" | "3c"
  | "4a" | "4b" | "4c";

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
  left_layout:  PhotoLayout;
  right_layout: PhotoLayout;
  sort_order:   number;
  photos:       BlockPhoto[];
};

export type OnSlotClick   = (blockId: string, side: "left" | "right", slotIndex: number) => void;
export type OnPhotoDelete = (photoId: string, blockId: string, side: "left" | "right", slotIndex: number) => void;

export type OnMetaUpdate = (
  blockId: string,
  fields: Partial<Pick<PhotoBlock,
    | "left_date" | "right_date"
    | "left_label" | "right_label"
    | "right_header"
    | "left_layout" | "right_layout"
  >>
) => void;
