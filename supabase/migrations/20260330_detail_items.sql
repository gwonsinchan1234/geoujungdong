-- ============================================================
-- 항목별세부내역(표준 입력) 테이블
-- - 엑셀 업로드 없이 프로그램에서 직접 작성/저장
-- - 문서(현장+월)는 gabji_documents를 공용 앵커로 사용
-- ============================================================

create table if not exists detail_items (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid references gabji_documents(id) on delete cascade not null,

  category_no  int  not null check (category_no between 1 and 9),
  evidence_no  text not null default '',         -- "NO.1" 등 (없으면 앱에서 자동 부여)
  usage_date   text not null default '',         -- 표시용(원본 포맷 유지). 필요 시 YYYY-MM-DD 사용 권장
  name         text not null default '',
  quantity     numeric not null default 1,
  unit         text not null default 'EA',
  unit_price   numeric not null default 0,
  amount       numeric not null default 0,
  note         text not null default '',
  sort_order   int  not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (document_id, category_no, evidence_no)
);

create index if not exists idx_detail_items_document_id on detail_items(document_id);

-- updated_at 자동 갱신 (gabji와 동일 함수명이 있으면 재사용)
do $$ begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at'
  ) then
    create or replace function set_updated_at()
      returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
  end if;
end $$;

drop trigger if exists detail_items_updated_at on detail_items;
create trigger detail_items_updated_at
  before update on detail_items
  for each row execute procedure set_updated_at();

alter table detail_items enable row level security;

-- 본인 문서(gabji_documents.user_id) 소속만 CRUD
create policy "detail_items: own"
  on detail_items for all to authenticated
  using (
    document_id in (select id from gabji_documents where user_id = auth.uid())
  )
  with check (
    document_id in (select id from gabji_documents where user_id = auth.uid())
  );

