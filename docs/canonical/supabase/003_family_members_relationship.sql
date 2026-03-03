-- Add caregiver relationship to family_members for settings persistence.
alter table if exists family_members
  add column if not exists relationship text;
