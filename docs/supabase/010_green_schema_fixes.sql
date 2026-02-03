-- GREEN schema fixes: knowledge_items columns + message_feedback upsert constraint

-- knowledge_items: add missing columns used by API
alter table knowledge_items
  add column if not exists confidence text;

alter table knowledge_items
  add column if not exists activated_at timestamptz;

-- message_feedback: ensure upsert conflict target exists
create unique index if not exists message_feedback_user_unique
  on message_feedback(conversation_id, message_id, user_id)
  where user_id is not null;

-- share_links: ensure columns used by API exist
alter table share_links
  add column if not exists family_id uuid references families(id) on delete cascade;

alter table share_links
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

alter table share_links
  add column if not exists knowledge_item_id uuid references knowledge_items(id) on delete cascade;

alter table share_links
  add column if not exists share_type text;

alter table share_links
  alter column session_id drop not null;

DO $$ BEGIN
  ALTER TABLE share_links
    ADD CONSTRAINT share_links_target_check
    CHECK ((session_id is not null)::int + (knowledge_item_id is not null)::int = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ensure public share RPC exists
create or replace function public_share_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  share_row share_links%rowtype;
  result jsonb;
begin
  select * into share_row
  from share_links
  where token = p_token
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    raise exception 'share_not_found';
  end if;

  if share_row.session_id is not null then
    select jsonb_build_object(
      'token', share_row.token,
      'type', 'conversation',
      'title', coalesce(cs.title, 'Shared conversation'),
      'messages', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', cm.id,
            'role', cm.role,
            'text', cm.content,
            'created_at', cm.created_at
          )
          order by cm.created_at asc
        )
        from conversation_messages cm
        where cm.session_id = share_row.session_id
      ), '[]'::jsonb)
    )
    into result
    from conversation_sessions cs
    where cs.id = share_row.session_id;
  else
    select jsonb_build_object(
      'token', share_row.token,
      'type', 'memory',
      'title', 'Shared memory',
      'memory', jsonb_build_object(
        'id', ki.id,
        'key', ki.key,
        'status', ki.status,
        'payload', ki.payload,
        'confidence', ki.confidence,
        'qualifier', ki.qualifier,
        'activated_at', ki.activated_at
      )
    )
    into result
    from knowledge_items ki
    where ki.id = share_row.knowledge_item_id;
  end if;

  return result;
end;
$$;

grant execute on function public_share_by_token(text) to anon, authenticated;

-- refresh PostgREST schema cache after DDL
select pg_notify('pgrst', 'reload schema');
