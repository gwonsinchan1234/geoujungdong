-- 갑지 v2 — 새 필드 추가
-- Supabase 대시보드 SQL Editor에서 실행

alter table gabji_documents
  add column if not exists contract_amount_note  text not null default '',  -- 공사금액 부기 (VAT포함 등)
  add column if not exists write_date            date,                       -- 작성일
  add column if not exists checker1_position     text not null default '',   -- 확인자1 직책
  add column if not exists checker1_name         text not null default '',   -- 확인자1 성명
  add column if not exists checker2_position     text not null default '',   -- 확인자2 직책
  add column if not exists checker2_name         text not null default '';   -- 확인자2 성명
