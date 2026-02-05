// 사진대지 데이터 타입

export type PhotoSheetItem = {
  no: number;
  date: string;
  itemName: string;
  inboundPhotos: string[]; // 0~4장
  installPhotos: string[]; // 0~4장
};
