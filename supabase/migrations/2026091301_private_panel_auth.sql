begin;

alter table public.business_users enable row level security;

revoke all on table public.business_users from anon, authenticated;

create or replace function public.get_my_business_access()
returns table (
  business_id bigint,
  business_name text,
  role text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    bu.business_id,
    coalesce(b.name, 'Haircut Style') as business_name,
    bu.role
  from public.business_users as bu
  left join public.businesses as b on b.id = bu.business_id
  where bu.user_id = auth.uid()
    and bu.business_id = 1
    and bu.active is true
  limit 1;
$function$;

revoke all on function public.get_my_business_access() from public;
revoke all on function public.get_my_business_access() from anon;
grant execute on function public.get_my_business_access() to authenticated;

commit;
