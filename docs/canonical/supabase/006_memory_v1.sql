-- Memory system v1 schema updates (knowledge items)

alter table knowledge_items
  add column if not exists subject_id uuid references children(id) on delete set null;

alter table knowledge_items
  add column if not exists confidence text;

alter table knowledge_items
  add column if not exists qualifier text;

alter table knowledge_items
  add column if not exists age_range_weeks int4range;

alter table knowledge_items
  add column if not exists activated_at timestamptz;

alter table knowledge_items
  add column if not exists expires_at timestamptz;

-- Active memories index (status + subject_id), scoped to active status
create index if not exists knowledge_items_active_subject_idx
  on knowledge_items(status, subject_id)
  where status = 'active';

-- Expiry lookup
create index if not exists knowledge_items_expires_at_idx
  on knowledge_items(expires_at);
