-- StudentPath student/admin access migration.
--
-- Review the live schema and existing policies before applying. This migration
-- assumes students.id is the student primary key and each related table has a
-- student_id foreign key to students.id.
--
-- Admin authorization comes only from trusted Auth app_metadata.role = 'admin'.
-- Never assign the admin role from user_metadata or browser code.
--
-- Run this file in Supabase Dashboard > SQL Editor only after confirming that
-- removing existing client grants and adding auth_user_id is appropriate.

alter table public.students
  add column if not exists auth_user_id uuid unique references auth.users(id);

alter table public.students enable row level security;
alter table public.attendance_records enable row level security;
alter table public.assessments enable row level security;
alter table public.interventions enable row level security;
alter table public.student_outcomes enable row level security;

revoke all on table
  public.students,
  public.attendance_records,
  public.assessments,
  public.interventions,
  public.student_outcomes
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.students,
  public.attendance_records,
  public.assessments,
  public.interventions,
  public.student_outcomes
to authenticated;

-- Restore the minimum sequence privileges needed for admin inserts into
-- existing serial/identity columns. Students remain unable to insert rows
-- because the policies below restrict writes to administrators.
do $migration$
declare
  sequence_name text;
begin
  for sequence_name in
    select sequence_relation.oid::regclass::text
    from pg_class as sequence_relation
    join pg_depend as dependency
      on dependency.objid = sequence_relation.oid
      and dependency.classid = 'pg_class'::regclass
      and dependency.refclassid = 'pg_class'::regclass
      and dependency.deptype in ('a', 'i')
    join pg_class as table_relation
      on table_relation.oid = dependency.refobjid
    where sequence_relation.relkind = 'S'
      and table_relation.relnamespace = 'public'::regnamespace
      and table_relation.relname = any (array[
        'students',
        'attendance_records',
        'assessments',
        'interventions',
        'student_outcomes'
      ])
  loop
    execute format(
      'revoke all on sequence %s from public, anon, authenticated',
      sequence_name
    );
    execute format(
      'grant usage, select on sequence %s to authenticated',
      sequence_name
    );
  end loop;
end
$migration$;

-- A restrictive policy per command clamps any older permissive policy: old
-- broad policies cannot grant students access to other rows or write access.
do $migration$
declare
  table_name text;
  row_scope text;
  admin_scope constant text :=
    '(auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin''';
begin
  foreach table_name in array array[
    'students',
    'attendance_records',
    'assessments',
    'interventions',
    'student_outcomes'
  ]
  loop
    if table_name = 'students' then
      row_scope := format(
        '(auth.uid() = auth_user_id or %s or (
          (auth.jwt() -> ''app_metadata'' ->> ''role'') = ''faculty''
          and public.studentpath_is_assigned_student(students.id::text)
        ))',
        admin_scope
      );
    else
      row_scope := format(
        '(%s or exists (
          select 1
          from public.students as linked_student
          where linked_student.id = %I.student_id
            and (
              linked_student.auth_user_id = auth.uid()
              or (
                (auth.jwt() -> ''app_metadata'' ->> ''role'') = ''faculty''
                and public.studentpath_is_assigned_student(linked_student.id::text)
              )
            )
        ))',
        admin_scope,
        table_name
      );
    end if;

    execute format('drop policy if exists %I on public.%I',
      'studentpath_' || table_name || '_student_select', table_name);
    execute format('drop policy if exists %I on public.%I',
      'studentpath_' || table_name || '_admin_manage', table_name);
    execute format('drop policy if exists %I on public.%I',
      'studentpath_' || table_name || '_select_scope', table_name);
    execute format('drop policy if exists %I on public.%I',
      'studentpath_' || table_name || '_insert_scope', table_name);
    execute format('drop policy if exists %I on public.%I',
      'studentpath_' || table_name || '_update_scope', table_name);
    execute format('drop policy if exists %I on public.%I',
      'studentpath_' || table_name || '_delete_scope', table_name);

    -- Students may read only their own row(s); admins may read all rows.
    execute format(
      'create policy %I on public.%I as permissive for select to authenticated using (%s)',
      'studentpath_' || table_name || '_student_select',
      table_name,
      row_scope
    );

    -- Admins may manage all rows.
    execute format(
      'create policy %I on public.%I as permissive for all to authenticated using (%s) with check (%s)',
      'studentpath_' || table_name || '_admin_manage',
      table_name,
      admin_scope,
      admin_scope
    );

    -- Restrictive guards ensure pre-existing permissive policies cannot widen access.
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (%s)',
      'studentpath_' || table_name || '_select_scope',
      table_name,
      row_scope
    );
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
      'studentpath_' || table_name || '_insert_scope',
      table_name,
      admin_scope
    );

    if table_name = 'interventions' then
      execute format(
        'drop policy if exists %I on public.%I',
        'studentpath_interventions_faculty_insert',
        table_name
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (
          (auth.jwt() -> ''app_metadata'' ->> ''role'') = ''faculty''
          and public.studentpath_is_assigned_student(%I.student_id::text)
        )',
        'studentpath_interventions_faculty_insert',
        table_name,
        table_name
      );
      execute format(
        'drop policy if exists %I on public.%I',
        'studentpath_' || table_name || '_insert_scope',
        table_name
      );
      execute format(
        'create policy %I on public.%I as restrictive for insert to authenticated with check (
          (%s) or (
            (auth.jwt() -> ''app_metadata'' ->> ''role'') = ''faculty''
            and public.studentpath_is_assigned_student(%I.student_id::text)
          )
        )',
        'studentpath_' || table_name || '_insert_scope',
        table_name,
        admin_scope,
        table_name
      );
    end if;
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
      'studentpath_' || table_name || '_update_scope',
      table_name,
      admin_scope,
      admin_scope
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
      'studentpath_' || table_name || '_delete_scope',
      table_name,
      admin_scope
    );
  end loop;
end
$migration$;
