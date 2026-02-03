# Supabase migration apply order

Apply migrations in this exact order using the Supabase SQL editor:

1) `docs/supabase/002_app_core_uuid.sql`
2) `docs/supabase/004_green_indexes.sql`
3) `docs/supabase/005_family_invites.sql`
4) `docs/supabase/006_memory_v1.sql`
5) `docs/supabase/007_share_links.sql`
6) `docs/supabase/008_green_reconcile.sql`
7) `docs/supabase/009_create_family_rpc.sql`
8) `docs/supabase/010_green_schema_fixes.sql`

## How to apply (Supabase SQL editor)
1) Open your Supabase project → **SQL Editor**.
2) Paste the contents of the first file (`002_app_core_uuid.sql`) and run it.
3) Paste the contents of the second file (`004_green_indexes.sql`) and run it.
4) Paste the contents of the third file (`005_family_invites.sql`) and run it.
5) Paste the contents of the fourth file (`006_memory_v1.sql`) and run it.
6) Paste the contents of the fifth file (`007_share_links.sql`) and run it.
7) Paste the contents of the sixth file (`008_green_reconcile.sql`) and run it.
8) Paste the contents of the seventh file (`009_create_family_rpc.sql`) and run it.
9) Paste the contents of the eighth file (`010_green_schema_fixes.sql`) and run it.

These migrations are idempotent (`create if not exists`) and safe to re-run.
