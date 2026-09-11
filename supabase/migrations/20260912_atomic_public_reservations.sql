begin;

create extension if not exists btree_gist with schema extensions;

alter table public.reservations enable row level security;

revoke all privileges on table public.reservations from anon, authenticated;

alter table public.reservations
  alter column business_id set not null,
  alter column professional_id set not null,
  alter column service_id set not null,
  alter column client_name set not null,
  alter column client_phone set not null,
  alter column client_email set not null,
  alter column service_name set not null,
  alter column service_price set not null,
  alter column service_duration_minutes set not null,
  alter column start_datetime set not null,
  alter column end_datetime set not null,
  alter column status set not null,
  alter column email_status set not null,
  alter column selected_any_professional set not null,
  alter column management_token set not null,
  alter column origin set not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_valid_duration'
  ) then
    alter table public.reservations
      add constraint reservations_valid_duration
      check (
        service_duration_minutes > 0
        and end_datetime > start_datetime
        and end_datetime = start_datetime
          + make_interval(mins => service_duration_minutes)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_valid_snapshot'
  ) then
    alter table public.reservations
      add constraint reservations_valid_snapshot
      check (
        btrim(service_name) <> ''
        and service_price >= 0
        and btrim(client_name) <> ''
        and btrim(client_phone) <> ''
        and btrim(client_email) <> ''
        and btrim(management_token) <> ''
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_no_professional_overlap'
  ) then
    alter table public.reservations
      add constraint reservations_no_professional_overlap
      exclude using gist (
        professional_id with =,
        tstzrange(start_datetime, end_datetime, '[)') with &&
      )
      where (status in ('confirmed', 'pending'));
  end if;
end
$migration$;

create unique index if not exists reservations_management_token_key
  on public.reservations (management_token);

create index if not exists reservations_business_period_idx
  on public.reservations (business_id, start_datetime, end_datetime)
  where status in ('confirmed', 'pending');

