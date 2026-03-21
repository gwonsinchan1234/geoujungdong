-- 안전관리자 인건비 누적/조회용 문서-첨부 구조
-- 생성일: 2026-03-21

create table if not exists safety_labor_documents (
  id uuid primary key default gen_random_uuid(),
  person_name text not null,
  payment_date date not null,
  month_key text not null,
  amount numeric(14, 2) not null default 0,
  status text not null default '미완료' check (status in ('미완료', '완료')),
  attachment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_safety_labor_docs_month on safety_labor_documents(month_key);
create index if not exists idx_safety_labor_docs_person on safety_labor_documents(person_name);
create index if not exists idx_safety_labor_docs_payment_date on safety_labor_documents(payment_date desc);
create index if not exists idx_safety_labor_docs_created_at on safety_labor_documents(created_at desc);

create table if not exists safety_labor_attachments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references safety_labor_documents(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_safety_labor_att_doc_id on safety_labor_attachments(document_id, created_at desc);
