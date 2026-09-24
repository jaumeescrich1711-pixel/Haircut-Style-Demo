begin;

alter table public.availability_blocks enable row level security;

revoke all privileges on table public.availability_blocks
  from authenticated;
revoke insert, update, delete on table public.availability_blocks
  from anon;

-- La web pública conserva únicamente la lectura mínima necesaria para
-- descontar bloqueos activos al calcular disponibilidad. El motivo no se
-- expone al navegador público.
grant select (
  business_id,
  professional_id,
  start_datetime,
  end_datetime,
  active
)
  on public.availability_blocks
  to anon;

create or replace function public.get_my_calendar_availability_blocks(
  p_month date default null
)
returns table (
  business_timezone text,
  today_date date,
  month_start date,
  blocks jsonb
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
  v_blocks jsonb;
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
        'id', block.id,
        'professional_id', block.professional_id,
        'professional_name', btrim(professional.name),
        'start_datetime', block.start_datetime,
        'end_datetime', block.end_datetime,
        'local_date', to_char(
          block.start_datetime at time zone v_business_timezone,
          'YYYY-MM-DD'
        ),
        'local_start', to_char(
          block.start_datetime at time zone v_business_timezone,
          'HH24:MI'
        ),
        'local_end', to_char(
          block.end_datetime at time zone v_business_timezone,
          'HH24:MI'
        ),
        'all_day', (
          (block.start_datetime at time zone v_business_timezone)::time = time '00:00'
          and (block.end_datetime at time zone v_business_timezone)::time = time '00:00'
          and (block.end_datetime at time zone v_business_timezone)::date
            = (block.start_datetime at time zone v_business_timezone)::date + 1
        ),
        'reason', nullif(btrim(block.reason), '')
      )
      order by block.start_datetime, professional.id, block.id
    ),
    '[]'::jsonb
  )
  into v_blocks
  from public.availability_blocks as block
  inner join public.professionals as professional
    on professional.id = block.professional_id
   and professional.business_id = block.business_id
  where block.business_id = v_business_id
    and block.active is true
    and professional.active is true
    and block.start_datetime < v_end_datetime
    and block.end_datetime > v_start_datetime;

  return query
    select
      v_business_timezone,
      v_today,
      v_month_start,
      v_blocks;
end
$function$;

revoke all on function public.get_my_calendar_availability_blocks(date)
  from public, anon, authenticated;
grant execute on function public.get_my_calendar_availability_blocks(date)
  to authenticated;

create or replace function public.create_my_availability_block(
  p_professional_id bigint,
  p_all_professionals boolean,
  p_block_date date,
  p_all_day boolean,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_reason text default null
)
returns table (
  created boolean,
  affected_reservations integer,
  blocks jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_business_id bigint;
  v_business_timezone text;
  v_today date;
  v_professional_ids bigint[];
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_start_datetime timestamptz;
  v_end_datetime timestamptz;
  v_affected_reservations integer;
  v_blocks jsonb;
begin
  select business_user.business_id
  into v_business_id
  from public.business_users as business_user
  where business_user.user_id = auth.uid()
    and business_user.business_id = 1
    and business_user.active is true
  limit 1;

  if v_business_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'panel_access_denied';
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

  if p_all_professionals is null
    or p_block_date is null
    or p_all_day is null
    or (p_all_professionals and p_professional_id is not null)
    or (not p_all_professionals and p_professional_id is null)
    or length(coalesce(p_reason, '')) > 300
    or (p_all_day and (p_start_time is not null or p_end_time is not null))
    or (
      not p_all_day
      and (
        p_start_time is null
        or p_end_time is null
        or p_start_time >= p_end_time
        or extract(second from p_start_time) <> 0
        or extract(second from p_end_time) <> 0
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_availability_block';
  end if;

  v_today := (current_timestamp at time zone v_business_timezone)::date;

  if p_block_date < v_today then
    raise exception using
      errcode = '22023',
      message = 'availability_block_in_the_past';
  end if;

  if p_all_professionals then
    select array_agg(professional.id order by professional.id)
    into v_professional_ids
    from public.professionals as professional
    where professional.business_id = v_business_id
      and professional.active is true;
  else
    select array_agg(professional.id)
    into v_professional_ids
    from public.professionals as professional
    where professional.business_id = v_business_id
      and professional.id = p_professional_id
      and professional.active is true;
  end if;

  if v_professional_ids is null or cardinality(v_professional_ids) = 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid_block_professional';
  end if;

  if p_all_day then
    v_local_start := p_block_date::timestamp;
    v_local_end := (p_block_date + 1)::timestamp;
  else
    v_local_start := p_block_date + p_start_time;
    v_local_end := p_block_date + p_end_time;
  end if;

  v_start_datetime := v_local_start at time zone v_business_timezone;
  v_end_datetime := v_local_end at time zone v_business_timezone;

  if v_end_datetime <= current_timestamp then
    raise exception using
      errcode = '22023',
      message = 'availability_block_in_the_past';
  end if;

  -- Usa exactamente el mismo candado que la creación pública/manual de
  -- reservas. Así no puede confirmarse una cita incompatible mientras este
  -- bloqueo comprueba reservas y se inserta, ni al revés.
  perform pg_catalog.pg_advisory_xact_lock(v_business_id::integer, 74821);

  select count(*)::integer
  into v_affected_reservations
  from public.reservations as reservation
  where reservation.business_id = v_business_id
    and reservation.professional_id = any (v_professional_ids)
    and reservation.status in ('confirmed', 'pending')
    and reservation.start_datetime < v_end_datetime
    and reservation.end_datetime > v_start_datetime;

  if v_affected_reservations > 0 then
    return query
      select false, v_affected_reservations, '[]'::jsonb;
    return;
  end if;

  with inserted as (
    insert into public.availability_blocks (
      business_id,
      professional_id,
      start_datetime,
      end_datetime,
      reason,
      active
    )
    select
      v_business_id,
      selected.professional_id,
      v_start_datetime,
      v_end_datetime,
      nullif(btrim(p_reason), ''),
      true
    from unnest(v_professional_ids) as selected(professional_id)
    returning id, professional_id, start_datetime, end_datetime, reason
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', inserted.id,
        'professional_id', inserted.professional_id,
        'professional_name', btrim(professional.name),
        'start_datetime', inserted.start_datetime,
        'end_datetime', inserted.end_datetime,
        'local_date', to_char(
          inserted.start_datetime at time zone v_business_timezone,
          'YYYY-MM-DD'
        ),
        'local_start', to_char(
          inserted.start_datetime at time zone v_business_timezone,
          'HH24:MI'
        ),
        'local_end', to_char(
          inserted.end_datetime at time zone v_business_timezone,
          'HH24:MI'
        ),
        'all_day', p_all_day,
        'reason', inserted.reason
      )
      order by inserted.professional_id
    ),
    '[]'::jsonb
  )
  into v_blocks
  from inserted
  inner join public.professionals as professional
    on professional.id = inserted.professional_id;

  return query
    select true, 0, v_blocks;
end
$function$;

revoke all on function public.create_my_availability_block(
  bigint,
  boolean,
  date,
  boolean,
  time without time zone,
  time without time zone,
  text
) from public, anon, authenticated;

grant execute on function public.create_my_availability_block(
  bigint,
  boolean,
  date,
  boolean,
  time without time zone,
  time without time zone,
  text
) to authenticated;

commit;
