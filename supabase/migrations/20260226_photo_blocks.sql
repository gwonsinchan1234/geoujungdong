-- ============================================================
-- 사진대지 블록 테이블
-- ============================================================

-- 1) photo_blocks: 블록 메타데이터 (NO번호, 헤더, 날짜, 항목)
CREATE TABLE IF NOT EXISTS photo_blocks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        uuid        NOT NULL,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  sheet_name    text        NOT NULL DEFAULT '',   -- 시트명 (안전보호구, 안전시설물 등)
  no            int         NOT NULL,              -- NO.10 → 10
  right_header  text        NOT NULL DEFAULT '지급 사진',  -- '지급 사진' | '현장 설치 사진'
  left_date     text        NOT NULL DEFAULT '',
  right_date    text        NOT NULL DEFAULT '',
  left_label    text        NOT NULL DEFAULT '',   -- 전체식 안전벨트 [20EA]
  right_label   text        NOT NULL DEFAULT '',
  sort_order    int         NOT NULL DEFAULT 0,    -- 페이지 내 정렬
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2) block_photos: 각 슬롯의 사진
CREATE TABLE IF NOT EXISTS block_photos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id      uuid        NOT NULL REFERENCES photo_blocks(id) ON DELETE CASCADE,
  side          text        NOT NULL CHECK (side IN ('left', 'right')),
  slot_index    int         NOT NULL CHECK (slot_index BETWEEN 0 AND 3),
  storage_path  text        NOT NULL,              -- Supabase Storage 경로
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, side, slot_index)
);

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_photo_blocks_doc_id  ON photo_blocks (doc_id);
CREATE INDEX IF NOT EXISTS idx_photo_blocks_user_id ON photo_blocks (user_id);
CREATE INDEX IF NOT EXISTS idx_block_photos_block_id ON block_photos (block_id);

-- 4) updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_photo_blocks_updated_at ON photo_blocks;
CREATE TRIGGER trg_photo_blocks_updated_at
  BEFORE UPDATE ON photo_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5) RLS 활성화
ALTER TABLE photo_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_photos  ENABLE ROW LEVEL SECURITY;

-- 6) RLS 정책: 본인 데이터만 접근
CREATE POLICY "photo_blocks: 본인 조회" ON photo_blocks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "photo_blocks: 본인 삽입" ON photo_blocks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "photo_blocks: 본인 수정" ON photo_blocks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "photo_blocks: 본인 삭제" ON photo_blocks
  FOR DELETE USING (auth.uid() = user_id);

-- block_photos는 block_id → photo_blocks.user_id 로 권한 위임
CREATE POLICY "block_photos: 본인 조회" ON block_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM photo_blocks pb
      WHERE pb.id = block_photos.block_id
        AND pb.user_id = auth.uid()
    )
  );

CREATE POLICY "block_photos: 본인 삽입" ON block_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM photo_blocks pb
      WHERE pb.id = block_photos.block_id
        AND pb.user_id = auth.uid()
    )
  );

CREATE POLICY "block_photos: 본인 삭제" ON block_photos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM photo_blocks pb
      WHERE pb.id = block_photos.block_id
        AND pb.user_id = auth.uid()
    )
  );

-- 7) Storage: expense-evidence 버킷 정책 (이미 있으면 skip)
-- 버킷은 대시보드에서 생성 후 아래 정책만 실행
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-evidence', 'expense-evidence', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage: 본인 업로드" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'expense-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage: 본인 조회" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'expense-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "storage: 본인 삭제" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'expense-evidence'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
