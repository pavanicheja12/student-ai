-- StudentPath personal journey, goals, planner and private mentor data.
--
-- Additive migration: does not alter the existing academic tables. Apply only
-- after public.students.auth_user_id, faculty_assignments and the base student
-- access migration have been reviewed and installed. student_id uses text to
-- match the installation-specific public.students.id type.

create table if not exists public.student_goals (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  goal_type text not null default 'academic'
    check (goal_type in ('academic', 'skill', 'personal')),
  target_value numeric,
  current_value numeric not null default 0,
  target_date date,
  status text not null default 'active'
    check (status in ('active', 'completed', 'missed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_value is null or target_value >= 0),
  check (current_value >= 0)
);

create table if not exists public.student_goal_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.student_goals(id) on delete cascade,
  student_id text not null,
  title text not null check (length(trim(title)) between 1 and 200),
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.student_skills (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'skill',
  proficiency text,
  evidence_url text,
  verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.journey_events (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  event_type text not null check (length(trim(event_type)) between 1 and 80),
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  occurred_at timestamptz not null default now(),
  source text not null default 'student'
    check (source in ('student', 'institution')),
  created_at timestamptz not null default now()
);

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  title text not null check (length(trim(title)) between 1 and 200),
  week_start date not null,
  notes text,
  ai_generated boolean not null default false,
  status text not null default 'active'
    check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  study_plan_id uuid not null references public.study_plans(id) on delete cascade,
  student_id text not null,
  title text not null check (length(trim(title)) between 1 and 200),
  subject text,
  due_at timestamptz,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  category text not null check (length(trim(category)) between 1 and 80),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'unknown')),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  observation_start date,
  observation_end date,
  rule_version text not null,
  recommended_action text,
  review_status text not null default 'needs_review'
    check (review_status in ('needs_review', 'reviewed', 'resolved')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (observation_end is null or observation_start is null or observation_end >= observation_start)
);

create table if not exists public.mentor_conversations (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  title text not null default 'Academic mentor conversation'
    check (length(trim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mentor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mentor_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(trim(content)) between 1 and 8000),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_shares (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mentor_conversations(id) on delete cascade,
  faculty_user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (conversation_id, faculty_user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  title text not null check (length(trim(title)) between 1 and 200),
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists student_goals_owner_idx on public.student_goals (student_id, status, target_date);
create index if not exists student_goal_tasks_owner_idx on public.student_goal_tasks (student_id, due_date);
create index if not exists student_skills_owner_idx on public.student_skills (student_id, created_at desc);
create index if not exists journey_events_owner_idx on public.journey_events (student_id, occurred_at desc);
create index if not exists study_plans_owner_idx on public.study_plans (student_id, week_start desc);
create index if not exists study_tasks_owner_idx on public.study_tasks (student_id, due_at);
create index if not exists risk_assessments_owner_idx on public.risk_assessments (student_id, created_at desc);
create index if not exists mentor_conversations_owner_idx on public.mentor_conversations (student_id, updated_at desc);
create index if not exists mentor_messages_conversation_idx on public.mentor_messages (conversation_id, created_at);
create index if not exists conversation_shares_faculty_idx on public.conversation_shares (faculty_user_id, active);
create index if not exists notifications_owner_idx on public.notifications (student_id, created_at desc);

alter table public.student_goals enable row level security;
alter table public.student_goal_tasks enable row level security;
alter table public.student_skills enable row level security;
alter table public.journey_events enable row level security;
alter table public.study_plans enable row level security;
alter table public.study_tasks enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.mentor_conversations enable row level security;
alter table public.mentor_messages enable row level security;
alter table public.conversation_shares enable row level security;
alter table public.notifications enable row level security;

revoke all on table
  public.student_goals, public.student_goal_tasks, public.student_skills,
  public.journey_events, public.study_plans, public.study_tasks,
  public.risk_assessments, public.mentor_conversations, public.mentor_messages,
  public.conversation_shares, public.notifications
from public, anon, authenticated;
grant select, insert, update, delete on table
  public.student_goals, public.student_goal_tasks, public.student_skills,
  public.journey_events, public.study_plans, public.study_tasks,
  public.risk_assessments, public.mentor_conversations, public.mentor_messages,
  public.conversation_shares, public.notifications
to authenticated;

create or replace function public.studentpath_is_conversation_owner(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select exists (
    select 1
    from public.mentor_conversations conversation
    join public.students student on student.id::text = conversation.student_id
    where conversation.id = target_conversation_id
      and student.auth_user_id = auth.uid()
  );
$function$;

create or replace function public.studentpath_can_read_shared_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select exists (
    select 1
    from public.mentor_conversations conversation
    join public.conversation_shares share
      on share.conversation_id = conversation.id
      and share.active
      and share.faculty_user_id = auth.uid()
    join public.faculty_assignments assignment
      on assignment.student_id = conversation.student_id
      and assignment.faculty_user_id = auth.uid()
      and assignment.is_active
    where conversation.id = target_conversation_id
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty'
  );
$function$;

revoke all on function public.studentpath_is_conversation_owner(uuid) from public, anon;
revoke all on function public.studentpath_can_read_shared_conversation(uuid) from public, anon;
grant execute on function public.studentpath_is_conversation_owner(uuid) to authenticated;
grant execute on function public.studentpath_can_read_shared_conversation(uuid) to authenticated;

-- Personal records are writable only by the linked student. A small subset is
-- also readable by assigned faculty; notification and goal contents stay private.
do $policies$
declare
  table_name text;
  faculty_select_scope text;
begin
  foreach table_name in array array[
    'student_goals', 'student_goal_tasks', 'student_skills',
    'journey_events', 'study_plans', 'study_tasks', 'notifications'
  ]
  loop
    execute format('drop policy if exists studentpath_owner_select on public.%I', table_name);
    execute format('drop policy if exists studentpath_owner_insert on public.%I', table_name);
    execute format('drop policy if exists studentpath_owner_update on public.%I', table_name);
    execute format('drop policy if exists studentpath_owner_delete on public.%I', table_name);
    execute format('drop policy if exists studentpath_owner_select_guard on public.%I', table_name);
    execute format('drop policy if exists studentpath_owner_insert_guard on public.%I', table_name);
    execute format('drop policy if exists studentpath_owner_update_guard on public.%I', table_name);
    execute format('drop policy if exists studentpath_owner_delete_guard on public.%I', table_name);
    faculty_select_scope := case
      when table_name = any(array['student_skills', 'journey_events', 'study_plans', 'study_tasks'])
      then format(
        ' or ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''faculty'' and public.studentpath_is_assigned_student(%I.student_id))',
        table_name
      )
      else ''
    end;
    execute format(
      'create policy studentpath_owner_select on public.%I for select to authenticated using (
        exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid())%s
      )',
      table_name, table_name, faculty_select_scope
    );
    execute format(
      'create policy studentpath_owner_insert on public.%I for insert to authenticated with check (
        exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid())
      )',
      table_name, table_name
    );
    execute format(
      'create policy studentpath_owner_update on public.%I for update to authenticated
        using (exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid()))
        with check (exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid()))',
      table_name, table_name, table_name
    );
    execute format(
      'create policy studentpath_owner_delete on public.%I for delete to authenticated using (
        exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid())
      )',
      table_name, table_name
    );
    execute format(
      'create policy studentpath_owner_select_guard on public.%I as restrictive for select to authenticated using (
        (auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin''
        or exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid())%s
      )',
      table_name, table_name, faculty_select_scope
    );
    execute format(
      'create policy studentpath_owner_insert_guard on public.%I as restrictive for insert to authenticated with check (
        (auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin''
        or exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid())
      )',
      table_name, table_name
    );
    execute format(
      'create policy studentpath_owner_update_guard on public.%I as restrictive for update to authenticated
        using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'' or exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid()))
        with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'' or exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid()))',
      table_name, table_name, table_name
    );
    execute format(
      'create policy studentpath_owner_delete_guard on public.%I as restrictive for delete to authenticated using (
        (auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin''
        or exists (select 1 from public.students s where s.id::text = %I.student_id and s.auth_user_id = auth.uid())
      )',
      table_name, table_name
    );
  end loop;
