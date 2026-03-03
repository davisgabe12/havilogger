-- HAVI Supabase migration (UUID-aligned, no drops)
-- Assumes existing UUID tables: families, family_members, children, memory_chunks

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Extend existing tables (no drops)
alter table if exists family_members
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text;

alter table if exists children
  add column if not exists name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists gender text,
  add column if not exists birth_weight numeric,
  add column if not exists birth_weight_unit text,
  add column if not exists latest_weight numeric,
  add column if not exists latest_weight_date date,
  add column if not exists timezone text,
  add column if not exists routine_eligible boolean default false,
  add column if not exists adjusted_birth_date date,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Constraints (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'children_birth_or_due_check'
  ) then
    alter table children
      add constraint children_birth_or_due_check
      check (birth_date is not null or due_date is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'children_gender_check'
  ) then
    alter table children
      add constraint children_gender_check
      check (gender in ('boy','girl','unknown') or gender is null);
  end if;
end $$;

-- New app-core tables (UUID PKs)
create table if not exists conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid null references children(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  title text not null default 'New chat',
  is_active boolean default true,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  catch_up_mode boolean default false,
  catch_up_started_at timestamptz,
  catch_up_last_message_at timestamptz
);
create index if not exists conversation_sessions_family_id_idx on conversation_sessions(family_id);
create index if not exists conversation_sessions_child_id_idx on conversation_sessions(child_id);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references conversation_sessions(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  role text not null,
  content text not null,
  intent text,
  created_at timestamptz default now()
);
create index if not exists conversation_messages_session_id_idx on conversation_messages(session_id);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  actions_json jsonb not null,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists activity_logs_family_id_idx on activity_logs(family_id);
create index if not exists activity_logs_child_id_idx on activity_logs(child_id);

create table if not exists timeline_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  type text not null,
  title text not null,
  detail text,
  amount_label text,
  start timestamptz not null,
  "end" timestamptz,
  has_note boolean default false,
  is_custom boolean default false,
  source text,
  origin_message_id uuid,
  created_at timestamptz default now()
);
create index if not exists timeline_events_family_id_idx on timeline_events(family_id);
create index if not exists timeline_events_child_start_idx on timeline_events(child_id, start);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid null references children(id) on delete set null,
  title text not null,
  status text not null default 'open',
  due_at timestamptz,
  remind_at timestamptz,
  completed_at timestamptz,
  reminder_channel text,
  last_reminded_at timestamptz,
  snooze_count integer default 0,
  is_recurring boolean default false,
  recurrence_rule text,
  created_at timestamptz default now(),
  created_by_user_id uuid null references auth.users(id),
  assigned_to_user_id uuid null references auth.users(id)
);
create index if not exists tasks_family_id_idx on tasks(family_id);
create index if not exists tasks_child_id_idx on tasks(child_id);
create index if not exists tasks_status_idx on tasks(status);

create table if not exists routine_metrics (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null unique references children(id) on delete cascade,
  prompt_shown_count integer default 0,
  accepted_count integer default 0,
  first_prompt_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists daily_child_metrics (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id) on delete cascade,
  date date not null,
  metrics_json jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(child_id, date)
);

create table if not exists knowledge_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  type text not null,
  status text not null,
  payload jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_prompted_at timestamptz,
  last_prompted_session_id uuid
);
create index if not exists knowledge_items_family_id_idx on knowledge_items(family_id);
create index if not exists knowledge_items_user_id_idx on knowledge_items(user_id);
create index if not exists knowledge_items_status_idx on knowledge_items(status);

create table if not exists inferences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid null references children(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  inference_type text not null,
  payload jsonb not null default '{}',
  confidence numeric default 0.5,
  status text not null default 'pending',
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz,
  dedupe_key text,
  last_prompted_at timestamptz
);
create unique index if not exists inferences_dedupe_key_idx on inferences(dedupe_key);
create index if not exists inferences_family_id_idx on inferences(family_id);

