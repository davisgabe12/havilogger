-- Supabase migration: atomic family / owner creation

create or replace function public.create_family_with_owner(p_name text default 'Family')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id bigint;
  v_user_id uuid;
  v_clean_name text := coalesce(nullif(trim(p_name), ''), 'Family');
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.families(name)
  values (v_clean_name)
  returning id into v_family_id;

  insert into public.family_members(family_id, user_id, role, is_primary)
  values (v_family_id, v_user_id, 'owner', true);

  return v_family_id;
end;
$$;

revoke all on function public.create_family_with_owner(text) from public;
grant execute on function public.create_family_with_owner(text) to authenticated;