end
$policies$;

do $drop_policies$
declare
  item record;
begin
  for item in
    select * from (values
      ('studentpath_skills_admin_manage', 'student_skills'),
      ('studentpath_skills_student_insert_guard', 'student_skills'),
      ('studentpath_skills_student_update_guard', 'student_skills'),
      ('studentpath_journey_admin_manage', 'journey_events'),
      ('studentpath_journey_student_insert_guard', 'journey_events'),
      ('studentpath_journey_student_update_guard', 'journey_events'),
      ('studentpath_journey_student_delete_guard', 'journey_events'),
      ('studentpath_risks_select', 'risk_assessments'),
      ('studentpath_risks_select_guard', 'risk_assessments'),
      ('studentpath_risks_admin_manage', 'risk_assessments'),
      ('studentpath_risks_faculty_review', 'risk_assessments'),
      ('studentpath_risks_insert_guard', 'risk_assessments'),
      ('studentpath_risks_update_guard', 'risk_assessments'),
      ('studentpath_risks_delete_guard', 'risk_assessments'),
      ('studentpath_conversations_owner_select', 'mentor_conversations'),
      ('studentpath_conversations_owner_insert', 'mentor_conversations'),
      ('studentpath_conversations_owner_update', 'mentor_conversations'),
      ('studentpath_conversations_owner_delete', 'mentor_conversations'),
      ('studentpath_conversations_select_guard', 'mentor_conversations'),
      ('studentpath_conversations_insert_guard', 'mentor_conversations'),
      ('studentpath_conversations_update_guard', 'mentor_conversations'),
      ('studentpath_conversations_delete_guard', 'mentor_conversations'),
      ('studentpath_messages_owner_select', 'mentor_messages'),
      ('studentpath_messages_owner_insert', 'mentor_messages'),
      ('studentpath_messages_select_guard', 'mentor_messages'),
      ('studentpath_messages_insert_guard', 'mentor_messages'),
      ('studentpath_shares_owner_select', 'conversation_shares'),
      ('studentpath_shares_owner_insert', 'conversation_shares'),
      ('studentpath_shares_owner_update', 'conversation_shares'),
      ('studentpath_shares_select_guard', 'conversation_shares'),
      ('studentpath_shares_insert_guard', 'conversation_shares'),
      ('studentpath_shares_update_guard', 'conversation_shares'),
      ('studentpath_shares_delete_guard', 'conversation_shares')
    ) as policies(policy_name, table_name)
  loop
    execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
  end loop;
