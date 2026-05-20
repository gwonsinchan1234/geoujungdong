-- =============================================================================
-- Advisor: "RLS disabled on public.*" 일괄 해결
-- Supabase SQL Editor 또는 CLI로 실행
--
-- 전략
--   A) 서버 API만 사용 (service_role) → RLS ON, anon/authenticated 정책 없음
--   B) 브라우저에서 로그인 후 쓰는 레거시(expense_docs/items) → authenticated 전체 허용
--
-- service_role 키는 RLS를 우회하므로 Next API(/api/photos/*, safety-labor 등)는 유지됩니다.
-- anon 키로 테이블 직접 조회는 차단됩니다(보안 린트 해결).
-- =============================================================================

-- ── 헬퍼: 테이블이 있을 때만 RLS 활성화 ─────────────────────────────────────
create or replace function public._enable_rls_if_exists(p_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = p_table
  ) then
    execute format('alter table public.%I enable row level security', p_table);
  end if;
end;
$$;

-- ── 헬퍼: authenticated 전체 허용 정책 (레거시 expense 등) ─────────────────
create or replace function public._policy_auth_all_if_exists(p_table text, p_policy text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = p_table
  ) then
    return;
  end if;

  execute format('drop policy if exists %I on public.%I', p_policy, p_table);
  execute format(
    'create policy %I on public.%I for all to authenticated using (true) with check (true)',
    p_policy,
    p_table
  );
end;
$$;

-- =============================================================================
-- A) 서버 전용 — RLS만 켜고 정책 없음 (anon/authenticated 직접 접근 차단)
-- =============================================================================
select public._enable_rls_if_exists('expense_item_photos');
select public._enable_rls_if_exists('expense_item_install_photos');
select public._enable_rls_if_exists('safety_labor_documents');
select public._enable_rls_if_exists('safety_labor_attachments');
select public._enable_rls_if_exists('expense_photos');
select public._enable_rls_if_exists('attendance_logs');

-- 코드에서 미사용 참조 테이블(있으면 동일하게 잠금)
select public._enable_rls_if_exists('item_categories');
select public._enable_rls_if_exists('item_master');
select public._enable_rls_if_exists('forbidden_rules');

-- PostgREST 직접 접근 최소화 (테이블별, 존재할 때만)
do $$
declare
  t text;
  tables text[] := array[
    'expense_item_photos',
    'expense_item_install_photos',
    'safety_labor_documents',
    'safety_labor_attachments',
    'expense_photos',
    'attendance_logs',
    'item_categories',
    'item_master',
    'forbidden_rules'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on public.%I from anon', t);
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end;
$$;

-- =============================================================================
-- B) 레거시 expense — 로그인 사용자만 CRUD (브라우저 supabase 클라이언트용)
--     ※ 로그인 없이 anon으로 expense 페이지를 쓰던 경우 → API 경유 또는 로그인 필요
-- =============================================================================
select public._enable_rls_if_exists('expense_docs');
select public._enable_rls_if_exists('expense_items');
select public._policy_auth_all_if_exists('expense_docs', 'expense_docs_auth_all');
select public._policy_auth_all_if_exists('expense_items', 'expense_items_auth_all');

-- expense_items → photos 연동 시(향후): expense_item_id 경유 정책 예시 (주석)
-- create policy expense_item_photos_via_items on public.expense_item_photos
--   for all to authenticated using (
--     exists (select 1 from public.expense_items ei where ei.id = expense_item_id)
--   );

-- 정리: 일회성 헬퍼는 남겨도 되고, 제거하려면 아래 주석 해제
-- drop function if exists public._enable_rls_if_exists(text);
-- drop function if exists public._policy_auth_all_if_exists(text, text);