create table if not exists message_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversation_sessions(id) on delete cascade,
  message_id uuid not null references conversation_messages(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  session_id text,
  rating text not null check (rating in ('up','down')),
  feedback_text text,
  model_version text,
  response_metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists message_feedback_user_unique
  on message_feedback(conversation_id, message_id, user_id)
  where user_id is not null;
create unique index if not exists message_feedback_session_unique
  on message_feedback(conversation_id, message_id, session_id)
  where session_id is not null;

create table if not exists share_links (
  token text primary key,
  session_id uuid not null references conversation_sessions(id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz
);

create table if not exists loading_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid null references conversation_sessions(id) on delete set null,
  message_id uuid null references conversation_messages(id) on delete set null,
  thinking_short_ms double precision,
  thinking_rich_ms double precision,
  error_type text,
  retry_count integer,
  created_at timestamptz default now()
);

-- RLS enable
alter table families enable row level security;
alter table family_members enable row level security;
alter table children enable row level security;
alter table memory_chunks enable row level security;
alter table conversation_sessions enable row level security;
alter table conversation_messages enable row level security;
alter table activity_logs enable row level security;
alter table timeline_events enable row level security;
alter table tasks enable row level security;
alter table routine_metrics enable row level security;
alter table daily_child_metrics enable row level security;
alter table knowledge_items enable row level security;
alter table inferences enable row level security;
alter table message_feedback enable row level security;
alter table share_links enable row level security;
alter table loading_metrics enable row level security;

-- RLS policies (idempotent via DO blocks)

-- families
DO $$ BEGIN
  CREATE POLICY families_select ON families
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = families.id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY families_insert ON families
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY families_update ON families
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = families.id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- family_members
DO $$ BEGIN
  CREATE POLICY family_members_select ON family_members
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_members.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY family_members_insert ON family_members
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY family_members_update ON family_members
    FOR UPDATE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY family_members_delete ON family_members
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- children
DO $$ BEGIN
  CREATE POLICY children_select ON children
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = children.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY children_insert ON children
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = children.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY children_update ON children
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = children.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY children_delete ON children
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = children.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- memory_chunks
DO $$ BEGIN
  CREATE POLICY memory_chunks_select ON memory_chunks
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = memory_chunks.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY memory_chunks_insert ON memory_chunks
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = memory_chunks.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY memory_chunks_update ON memory_chunks
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = memory_chunks.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY memory_chunks_delete ON memory_chunks
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = memory_chunks.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- conversation_sessions
DO $$ BEGIN
  CREATE POLICY conversation_sessions_select ON conversation_sessions
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = conversation_sessions.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY conversation_sessions_insert ON conversation_sessions
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = conversation_sessions.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY conversation_sessions_update ON conversation_sessions
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = conversation_sessions.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY conversation_sessions_delete ON conversation_sessions
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = conversation_sessions.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- conversation_messages (via session -> family)
DO $$ BEGIN
  CREATE POLICY conversation_messages_select ON conversation_messages
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = conversation_messages.session_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY conversation_messages_insert ON conversation_messages
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = conversation_messages.session_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY conversation_messages_update ON conversation_messages
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = conversation_messages.session_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY conversation_messages_delete ON conversation_messages
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = conversation_messages.session_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- activity_logs
DO $$ BEGIN
  CREATE POLICY activity_logs_select ON activity_logs
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = activity_logs.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY activity_logs_insert ON activity_logs
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = activity_logs.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY activity_logs_update ON activity_logs
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = activity_logs.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY activity_logs_delete ON activity_logs
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = activity_logs.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- timeline_events
DO $$ BEGIN
  CREATE POLICY timeline_events_select ON timeline_events
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = timeline_events.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY timeline_events_insert ON timeline_events
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = timeline_events.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY timeline_events_update ON timeline_events
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = timeline_events.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY timeline_events_delete ON timeline_events
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = timeline_events.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tasks
DO $$ BEGIN
  CREATE POLICY tasks_select ON tasks
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = tasks.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tasks_insert ON tasks
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = tasks.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tasks_update ON tasks
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = tasks.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tasks_delete ON tasks
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = tasks.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- routine_metrics (child -> family)
DO $$ BEGIN
  CREATE POLICY routine_metrics_select ON routine_metrics
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM children c JOIN family_members fm ON fm.family_id = c.family_id
        WHERE c.id = routine_metrics.child_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY routine_metrics_insert ON routine_metrics
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM children c JOIN family_members fm ON fm.family_id = c.family_id
        WHERE c.id = routine_metrics.child_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY routine_metrics_update ON routine_metrics
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM children c JOIN family_members fm ON fm.family_id = c.family_id
        WHERE c.id = routine_metrics.child_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY routine_metrics_delete ON routine_metrics
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM children c JOIN family_members fm ON fm.family_id = c.family_id
        WHERE c.id = routine_metrics.child_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- daily_child_metrics (child -> family)
DO $$ BEGIN
  CREATE POLICY daily_child_metrics_select ON daily_child_metrics
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM children c JOIN family_members fm ON fm.family_id = c.family_id
        WHERE c.id = daily_child_metrics.child_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY daily_child_metrics_insert ON daily_child_metrics
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM children c JOIN family_members fm ON fm.family_id = c.family_id
        WHERE c.id = daily_child_metrics.child_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY daily_child_metrics_update ON daily_child_metrics
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM children c JOIN family_members fm ON fm.family_id = c.family_id
        WHERE c.id = daily_child_metrics.child_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY daily_child_metrics_delete ON daily_child_metrics
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM children c JOIN family_members fm ON fm.family_id = c.family_id
        WHERE c.id = daily_child_metrics.child_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- knowledge_items
DO $$ BEGIN
  CREATE POLICY knowledge_items_select ON knowledge_items
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = knowledge_items.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY knowledge_items_insert ON knowledge_items
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = knowledge_items.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY knowledge_items_update ON knowledge_items
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = knowledge_items.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY knowledge_items_delete ON knowledge_items
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = knowledge_items.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- inferences
DO $$ BEGIN
  CREATE POLICY inferences_select ON inferences
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = inferences.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY inferences_insert ON inferences
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = inferences.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY inferences_update ON inferences
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = inferences.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY inferences_delete ON inferences
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = inferences.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- message_feedback (via session -> family)
DO $$ BEGIN
  CREATE POLICY message_feedback_select ON message_feedback
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = message_feedback.conversation_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY message_feedback_insert ON message_feedback
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = message_feedback.conversation_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY message_feedback_update ON message_feedback
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = message_feedback.conversation_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY message_feedback_delete ON message_feedback
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = message_feedback.conversation_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- share_links (auth-only; public share handled in BFF)
DO $$ BEGIN
  CREATE POLICY share_links_select ON share_links
    FOR SELECT USING (auth.uid() is not null);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY share_links_insert ON share_links
    FOR INSERT WITH CHECK (auth.uid() is not null);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- loading_metrics (via session -> family)
DO $$ BEGIN
  CREATE POLICY loading_metrics_select ON loading_metrics
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = loading_metrics.session_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY loading_metrics_insert ON loading_metrics
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM conversation_sessions s
        JOIN family_members fm ON fm.family_id = s.family_id
        WHERE s.id = loading_metrics.session_id AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
