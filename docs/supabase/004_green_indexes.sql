-- GREEN index additions (idempotent)

-- Tasks: speed family/child timelines
create index if not exists tasks_family_created_idx
  on tasks(family_id, created_at desc);

create index if not exists tasks_child_created_idx
  on tasks(child_id, created_at desc);

-- Timeline events: speed family/child range queries
create index if not exists timeline_events_family_created_idx
  on timeline_events(family_id, created_at desc);

create index if not exists timeline_events_child_created_idx
  on timeline_events(child_id, created_at desc);

-- Conversation messages: speed message retrieval
create index if not exists conversation_messages_session_created_idx
  on conversation_messages(session_id, created_at);
