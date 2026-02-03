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

-- refresh PostgREST schema cache after DDL
select pg_notify('pgrst', 'reload schema');
