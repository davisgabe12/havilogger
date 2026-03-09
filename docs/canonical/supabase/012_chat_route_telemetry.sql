-- Chat route telemetry table for production disagreement/fallback/completeness rollups

create table if not exists chat_route_telemetry (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid null references children(id) on delete set null,
  conversation_id uuid not null references conversation_sessions(id) on delete cascade,
  user_message_id uuid null references conversation_messages(id) on delete set null,
  assistant_message_id uuid null references conversation_messages(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  route_kind text not null,
  expected_route_kind text null,
  decision_source text not null,
  classifier_intent text not null,
  confidence double precision null,
  classifier_fallback_reason text null,
  composer_source text null,
  composer_fallback_reason text null,
  ambiguous_eligible boolean not null default false,
  classifier_reasons jsonb not null default '[]'::jsonb,
  route_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_route_telemetry_created_at_idx
  on chat_route_telemetry(created_at desc);

create index if not exists chat_route_telemetry_family_created_idx
  on chat_route_telemetry(family_id, created_at desc);

create index if not exists chat_route_telemetry_route_kind_idx
  on chat_route_telemetry(route_kind);

alter table chat_route_telemetry enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_route_telemetry'
      AND policyname = 'chat_route_telemetry_select'
  ) THEN
    CREATE POLICY chat_route_telemetry_select ON chat_route_telemetry
      FOR SELECT USING (
        EXISTS (
          SELECT 1
          FROM family_members fm
          WHERE fm.family_id = chat_route_telemetry.family_id
            AND fm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_route_telemetry'
      AND policyname = 'chat_route_telemetry_insert'
  ) THEN
    CREATE POLICY chat_route_telemetry_insert ON chat_route_telemetry
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1
          FROM family_members fm
          WHERE fm.family_id = chat_route_telemetry.family_id
            AND fm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

select pg_notify('pgrst', 'reload schema');
