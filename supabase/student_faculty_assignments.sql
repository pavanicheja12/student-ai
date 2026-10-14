-- StudentPath faculty assignment boundary.
--
-- Run before student_access_policies.sql. The student_id is stored as text
-- because the existing students primary-key type is installation-specific.
-- Access is granted only by a trusted app_metadata.role = 'faculty' claim and
-- an active assignment created by an administrator.

create table if not exists public.faculty_assignments (
  id uuid primary key default gen_random_uuid(),
  faculty_user_id uuid not null references auth.users(id) on delete cascade,
  student_id text not null,
  is_active boolean not null default true,
  assigned_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (faculty_user_id, student_id)
);

create index if not exists faculty_assignments_active_faculty_idx
  on public.faculty_assignments (faculty_user_id, student_id)
  where is_active;

create or replace function public.studentpath_is_assigned_student(target_student_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select exists (
    select 1
    from public.faculty_assignments assignment
    where assignment.student_id = target_student_id
      and assignment.faculty_user_id = auth.uid()
      and assignment.is_active
  );
$function$;
revoke all on function public.studentpath_is_assigned_student(text) from public, anon;
grant execute on function public.studentpath_is_assigned_student(text) to authenticated;

alter table public.faculty_assignments enable row level security;

revoke all on table public.faculty_assignments from public, anon, authenticated;
grant select, insert, update, delete on table public.faculty_assignments to authenticated;

drop policy if exists studentpath_faculty_assignments_select on public.faculty_assignments;
drop policy if exists studentpath_faculty_assignments_admin_manage on public.faculty_assignments;
drop policy if exists studentpath_faculty_assignments_select_scope on public.faculty_assignments;
drop policy if exists studentpath_faculty_assignments_insert_scope on public.faculty_assignments;
drop policy if exists studentpath_faculty_assignments_update_scope on public.faculty_assignments;
drop policy if exists studentpath_faculty_assignments_delete_scope on public.faculty_assignments;

create policy studentpath_faculty_assignments_select
  on public.faculty_assignments
  for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty'
      and faculty_user_id = auth.uid()
      and is_active
    )
    or exists (
      select 1 from public.students s
      where s.id::text = faculty_assignments.student_id
        and s.auth_user_id = auth.uid()
    )
  );

create policy studentpath_faculty_assignments_admin_manage
  on public.faculty_assignments
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy studentpath_faculty_assignments_select_scope
  on public.faculty_assignments
  as restrictive for select to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty'
      and faculty_user_id = auth.uid()
      and is_active
    )
    or exists (
      select 1 from public.students s
      where s.id::text = faculty_assignments.student_id
        and s.auth_user_id = auth.uid()
    )
  );

create policy studentpath_faculty_assignments_insert_scope
  on public.faculty_assignments
  as restrictive for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy studentpath_faculty_assignments_update_scope
  on public.faculty_assignments
  as restrictive for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy studentpath_faculty_assignments_delete_scope
  on public.faculty_assignments
  as restrictive for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
