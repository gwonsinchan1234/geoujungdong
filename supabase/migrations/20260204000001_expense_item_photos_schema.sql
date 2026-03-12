-- expense_item_photos 테이블 스키마 (코드/API 기준)
-- 테이블이 없을 때만 실행. 이미 있으면 20260204000000_add_template_id_to_expense_item_photos.sql 만 적용.

-- CREATE TABLE 예시 (Supabase 대시보드 또는 SQL 편집기에서 참고용)
/*
CREATE TABLE IF NOT EXISTS expense_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_item_id uuid NOT NULL REFERENCES expense_items(id) ON DELETE CASCADE,
  template_id text NOT NULL DEFAULT 'safety_facilities_1x1',
  kind text NOT NULL CHECK (kind IN ('inbound', 'issue_install')),
  slot smallint NOT NULL CHECK (slot >= 0 AND slot <= 3),
  storage_path text NOT NULL,
  original_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz DEFAULT now(),
  UNIQUE(expense_item_id, kind, slot)
);

CREATE INDEX IF NOT EXISTS idx_expense_item_photos_expense_item_id
  ON expense_item_photos (expense_item_id);
*/

-- 컬럼 목록 (API list/upload 사용)
-- id, expense_item_id, template_id, kind, slot, storage_path, original_name, mime_type, size_bytes, created_at
