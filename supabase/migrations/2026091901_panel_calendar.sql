begin;

alter table public.reservations enable row level security;

revoke all privileges on table public.reservations
  from anon, authenticated;

create or replace function public.get_my_calendar_reservations(
  p_month date default null
)
returns table (
  business_timezone text,
  today_date date,
  month_start date,
  professionals jsonb,
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
  v_month_start date;
  v_month_end date;
  v_start_datetime timestamptz;
  v_end_datetime timestamptz;
  v_professionals jsonb;
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
  v_month_start := date_trunc(
    'month',
    coalesce(p_month, v_today)::timestamp
  )::date;
  v_month_end := (v_month_start + interval '1 month')::date;
  v_start_datetime := v_month_start::timestamp at time zone v_business_timezone;
  v_end_datetime := v_month_end::timestamp at time zone v_business_timezone;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', professional.id,
        'name', btrim(professional.name)
      )
      order by professional.id
    ),
    '[]'::jsonb
  )
  into v_professionals
  from public.professionals as professional
  where professional.business_id = v_business_id
    and professional.active is true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', reservation.id,
        'professional_id', reservation.professional_id,
        'professional_name', btrim(professional.name),
        'client_name', reservation.client_name,
        'service_name', reservation.service_name,
        'start_datetime', reservation.start_datetime,
        'end_datetime', reservation.end_datetime,
        'local_date', to_char(
          reservation.start_datetime at time zone v_business_timezone,
          'YYYY-MM-DD'
        ),
        'local_start', to_char(
          reservation.start_datetime at time zone v_business_timezone,
          'HH24:MI'
        ),
        'local_end', to_char(
          reservation.end_datetime at time zone v_business_timezone,
          'HH24:MI'
        )
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
    and reservation.start_datetime >= v_start_datetime
    and reservation.start_datetime < v_end_datetime;

  return query
    select
      v_business_timezone,
      v_today,
      v_month_start,
      v_professionals,
      v_reservations;
end
$function$;

revoke all on function public.get_my_calendar_reservations(date)
  from public, anon;
grant execute on function public.get_my_calendar_reservations(date)
  to authenticated;

commit;
