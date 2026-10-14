-- StudentPath student portal modules.
--
-- Review the existing schema and grants first. This migration expects
-- public.students(id) and public.students.auth_user_id as established by
-- student_access_policies.sql. Apply the core access migration first.
--
-- Run manually in Supabase Dashboard > SQL Editor. It is not auto-executed.

create table if not exists public.student_timetables (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  subject text not null check (length(trim(subject)) between 1 and 160),
  instructor text,
  room text,
  academic_year text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.student_fees (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  fee_type text not null check (length(trim(fee_type)) between 1 and 160),
  amount numeric(12, 2) not null check (amount >= 0),
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  due_date date,
  status text not null default 'due'
    check (status in ('due', 'partially_paid', 'paid', 'waived', 'overdue')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  starts_on date not null,
  ends_on date not null,
  reason text not null check (length(trim(reason)) between 1 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (ends_on >= starts_on)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(trim(body)) between 1 and 10000),
  category text not null default 'general',
  published boolean not null default false,
  publish_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  category text not null check (length(trim(category)) between 1 and 100),
  subject text not null check (length(trim(subject)) between 1 and 200),
  message text not null check (length(trim(message)) between 1 and 4000),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists student_timetables_student_day_idx on public.student_timetables (student_id, weekday, starts_at);
create index if not exists student_fees_student_due_idx on public.student_fees (student_id, due_date);
create index if not exists leave_requests_student_created_idx on public.leave_requests (student_id, created_at desc);
create index if not exists announcements_published_date_idx on public.announcements (published, publish_at desc);
create index if not exists support_requests_student_created_idx on public.support_requests (student_id, created_at desc);

alter table public.student_timetables enable row level security;
alter table public.student_fees enable row level security;
alter table public.leave_requests enable row level security;
alter table public.announcements enable row level security;
alter table public.support_requests enable row level security;

revoke all on table
  public.student_timetables,
  public.student_fees,
  public.leave_requests,
  public.announcements,
  public.support_requests
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.student_timetables,
  public.student_fees,
  public.leave_requests,
  public.announcements,
  public.support_requests
to authenticated;

drop policy if exists studentpath_timetables_student_select on public.student_timetables;
drop policy if exists studentpath_timetables_admin_manage on public.student_timetables;
drop policy if exists studentpath_timetables_select_scope on public.student_timetables;
drop policy if exists studentpath_timetables_insert_scope on public.student_timetables;
drop policy if exists studentpath_timetables_update_scope on public.student_timetables;
drop policy if exists studentpath_timetables_delete_scope on public.student_timetables;
create policy studentpath_timetables_student_select on public.student_timetables
  for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      published
      and exists (select 1 from public.students s where s.id::text = student_timetables.student_id and s.auth_user_id = auth.uid())
    )
  );
create policy studentpath_timetables_admin_manage on public.student_timetables
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_timetables_select_scope on public.student_timetables
  as restrictive for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      published
      and exists (select 1 from public.students s where s.id::text = student_timetables.student_id and s.auth_user_id = auth.uid())
    )
  );
create policy studentpath_timetables_insert_scope on public.student_timetables
  as restrictive for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_timetables_update_scope on public.student_timetables
  as restrictive for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_timetables_delete_scope on public.student_timetables
  as restrictive for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists studentpath_fees_student_select on public.student_fees;
drop policy if exists studentpath_fees_admin_manage on public.student_fees;
drop policy if exists studentpath_fees_select_scope on public.student_fees;
drop policy if exists studentpath_fees_insert_scope on public.student_fees;
drop policy if exists studentpath_fees_update_scope on public.student_fees;
drop policy if exists studentpath_fees_delete_scope on public.student_fees;
create policy studentpath_fees_student_select on public.student_fees
  for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (select 1 from public.students s where s.id::text = student_fees.student_id and s.auth_user_id = auth.uid())
  );
create policy studentpath_fees_admin_manage on public.student_fees
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_fees_select_scope on public.student_fees
  as restrictive for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (select 1 from public.students s where s.id::text = student_fees.student_id and s.auth_user_id = auth.uid())
  );