end
$drop_policies$;

-- Students can add unverified skills; only admins can set institution
-- verification fields.
create policy studentpath_skills_admin_manage on public.student_skills
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_skills_student_insert_guard on public.student_skills
  as restrictive for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (not verified and verified_by is null)
  );
create policy studentpath_skills_student_update_guard on public.student_skills
  as restrictive for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' or not verified)
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' or (not verified and verified_by is null));

-- Institution-origin journey events are read-only to students.
create policy studentpath_journey_admin_manage on public.journey_events
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_journey_student_insert_guard on public.journey_events
  as restrictive for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' or source = 'student');
create policy studentpath_journey_student_update_guard on public.journey_events
  as restrictive for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' or source = 'student')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' or source = 'student');
create policy studentpath_journey_student_delete_guard on public.journey_events
  as restrictive for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' or source = 'student');

-- Risk records are generated/reviewed by authorized staff, never self-edited.
create policy studentpath_risks_select on public.risk_assessments
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id::text = risk_assessments.student_id and s.auth_user_id = auth.uid())
    or ((auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty' and public.studentpath_is_assigned_student(risk_assessments.student_id))
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
create policy studentpath_risks_select_guard on public.risk_assessments
  as restrictive for select to authenticated
  using (
    exists (select 1 from public.students s where s.id::text = risk_assessments.student_id and s.auth_user_id = auth.uid())
    or ((auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty' and public.studentpath_is_assigned_student(risk_assessments.student_id))
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
create policy studentpath_risks_admin_manage on public.risk_assessments
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_risks_faculty_review on public.risk_assessments
  for update to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty'
    and public.studentpath_is_assigned_student(risk_assessments.student_id)
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty'
    and public.studentpath_is_assigned_student(risk_assessments.student_id)
  );
create policy studentpath_risks_insert_guard on public.risk_assessments
  as restrictive for insert to authenticated
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy studentpath_risks_update_guard on public.risk_assessments
  as restrictive for update to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty'
      and public.studentpath_is_assigned_student(risk_assessments.student_id)
    )
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'faculty'
      and public.studentpath_is_assigned_student(risk_assessments.student_id)
    )
  );
create policy studentpath_risks_delete_guard on public.risk_assessments
  as restrictive for delete to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists studentpath_goal_tasks_parent_insert_guard on public.student_goal_tasks;
drop policy if exists studentpath_goal_tasks_parent_update_guard on public.student_goal_tasks;
drop policy if exists studentpath_study_tasks_parent_insert_guard on public.study_tasks;
drop policy if exists studentpath_study_tasks_parent_update_guard on public.study_tasks;
create policy studentpath_goal_tasks_parent_insert_guard on public.student_goal_tasks
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from public.student_goals goal
      where goal.id = student_goal_tasks.goal_id
        and goal.student_id = student_goal_tasks.student_id
    )
  );