create or replace function public.get_public_reservation_busy_intervals(
  p_business_id bigint,
  p_professional_ids bigint[],
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns table (
  professional_id bigint,
  start_datetime timestamptz,
  end_datetime timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
begin
  if p_business_id <> 1
    or p_professional_ids is null
    or cardinality(p_professional_ids) = 0
    or cardinality(p_professional_ids) > 10
    or p_range_start is null
    or p_range_end is null
    or p_range_end <= p_range_start
    or p_range_end - p_range_start > interval '93 days'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_busy_interval_request';
  end if;

  return query
    select
      reservation.professional_id,
      reservation.start_datetime,
      reservation.end_datetime
    from public.reservations as reservation
    where reservation.business_id = 1
      and reservation.professional_id = any (p_professional_ids)
      and reservation.status in ('confirmed', 'pending')
      and reservation.start_datetime < p_range_end
      and reservation.end_datetime > p_range_start
    order by reservation.professional_id, reservation.start_datetime;
end
$function$;

revoke all on function public.get_public_reservation_busy_intervals(
  bigint,
  bigint[],
  timestamptz,
  timestamptz
) from public, authenticated;

grant execute on function public.get_public_reservation_busy_intervals(
  bigint,
  bigint[],
  timestamptz,
  timestamptz
) to anon;

create or replace function public.create_public_reservation(
  p_service_id bigint,
  p_professional_id bigint,
  p_selected_any_professional boolean,
  p_booking_date date,
  p_start_time time without time zone,
  p_client_name text,
  p_client_phone text,
  p_client_email text
)
returns table (
  reservation_id bigint,
  assigned_professional_id bigint,
  assigned_professional_name text,
  service_id bigint,
  service_name text,
  service_price numeric,
  service_duration_minutes integer,
  start_datetime timestamptz,
  end_datetime timestamptz,
  selected_any_professional boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_business_id constant bigint := 1;
  v_booking_enabled boolean;
  v_time_zone text;
  v_max_booking_days_ahead integer;
  v_service_name text;
  v_service_price numeric;
  v_service_duration integer;
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_start_datetime timestamptz;
  v_end_datetime timestamptz;
  v_professional_id bigint;
  v_professional_name text;
  v_reservation_id bigint;
  v_management_token text;
begin
  if p_service_id is null
    or p_booking_date is null
    or p_start_time is null
    or p_selected_any_professional is null
    or (p_selected_any_professional and p_professional_id is not null)
    or (not p_selected_any_professional and p_professional_id is null)
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_booking_request';
  end if;

  if length(btrim(coalesce(p_client_name, ''))) not between 1 and 120
    or length(btrim(coalesce(p_client_phone, ''))) not between 7 and 20
    or length(regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g')) not between 7 and 15
    or btrim(coalesce(p_client_phone, '')) !~ '^\+?[0-9[:space:]().-]+$'
    or length(btrim(coalesce(p_client_email, ''))) not between 3 and 254
    or btrim(coalesce(p_client_email, '')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_customer_data';
  end if;

  select
    settings.booking_enabled,
    settings.timezone,
    settings.max_booking_days_ahead
  into
    v_booking_enabled,
    v_time_zone,
    v_max_booking_days_ahead
  from public.business_settings as settings
  where settings.business_id = v_business_id;

  if not found
    or not coalesce(v_booking_enabled, false)
    or v_time_zone is null
    or v_max_booking_days_ahead is null
    or v_max_booking_days_ahead < 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'booking_unavailable';
  end if;

  if p_booking_date < (now() at time zone v_time_zone)::date
    or p_booking_date > (now() at time zone v_time_zone)::date
      + v_max_booking_days_ahead
  then
    raise exception using
      errcode = '22023',
      message = 'booking_date_outside_range';
  end if;

  select
    btrim(service.name),
    service.price,
    service.duration_minutes
  into
    v_service_name,
    v_service_price,
    v_service_duration
  from public.services as service
  where service.id = p_service_id
    and service.business_id = v_business_id
    and service.active is true;

  if not found
    or v_service_duration is null
    or v_service_duration <= 0
    or v_service_price is null
    or v_service_price < 0
    or v_service_name = ''
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_service';
  end if;

  v_local_start := p_booking_date + p_start_time;
  v_local_end := v_local_start + make_interval(mins => v_service_duration);

  if v_local_end::date <> p_booking_date
    or extract(second from p_start_time) <> 0
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_start_time';
  end if;

  v_start_datetime := v_local_start at time zone v_time_zone;
  v_end_datetime := v_local_end at time zone v_time_zone;

  if v_start_datetime <= now() then
    raise exception using
      errcode = '22023',
      message = 'booking_time_in_the_past';
  end if;

  -- Serializa las confirmaciones de este negocio. La restricción de exclusión
  -- sigue siendo la última barrera si otra vía intenta insertar directamente.
  perform pg_advisory_xact_lock(v_business_id::integer, 74821);

  select professional.id, btrim(professional.name)
  into v_professional_id, v_professional_name
  from public.professionals as professional
  inner join public.professional_services as relation
    on relation.professional_id = professional.id
   and relation.service_id = p_service_id
  where professional.business_id = v_business_id
    and professional.active is true
    and (
      p_selected_any_professional
      or professional.id = p_professional_id
    )
    and not exists (
      select 1
      from public.availability_overrides as full_day_closure
      where full_day_closure.professional_id = professional.id
        and full_day_closure.date = p_booking_date
        and full_day_closure.available is false
        and full_day_closure.start_time is null
        and full_day_closure.end_time is null
    )
    and exists (
      select 1
      from (
        select available_override.start_time, available_override.end_time
        from public.availability_overrides as available_override
        where available_override.professional_id = professional.id
          and available_override.date = p_booking_date
          and available_override.available is true
          and available_override.start_time is not null
          and available_override.end_time is not null

        union all

        select schedule.start_time, schedule.end_time
        from public.professional_schedules as schedule
        where schedule.professional_id = professional.id
          and schedule.day_of_week = extract(isodow from p_booking_date)::integer
          and schedule.active is true
          and not exists (
            select 1
            from public.availability_overrides as replacement_override
            where replacement_override.professional_id = professional.id
              and replacement_override.date = p_booking_date
              and replacement_override.available is true
              and replacement_override.start_time is not null
              and replacement_override.end_time is not null
          )
      ) as base_period
      where p_start_time >= base_period.start_time
        and v_local_end::time <= base_period.end_time
        and mod(
          floor(
            extract(epoch from (p_start_time - base_period.start_time)) / 60
          )::integer,
          v_service_duration
        ) = 0
    )
    and not exists (
      select 1
      from public.availability_overrides as unavailable_override
      where unavailable_override.professional_id = professional.id
        and unavailable_override.date = p_booking_date
        and unavailable_override.available is false
        and unavailable_override.start_time is not null
        and unavailable_override.end_time is not null
        and p_start_time < unavailable_override.end_time
        and v_local_end::time > unavailable_override.start_time
    )
    and not exists (
      select 1
      from public.availability_blocks as block
      where block.business_id = v_business_id
        and block.professional_id = professional.id
        and block.active is true
        and block.start_datetime < v_end_datetime
        and block.end_datetime > v_start_datetime
    )
    and not exists (
      select 1
      from public.reservations as existing
      where existing.business_id = v_business_id
        and existing.professional_id = professional.id
        and existing.status in ('confirmed', 'pending')
        and existing.start_datetime < v_end_datetime
        and existing.end_datetime > v_start_datetime
    )
  order by
    case when p_selected_any_professional then (
      select count(*)
      from public.reservations as workload
      where workload.business_id = v_business_id
        and workload.professional_id = professional.id
        and workload.status in ('confirmed', 'pending')
        and (workload.start_datetime at time zone v_time_zone)::date = p_booking_date
    ) else 0 end,
    case when p_selected_any_professional then (
      select max(recent.created_at)
      from public.reservations as recent
      where recent.business_id = v_business_id
        and recent.professional_id = professional.id
        and recent.status in ('confirmed', 'pending')
    ) end nulls first,
    professional.id
  limit 1;

  if v_professional_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'slot_unavailable';
  end if;

  v_management_token := encode(gen_random_bytes(32), 'hex');

  begin
    insert into public.reservations (
      business_id,
      professional_id,
      service_id,
      client_name,
      client_phone,
      client_email,
      service_name,
      service_price,
      service_duration_minutes,
      start_datetime,
      end_datetime,
      status,
      email_status,
      selected_any_professional,
      management_token,
      origin
    ) values (
      v_business_id,
      v_professional_id,
      p_service_id,
      btrim(p_client_name),
      btrim(p_client_phone),
      lower(btrim(p_client_email)),
      v_service_name,
      v_service_price,
      v_service_duration,
      v_start_datetime,
      v_end_datetime,
      'confirmed',
      'pending',
      p_selected_any_professional,
      v_management_token,
      'web'
    )
    returning id into v_reservation_id;
  exception
    when exclusion_violation or unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'slot_unavailable';
  end;

  return query
    select
      v_reservation_id,
      v_professional_id,
      v_professional_name,
      p_service_id,
      v_service_name,
      v_service_price,
      v_service_duration,
      v_start_datetime,
      v_end_datetime,
      p_selected_any_professional;
end
$function$;

revoke all on function public.create_public_reservation(
  bigint,
  bigint,
  boolean,
  date,
  time without time zone,
  text,
  text,
  text
) from public, authenticated;

grant execute on function public.create_public_reservation(
  bigint,
  bigint,
  boolean,
  date,
  time without time zone,
  text,
  text,
  text
) to anon;

commit;
