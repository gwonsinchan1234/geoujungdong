-- 산업안전보건관리비 사용내역서(갑지) 테이블
-- 실행: Supabase 대시보드 SQL Editor에서 실행

-- ── 문서 테이블 ─────────────────────────────────────────────────
create table if not exists gabji_documents (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete cascade not null,

  -- 식별자: 사용자별 현장+월 고유
  site_name                text not null default '',   -- 현장명
  year_month               text not null default '',   -- 'YYYY-MM' 작성기준월

  -- 기본정보
  construction_company     text not null default '',   -- 시공사명
  address                  text not null default '',   -- 현장소재지
  project_name             text not null default '',   -- 공사명
  representative_name      text not null default '',   -- 현장대리인
  client_name              text not null default '',   -- 발주처

  -- 금액·기간·공정
  contract_amount          numeric not null default 0, -- 도급(계약)금액
  start_date               date,                       -- 공사시작일
  end_date                 date,                       -- 공사종료일
  cumulative_progress_rate numeric not null default 0, -- 공정율(%)
  budgeted_safety_cost     numeric not null default 0, -- 안전관리비 계상액

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique(user_id, site_name, year_month)
);

-- ── 항목 테이블 ─────────────────────────────────────────────────
create table if not exists gabji_items (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid references gabji_documents(id) on delete cascade not null,

  item_code       integer not null,     -- 항목 번호 1~9
  item_name       text    not null default '',
  prev_amount     numeric not null default 0,  -- 전월까지 사용금액
  current_amount  numeric not null default 0,  -- 당월 사용금액
  total_amount    numeric not null default 0,  -- 누계 (= prev + current, 저장 시 계산)
  sort_order      integer not null default 0,

  unique(document_id, item_code)  -- upsert 기준 키
);

-- ── RLS 활성화 ──────────────────────────────────────────────────
alter table gabji_documents enable row level security;
alter table gabji_items     enable row level security;

-- 문서: 자신의 문서만 CRUD
create policy "gabji_documents: own"
  on gabji_documents for all to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 항목: 자신의 문서에 속한 항목만 CRUD
create policy "gabji_items: own"
  on gabji_items for all to authenticated
  using  (document_id in (select id from gabji_documents where user_id = auth.uid()))
  with check (document_id in (select id from gabji_documents where user_id = auth.uid()));

-- ── updated_at 자동 갱신 트리거 ─────────────────────────────────
create or replace function set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gabji_documents_updated_at
  before update on gabji_documents
  for each row execute procedure set_updated_at();
