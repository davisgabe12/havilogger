-- GREEN reconciliation: align memory + share schema to current app usage

-- 1) knowledge_items.age_range_weeks should accept string range payloads
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT udt_name INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'knowledge_items'
    AND column_name = 'age_range_weeks';

  IF col_type IS NULL THEN
    ALTER TABLE knowledge_items
      ADD COLUMN age_range_weeks text;
  ELSIF col_type = 'int4range' THEN
    ALTER TABLE knowledge_items
      ALTER COLUMN age_range_weeks TYPE text
      USING age_range_weeks::text;
  END IF;
END $$;

-- 2) share_links.token should be text (api uses uuid4().hex)
DO $$
DECLARE
  token_type text;
BEGIN
  SELECT data_type INTO token_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'share_links'
    AND column_name = 'token';

  IF token_type IS NULL THEN
    ALTER TABLE share_links
      ADD COLUMN token text;
  ELSIF token_type <> 'text' THEN
    ALTER TABLE share_links
      ALTER COLUMN token TYPE text
      USING token::text;
  END IF;
END $$;

-- 3) ensure share_links RLS + policies
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS share_links_select ON share_links;
  DROP POLICY IF EXISTS share_links_insert ON share_links;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY share_links_select ON share_links
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM family_members fm
        WHERE fm.family_id = share_links.family_id
          AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY share_links_insert ON share_links
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM family_members fm
        WHERE fm.family_id = share_links.family_id
          AND fm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