create policy studentpath_goal_tasks_parent_update_guard on public.student_goal_tasks
  as restrictive for update to authenticated
  using (
    exists (
      select 1 from public.student_goals goal
      where goal.id = student_goal_tasks.goal_id
        and goal.student_id = student_goal_tasks.student_id
    )
  )
  with check (
    exists (
      select 1 from public.student_goals goal
      where goal.id = student_goal_tasks.goal_id
        and goal.student_id = student_goal_tasks.student_id
    )
  );
create policy studentpath_study_tasks_parent_insert_guard on public.study_tasks
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from public.study_plans plan
      where plan.id = study_tasks.study_plan_id
        and plan.student_id = study_tasks.student_id
    )
  );
create policy studentpath_study_tasks_parent_update_guard on public.study_tasks
  as restrictive for update to authenticated
  using (
    exists (
      select 1 from public.study_plans plan
      where plan.id = study_tasks.study_plan_id
        and plan.student_id = study_tasks.student_id
    )
  )
  with check (
    exists (
      select 1 from public.study_plans plan
      where plan.id = study_tasks.study_plan_id
        and plan.student_id = study_tasks.student_id
    )
  );

-- Conversations remain private to the owner, except for an active, explicit
-- share to a faculty member whose assignment is still active.
create policy studentpath_conversations_owner_select on public.mentor_conversations
  for select to authenticated
  using (public.studentpath_is_conversation_owner(id) or public.studentpath_can_read_shared_conversation(id));
create policy studentpath_conversations_owner_insert on public.mentor_conversations
  for insert to authenticated
  with check (exists (select 1 from public.students s where s.id::text = mentor_conversations.student_id and s.auth_user_id = auth.uid()));
create policy studentpath_conversations_owner_update on public.mentor_conversations
  for update to authenticated
  using (public.studentpath_is_conversation_owner(id))
  with check (public.studentpath_is_conversation_owner(id));
create policy studentpath_conversations_owner_delete on public.mentor_conversations
  for delete to authenticated
  using (public.studentpath_is_conversation_owner(id));
create policy studentpath_conversations_select_guard on public.mentor_conversations
  as restrictive for select to authenticated
  using (public.studentpath_is_conversation_owner(id) or public.studentpath_can_read_shared_conversation(id));
create policy studentpath_conversations_insert_guard on public.mentor_conversations
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.students s where s.id::text = mentor_conversations.student_id and s.auth_user_id = auth.uid()));
create policy studentpath_conversations_update_guard on public.mentor_conversations
  as restrictive for update to authenticated
  using (public.studentpath_is_conversation_owner(id))
  with check (public.studentpath_is_conversation_owner(id));
