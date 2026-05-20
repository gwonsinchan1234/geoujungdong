# Supabase 마이그레이션 적용 순서

프로젝트를 새로 만들었거나 Advisor에 RLS 경고가 많을 때, SQL Editor에서 **파일명 날짜 순**으로 실행하세요.

1. `20260226_photo_blocks.sql` (및 photo 관련)
2. `20260319_gabji.sql`
3. `20260321_safety_labor_documents.sql`
4. `20260326_attendance_v2.sql` — **출결 필수**
5. `20260328_chat_logs.sql`
6. `20260330_detail_items.sql`
7. `20260402_monthly_output.sql`
8. `20260520_rls_public_tables.sql` — **RLS 11건 일괄 해결**

적용 후 Vercel 환경 변수가 같은 Supabase 프로젝트를 가리키는지 확인하고 재배포하세요.
