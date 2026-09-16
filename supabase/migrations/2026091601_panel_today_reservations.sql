begin;

alter table public.reservations enable row level security;

revoke all privileges on table public.reservations
  from anon, authenticated;

create or replace function public.get_my_today_reservations()
returns table (
  business_timezone text,
  reservations jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business_id bigint;
  v_business_timezone text;
  v_today date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_reservations jsonb;
begin
  select business_user.business_id
  into v_business_id
  from public.business_users as business_user
  where business_user.user_id = auth.uid()
    and business_user.business_id = 1
    and business_user.active is true
  limit 1;

  if v_business_id is null then
    return;
  end if;

  select settings.timezone
  into v_business_timezone
  from public.business_settings as settings
  where settings.business_id = v_business_id;

  if v_business_timezone is null or btrim(v_business_timezone) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'business_timezone_unavailable';
  end if;

  v_today := (current_timestamp at time zone v_business_timezone)::date;
  v_day_start := v_today::timestamp at time zone v_business_timezone;
  v_day_end := (v_today + 1)::timestamp at time zone v_business_timezone;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', reservation.id,
        'client_name', reservation.client_name,
        'service_name', reservation.service_name,
        'professional_name', btrim(professional.name),
        'start_datetime', reservation.start_datetime,
        'end_datetime', reservation.end_datetime
      )
      order by reservation.start_datetime, reservation.id
    ),
    '[]'::jsonb
  )
  into v_reservations
  from public.reservations as reservation
  inner join public.professionals as professional
    on professional.id = reservation.professional_id
   and professional.business_id = reservation.business_id
  where reservation.business_id = v_business_id
    and reservation.status in ('confirmed', 'pending')
    and reservation.start_datetime >= v_day_start
    and reservation.start_datetime < v_day_end;

  return query
    select v_business_timezone, v_reservations;
end
$function$;

revoke all on function public.get_my_today_reservations()
  from public, anon;
grant execute on function public.get_my_today_reservations()
  to authenticated;

commit;
