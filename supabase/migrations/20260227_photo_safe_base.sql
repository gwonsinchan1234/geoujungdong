-- ============================================================
-- 사진대지 안전 기본틀 마이그레이션
-- Supabase 대시보드 SQL 에디터에서 실행
-- ============================================================

-- photo_blocks: (doc_id, sheet_name, no) 자연키 유니크 제약
-- → POST /api/photo-blocks 의 upsert onConflict 대상
ALTER TABLE photo_blocks
  ADD CONSTRAINT uq_photo_blocks_doc_sheet_no
  UNIQUE (doc_id, sheet_name, no);

-- block_photos: (block_id, side, slot_index) 유니크는 초기 마이그레이션에 이미 포함.
-- 없을 경우를 대비한 멱등 처리
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'block_photos_block_id_side_slot_index_key'
  ) THEN
    ALTER TABLE block_photos
      ADD CONSTRAINT block_photos_block_id_side_slot_index_key
      UNIQUE (block_id, side, slot_index);
  END IF;
END $$;