create policy studentpath_conversations_delete_guard on public.mentor_conversations
  as restrictive for delete to authenticated
  using (public.studentpath_is_conversation_owner(id));

create policy studentpath_messages_owner_select on public.mentor_messages
  for select to authenticated
  using (exists (select 1 from public.mentor_conversations c where c.id = mentor_messages.conversation_id));
create policy studentpath_messages_owner_insert on public.mentor_messages
  for insert to authenticated
  with check (
    role = 'user'
    and exists (
      select 1 from public.mentor_conversations c
      join public.students s on s.id::text = c.student_id and s.auth_user_id = auth.uid()
      where c.id = mentor_messages.conversation_id
    )
  );
create policy studentpath_messages_select_guard on public.mentor_messages
  as restrictive for select to authenticated
  using (exists (select 1 from public.mentor_conversations c where c.id = mentor_messages.conversation_id));
create policy studentpath_messages_insert_guard on public.mentor_messages
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from public.mentor_conversations c
      join public.students s on s.id::text = c.student_id and s.auth_user_id = auth.uid()
      where c.id = mentor_messages.conversation_id
    )
  );

create policy studentpath_shares_owner_select on public.conversation_shares
  for select to authenticated
  using (
    public.studentpath_is_conversation_owner(conversation_id)
    or (faculty_user_id = auth.uid() and public.studentpath_can_read_shared_conversation(conversation_id))
  );
create policy studentpath_shares_owner_insert on public.conversation_shares
  for insert to authenticated
  with check (
    active
    and exists (
      select 1 from public.mentor_conversations c
      join public.students s on s.id::text = c.student_id and s.auth_user_id = auth.uid()
      join public.faculty_assignments fa on fa.student_id = c.student_id and fa.faculty_user_id = conversation_shares.faculty_user_id and fa.is_active
      where c.id = conversation_shares.conversation_id
    )
  );
create policy studentpath_shares_owner_update on public.conversation_shares
  for update to authenticated
  using (public.studentpath_is_conversation_owner(conversation_id))
  with check (
    public.studentpath_is_conversation_owner(conversation_id)
    and (
      not active
      or exists (
        select 1 from public.mentor_conversations c
        join public.faculty_assignments fa on fa.student_id = c.student_id and fa.faculty_user_id = conversation_shares.faculty_user_id and fa.is_active
        where c.id = conversation_shares.conversation_id
      )
    )
  );
create policy studentpath_shares_select_guard on public.conversation_shares
  as restrictive for select to authenticated
  using (
    public.studentpath_is_conversation_owner(conversation_id)
    or (faculty_user_id = auth.uid() and public.studentpath_can_read_shared_conversation(conversation_id))
  );
create policy studentpath_shares_insert_guard on public.conversation_shares
  as restrictive for insert to authenticated
  with check (
    active
    and exists (
      select 1 from public.mentor_conversations c
      join public.students s on s.id::text = c.student_id and s.auth_user_id = auth.uid()
      join public.faculty_assignments fa on fa.student_id = c.student_id and fa.faculty_user_id = conversation_shares.faculty_user_id and fa.is_active
      where c.id = conversation_shares.conversation_id
    )
  );
create policy studentpath_shares_update_guard on public.conversation_shares
  as restrictive for update to authenticated
  using (public.studentpath_is_conversation_owner(conversation_id))
  with check (
    public.studentpath_is_conversation_owner(conversation_id)
    and (
      not active
      or exists (
        select 1 from public.mentor_conversations c
        join public.faculty_assignments fa on fa.student_id = c.student_id and fa.faculty_user_id = conversation_shares.faculty_user_id and fa.is_active
        where c.id = conversation_shares.conversation_id
      )
    )
  );
create policy studentpath_shares_delete_guard on public.conversation_shares
  as restrictive for delete to authenticated
  using (public.studentpath_is_conversation_owner(conversation_id));
