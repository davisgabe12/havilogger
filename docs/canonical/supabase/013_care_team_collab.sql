-- Care-team collaboration hardening (invites + actor identity)

-- family_invites: align schema with API usage and lifecycle tracking.
alter table if exists family_invites
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists expires_at timestamptz,
  add column if not exists status text default 'pending';

update family_invites
set status = 'accepted'
where accepted_at is not null
  and coalesce(status, 'pending') = 'pending';

update family_invites
set status = 'pending'
where status is null;

DO $$ BEGIN
  ALTER TABLE family_invites
    ADD CONSTRAINT family_invites_status_check
    CHECK (status in ('pending', 'accepted', 'revoked', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create index if not exists family_invites_status_idx on family_invites(status);
create index if not exists family_invites_expires_at_idx on family_invites(expires_at);

-- timeline_events: persist actor identity so timeline can show who logged each event.
alter table if exists timeline_events
  add column if not exists recorded_by_user_id uuid references auth.users(id) on delete set null;

-- Backfill where origin chat message exists and has a sender.
update timeline_events te
set recorded_by_user_id = cm.user_id
from conversation_messages cm
where te.origin_message_id is not null
  and te.origin_message_id = cm.id
  and te.recorded_by_user_id is null
  and cm.user_id is not null;

create index if not exists timeline_events_recorded_by_user_idx
  on timeline_events(recorded_by_user_id);

