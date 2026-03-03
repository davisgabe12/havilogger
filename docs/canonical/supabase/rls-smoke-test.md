# Supabase RLS smoke test (manual)

1) Create two users in Supabase Auth: user1 and user2.
2) As user1, create family A and insert a matching `family_members` row for user1.
3) As user2, create family B and insert a matching `family_members` row for user2.
4) Verify isolation:
   - user1 cannot read family B, children B, or memory_chunks B.
   - user2 cannot read family A, children A, or memory_chunks A.
5) Verify membership enforcement:
   - user can read/write rows for their own family.
   - user cannot insert a `family_members` row with `user_id` != `auth.uid()`.