create policy studentpath_fees_insert_scope on public.student_fees
  as restrictive for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_fees_update_scope on public.student_fees
  as restrictive for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_fees_delete_scope on public.student_fees
  as restrictive for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists studentpath_leave_student_select on public.leave_requests;
drop policy if exists studentpath_leave_student_insert on public.leave_requests;
drop policy if exists studentpath_leave_admin_manage on public.leave_requests;
drop policy if exists studentpath_leave_select_scope on public.leave_requests;
drop policy if exists studentpath_leave_insert_scope on public.leave_requests;
drop policy if exists studentpath_leave_update_scope on public.leave_requests;
drop policy if exists studentpath_leave_delete_scope on public.leave_requests;
create policy studentpath_leave_student_select on public.leave_requests
  for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (select 1 from public.students s where s.id::text = leave_requests.student_id and s.auth_user_id = auth.uid())
  );
create policy studentpath_leave_student_insert on public.leave_requests
  for insert to authenticated
  with check (
    status = 'pending'
    and admin_note is null
    and exists (select 1 from public.students s where s.id::text = leave_requests.student_id and s.auth_user_id = auth.uid())
  );
create policy studentpath_leave_admin_manage on public.leave_requests
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_leave_select_scope on public.leave_requests
  as restrictive for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (select 1 from public.students s where s.id::text = leave_requests.student_id and s.auth_user_id = auth.uid())
  );
create policy studentpath_leave_insert_scope on public.leave_requests
  as restrictive for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      status = 'pending'
      and admin_note is null
      and exists (select 1 from public.students s where s.id::text = leave_requests.student_id and s.auth_user_id = auth.uid())
    )
  );
create policy studentpath_leave_update_scope on public.leave_requests
  as restrictive for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_leave_delete_scope on public.leave_requests
  as restrictive for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists studentpath_announcements_student_select on public.announcements;
drop policy if exists studentpath_announcements_admin_manage on public.announcements;
drop policy if exists studentpath_announcements_select_scope on public.announcements;
drop policy if exists studentpath_announcements_insert_scope on public.announcements;
drop policy if exists studentpath_announcements_update_scope on public.announcements;
drop policy if exists studentpath_announcements_delete_scope on public.announcements;
create policy studentpath_announcements_student_select on public.announcements
  for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (published and publish_at <= now())
  );
create policy studentpath_announcements_admin_manage on public.announcements
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_announcements_select_scope on public.announcements
  as restrictive for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (published and publish_at <= now())
  );
create policy studentpath_announcements_insert_scope on public.announcements
  as restrictive for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_announcements_update_scope on public.announcements
  as restrictive for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_announcements_delete_scope on public.announcements
  as restrictive for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists studentpath_support_student_select on public.support_requests;
drop policy if exists studentpath_support_student_insert on public.support_requests;
drop policy if exists studentpath_support_admin_manage on public.support_requests;
drop policy if exists studentpath_support_select_scope on public.support_requests;
drop policy if exists studentpath_support_insert_scope on public.support_requests;
drop policy if exists studentpath_support_update_scope on public.support_requests;
drop policy if exists studentpath_support_delete_scope on public.support_requests;
create policy studentpath_support_student_select on public.support_requests
  for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (select 1 from public.students s where s.id::text = support_requests.student_id and s.auth_user_id = auth.uid())
  );
create policy studentpath_support_student_insert on public.support_requests
  for insert to authenticated
  with check (
    status = 'open'
    and admin_note is null
    and exists (select 1 from public.students s where s.id::text = support_requests.student_id and s.auth_user_id = auth.uid())
  );
create policy studentpath_support_admin_manage on public.support_requests
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_support_select_scope on public.support_requests
  as restrictive for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (select 1 from public.students s where s.id::text = support_requests.student_id and s.auth_user_id = auth.uid())
  );
create policy studentpath_support_insert_scope on public.support_requests
  as restrictive for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      status = 'open'
      and admin_note is null
      and exists (select 1 from public.students s where s.id::text = support_requests.student_id and s.auth_user_id = auth.uid())
    )
  );
create policy studentpath_support_update_scope on public.support_requests
  as restrictive for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_support_delete_scope on public.support_requests
  as restrictive for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
