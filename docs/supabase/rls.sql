-- Supabase RLS policies for family-scoped data.
-- Assumes tables: families, family_members, children, memory_chunks.
-- Assumes family_members.family_id -> families.id and user_id stores auth.uid().

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families_select" ON public.families;
CREATE POLICY "families_select"
  ON public.families
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = families.id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "families_update" ON public.families;
CREATE POLICY "families_update"
  ON public.families
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = families.id
        AND fm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = families.id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "families_insert" ON public.families;
CREATE POLICY "families_insert"
  ON public.families
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "family_members_select" ON public.family_members;
CREATE POLICY "family_members_select"
  ON public.family_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = family_members.family_id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "family_members_insert_self" ON public.family_members;
CREATE POLICY "family_members_insert_self"
  ON public.family_members
  FOR INSERT
  WITH CHECK (family_members.user_id = auth.uid());

DROP POLICY IF EXISTS "children_select" ON public.children;
CREATE POLICY "children_select"
  ON public.children
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = children.family_id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "children_insert" ON public.children;
CREATE POLICY "children_insert"
  ON public.children
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = children.family_id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "children_update" ON public.children;
CREATE POLICY "children_update"
  ON public.children
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = children.family_id
        AND fm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = children.family_id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "children_delete" ON public.children;
CREATE POLICY "children_delete"
  ON public.children
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = children.family_id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "memory_chunks_select" ON public.memory_chunks;
CREATE POLICY "memory_chunks_select"
  ON public.memory_chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = memory_chunks.family_id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "memory_chunks_insert" ON public.memory_chunks;
CREATE POLICY "memory_chunks_insert"
  ON public.memory_chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = memory_chunks.family_id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "memory_chunks_update" ON public.memory_chunks;
CREATE POLICY "memory_chunks_update"
  ON public.memory_chunks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = memory_chunks.family_id
        AND fm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = memory_chunks.family_id
        AND fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "memory_chunks_delete" ON public.memory_chunks;
CREATE POLICY "memory_chunks_delete"
  ON public.memory_chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.family_id = memory_chunks.family_id
        AND fm.user_id = auth.uid()
    )
  );
