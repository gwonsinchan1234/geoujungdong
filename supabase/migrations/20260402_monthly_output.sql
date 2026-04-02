-- 월간 출력현황: 인원/제목/현장명 (사용자별 전역)
create table monthly_output_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  persons  jsonb        not null default '[]',
  title    text         not null default '',
  site_name text        not null default '',
  updated_at timestamptz not null default now()
);
alter table monthly_output_settings enable row level security;
create policy "own settings" on monthly_output_settings
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 월간 출력현황: 날짜 범위별 셀 데이터 (O/시간값)
create table monthly_output_ranges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid  not null references auth.users(id) on delete cascade,
  start_date date  not null,
  end_date   date  not null,
  values     jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, start_date, end_date)
);
alter table monthly_output_ranges enable row level security;
create policy "own ranges" on monthly_output_ranges
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
