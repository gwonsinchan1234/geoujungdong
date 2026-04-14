-- 온보딩 챗봇 질문/답변 로그 (서버 API + service role로 적재)

create table if not exists chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_logs_created_at on chat_logs (created_at desc);
create index if not exists idx_chat_logs_user_id on chat_logs (user_id) where user_id is not null;

alter table chat_logs enable row level security;

-- 서비스 롤로 적재(권장)하지만, 대시보드에서 조회/디버깅을 위해
-- 로그인 사용자는 자신의 로그만 SELECT 가능하도록 허용
create policy "chat_logs: read own"
  on chat_logs for select to authenticated
  using (user_id = auth.uid());
