-- [왜] expense_item_photos에 template_id 추가하여 출력 시 어떤 템플릿으로 렌더할지 SSOT로 확정

ALTER TABLE expense_item_photos
ADD COLUMN IF NOT EXISTS template_id text NOT NULL DEFAULT 'safety_facilities_1x1';

COMMENT ON COLUMN expense_item_photos.template_id IS '템플릿 SSOT ID (예: safety_facilities_1x1)';

-- 기존 행 backfill
UPDATE expense_item_photos
SET template_id = 'safety_facilities_1x1'
WHERE template_id IS NULL OR template_id = '';

-- nullable 제거 (이미 NOT NULL DEFAULT 있으면 생략 가능)
-- ALTER TABLE expense_item_photos ALTER COLUMN template_id SET NOT NULL;

-- unique: (expense_item_id, kind, slot) 확인/생성
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_item_photos_item_kind_slot
ON expense_item_photos (expense_item_id, kind, slot);
