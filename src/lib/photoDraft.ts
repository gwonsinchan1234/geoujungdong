/**
 * 사진대지 로컬 드래프트 (localStorage)
 *
 * 역할:
 *   - 변경 발생 시 debounce 자동 저장 (임시)
 *   - 같은 파일명 재업로드 시 docId + 블록 상태 복원
 *   - 서버 최종 저장(handlePhotoSave) 성공 후 clearDraft() 로 삭제
 *
 * 저장 구조:
 *   - docId: 서버 upsert에 쓰이는 UUID (세션 간 일관성 유지)
 *   - blocks: Record<sheetName, PhotoBlock[]>
 *     - 사진은 storage_path + signedUrl 보관 (signedUrl 만료 시 서버에서 재발급 필요)
 */

import type { PhotoBlock } from "@/components/photo-sheet/types";

const TTL_MS = 24 * 60 * 60 * 1000; // 24시간

export type PhotoDraftData = {
  docId:    string;
  fileName: string;
  savedAt:  number;
  blocks:   Record<string, PhotoBlock[]>;
};

function draftKey(fileName: string): string {
  return `photo_draft_${fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, "_").slice(0, 80)}`;
}

export const photoDraft = {
  save(docId: string, fileName: string, blocks: Record<string, PhotoBlock[]>): void {
    if (typeof window === "undefined") return;
    try {
      const data: PhotoDraftData = { docId, fileName, savedAt: Date.now(), blocks };
      localStorage.setItem(draftKey(fileName), JSON.stringify(data));
    } catch {
      // quota exceeded 등 무시
    }
  },

  load(fileName: string): PhotoDraftData | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(draftKey(fileName));
      if (!raw) return null;
      const data = JSON.parse(raw) as PhotoDraftData;
      if (Date.now() - data.savedAt > TTL_MS) {
        localStorage.removeItem(draftKey(fileName));
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  clear(fileName: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(draftKey(fileName));
  },
};
