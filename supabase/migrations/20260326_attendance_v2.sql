-- 출결기성관리 v2
-- 테이블: attendance_projects / attendance_raw / attendance_daily / labor_summary
-- 연결: project_id 기준 (attendance_projects.id)
-- 실행: Supabase 대시보드 SQL Editor에서 실행
-- ※ 기존 자재/사진대지 테이블 일절 수정 없음

-- ─────────────────────────────────────────────
-- 1. attendance_projects (프로젝트 단위)
-- ─────────────────────────────────────────────
create table if not exists attendance_projects (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  description text        not null default '',
  created_at  timestamptz not null default now(),
  unique(user_id, name)
);

create index if not exists idx_attendance_projects_user
  on attendance_projects (user_id);

alter table attendance_projects enable row level security;

drop policy if exists "att_proj_user_all" on attendance_projects;
create policy "att_proj_user_all" on attendance_projects
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 2. attendance_raw (원본 로그 — 파싱 결과 그대로)
-- ─────────────────────────────────────────────
create table if not exists attendance_raw (
  id               uuid        primary key default gen_random_uuid(),
  project_id       uuid        not null references attendance_projects(id) on delete cascade,
  employee_id      text        not null default '',
  person_name      text        not null,
  company          text        not null default '',
  work_date        date        not null,
  check_in         time,
  check_out        time,
  source_file_name text        not null default '',
  source_row_index integer,
  user_id          uuid        not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now()
);

create index if not exists idx_att_raw_project_date
  on attendance_raw (project_id, work_date desc);
create index if not exists idx_att_raw_project_person
  on attendance_raw (project_id, person_name);
create index if not exists idx_att_raw_project_file
  on attendance_raw (project_id, source_file_name);

alter table attendance_raw enable row level security;

drop policy if exists "att_raw_user_all" on attendance_raw;
create policy "att_raw_user_all" on attendance_raw
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 3. attendance_daily (일자별 통합 — 공수 계산 결과)
-- ─────────────────────────────────────────────
create table if not exists attendance_daily (
  id            uuid           primary key default gen_random_uuid(),
  project_id    uuid           not null references attendance_projects(id) on delete cascade,
  employee_id   text           not null default '',
  person_name   text           not null,
  company       text           not null default '',
  work_date     date           not null,
  check_in      time,
  check_out     time,
  total_minutes integer        not null default 0,
  labor_units   numeric(4, 2)  not null default 0,
  -- labor_status: 'full'(1공) | 'half'(0.5공) | 'missing'(누락!) | 'ongoing'(진행중)
  labor_status  text           not null default 'unknown',
  log_count     integer        not null default 0,
  user_id       uuid           not null references auth.users(id) on delete cascade,
  updated_at    timestamptz    not null default now(),
  unique(project_id, person_name, work_date)
);

create index if not exists idx_att_daily_project_date
  on attendance_daily (project_id, work_date desc);
create index if not exists idx_att_daily_project_person
  on attendance_daily (project_id, person_name);

alter table attendance_daily enable row level security;

drop policy if exists "att_daily_user_all" on attendance_daily;
create policy "att_daily_user_all" on attendance_daily
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 4. labor_summary (인원별 누적 집계)
-- ─────────────────────────────────────────────
create table if not exists labor_summary (
  id                 uuid           primary key default gen_random_uuid(),
  project_id         uuid           not null references attendance_projects(id) on delete cascade,
  employee_id        text           not null default '',
  person_name        text           not null,
  company            text           not null default '',
  total_labor_units  numeric(6, 2)  not null default 0,
  work_days          integer        not null default 0,
  user_id            uuid           not null references auth.users(id) on delete cascade,
  updated_at         timestamptz    not null default now(),
  unique(project_id, person_name)
);

create index if not exists idx_labor_summary_project
  on labor_summary (project_id);

alter table labor_summary enable row level security;

drop policy if exists "labor_summary_user_all" on labor_summary;
create policy "labor_summary_user_all" on labor_summary
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 5. set_updated_at 트리거 (중복 정의 방지)
-- ─────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create function set_updated_at()
      returns trigger language plpgsql as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end $$;

drop trigger if exists att_daily_updated_at    on attendance_daily;
drop trigger if exists labor_summary_updated_at on labor_summary;

create trigger att_daily_updated_at
  before update on attendance_daily
  for each row execute procedure set_updated_at();

create trigger labor_summary_updated_at
  before update on labor_summary
  for each row execute procedure set_updated_at();
