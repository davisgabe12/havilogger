-- Ensure family_invites table + RLS policies exist (idempotent)

create table if not exists family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  email text not null,
  role text default 'member',
  token text not null,
  created_at timestamptz default now(),
  accepted_at timestamptz,
  accepted_by_user_id uuid
);

create unique index if not exists family_invites_token_idx on family_invites(token);
create index if not exists family_invites_family_id_idx on family_invites(family_id);
create index if not exists family_invites_email_idx on family_invites(email);

alter table family_invites enable row level security;

DO $$ BEGIN
  CREATE POLICY family_invites_select ON family_invites
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_invites.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY family_invites_insert ON family_invites
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_invites.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY family_invites_update ON family_invites
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM family_members fm WHERE fm.family_id = family_invites.family_id AND fm.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

select pg_notify('pgrst', 'reload schema');
