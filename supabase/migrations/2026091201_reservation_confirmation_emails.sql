begin;

alter table public.email_logs enable row level security;

revoke all privileges on table public.email_logs from public, anon, authenticated;

alter table public.email_logs
  add column if not exists delivery_token_hash text;

alter table public.email_logs
  alter column business_id set not null,
  alter column reservation_id set not null,
  alter column recipient_email set not null,
  alter column email_type set not null,
  alter column status set not null,
  alter column delivery_token_hash set not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_email_status_valid'
  ) then
    alter table public.reservations
      add constraint reservations_email_status_valid
      check (email_status in ('pending', 'sent', 'error'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.email_logs'::regclass
      and conname = 'email_logs_confirmation_result_valid'
  ) then
    alter table public.email_logs
      add constraint email_logs_confirmation_result_valid
      check (
        email_type = 'reservation_confirmation'
        and btrim(recipient_email) <> ''
        and delivery_token_hash ~ '^[0-9a-f]{64}$'
        and (
          (
            status = 'pending'
            and provider_message_id is null
            and error_message is null
            and sent_at is null
          )
          or
          (
            status = 'sent'
            and btrim(coalesce(provider_message_id, '')) <> ''
            and error_message is null
            and sent_at is not null
          )
          or
          (
            status = 'error'
            and provider_message_id is null
            and btrim(coalesce(error_message, '')) <> ''
            and sent_at is null
          )
        )
      );
  end if;
end
$migration$;

create index if not exists email_logs_reservation_created_at_idx
  on public.email_logs (reservation_id, created_at desc);

create unique index if not exists email_logs_delivery_token_hash_key
  on public.email_logs (delivery_token_hash);

create or replace function public.create_public_reservation_with_email(
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
  selected_any_professional boolean,
  client_name text,
  client_email text,
  business_name text,
  business_address text,
  business_timezone text,
  email_log_id bigint,
  email_delivery_token text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_created record;
  v_reservation public.reservations%rowtype;
  v_business_name text;
  v_business_address text;
  v_business_timezone text;
  v_email_log_id bigint;
  v_email_delivery_token text;
begin
  select created.*
  into strict v_created
  from public.create_public_reservation(
    p_service_id,
    p_professional_id,
    p_selected_any_professional,
    p_booking_date,
    p_start_time,
    p_client_name,
    p_client_phone,
    p_client_email
  ) as created;

  select reservation.*
  into strict v_reservation
  from public.reservations as reservation
  where reservation.id = v_created.reservation_id
    and reservation.business_id = 1;

  select
    btrim(business.name),
    btrim(business.address),
    settings.timezone
  into strict
    v_business_name,
    v_business_address,
    v_business_timezone
  from public.businesses as business
  inner join public.business_settings as settings
    on settings.business_id = business.id
  where business.id = v_reservation.business_id;

  v_email_delivery_token := encode(gen_random_bytes(32), 'hex');

  insert into public.email_logs (
    business_id,
    reservation_id,
    recipient_email,
    email_type,
    status,
    provider_message_id,
    error_message,
    sent_at,
    delivery_token_hash
  ) values (
    v_reservation.business_id,
    v_reservation.id,
    v_reservation.client_email,
    'reservation_confirmation',
    'pending',
    null,
    null,
    null,
    encode(digest(v_email_delivery_token, 'sha256'), 'hex')
  )
  returning id into v_email_log_id;

  return query
    select
      v_created.reservation_id::bigint,
      v_created.assigned_professional_id::bigint,
      v_created.assigned_professional_name::text,
      v_created.service_id::bigint,
      v_created.service_name::text,
      v_created.service_price::numeric,
      v_created.service_duration_minutes::integer,
      v_created.start_datetime::timestamptz,
      v_created.end_datetime::timestamptz,
      v_created.selected_any_professional::boolean,
      v_reservation.client_name,
      v_reservation.client_email,
      v_business_name,
      v_business_address,
      v_business_timezone,
      v_email_log_id,
      v_email_delivery_token;
end
$function$;

revoke all on function public.create_public_reservation_with_email(
  bigint,
  bigint,
  boolean,
  date,
  time without time zone,
  text,
  text,
  text
) from public, authenticated;

grant execute on function public.create_public_reservation_with_email(
  bigint,
  bigint,
  boolean,
  date,
  time without time zone,
  text,
  text,
  text
) to anon;

create or replace function public.record_public_reservation_email_result(
  p_reservation_id bigint,
  p_email_log_id bigint,
  p_email_delivery_token text,
  p_email_status text,
  p_provider_message_id text,
  p_error_message text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_email_log public.email_logs%rowtype;
  v_reservation public.reservations%rowtype;
begin
  if p_reservation_id is null
    or p_email_log_id is null
    or length(coalesce(p_email_delivery_token, '')) <> 64
    or p_email_delivery_token !~ '^[0-9a-f]{64}$'
    or p_email_status not in ('sent', 'error')
    or (
      p_email_status = 'sent'
      and (
        length(btrim(coalesce(p_provider_message_id, ''))) not between 1 and 255
        or p_error_message is not null
      )
    )
    or (
      p_email_status = 'error'
      and (
        p_provider_message_id is not null
        or length(btrim(coalesce(p_error_message, ''))) not between 1 and 1000
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_email_result';
  end if;

  select email_log.*
  into v_email_log
  from public.email_logs as email_log
  where email_log.id = p_email_log_id
    and email_log.business_id = 1
    and email_log.reservation_id = p_reservation_id
    and email_log.email_type = 'reservation_confirmation'
    and email_log.delivery_token_hash = encode(
      digest(p_email_delivery_token, 'sha256'),
      'hex'
    )
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'invalid_email_delivery_token';
  end if;

  if v_email_log.status = 'sent' then
    return false;
  end if;

  select reservation.*
  into v_reservation
  from public.reservations as reservation
  where reservation.id = v_email_log.reservation_id
    and reservation.business_id = v_email_log.business_id
    and reservation.status = 'confirmed'
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'invalid_email_reservation';
  end if;

  if v_reservation.email_status = 'sent' then
    return false;
  end if;

  update public.reservations
  set email_status = p_email_status
  where id = v_reservation.id;

  update public.email_logs
  set
    status = p_email_status,
    provider_message_id = case
      when p_email_status = 'sent' then btrim(p_provider_message_id)
    end,
    error_message = case
      when p_email_status = 'error' then btrim(p_error_message)
    end,
    sent_at = case when p_email_status = 'sent' then now() end
  where id = v_email_log.id;

  return true;
end
$function$;

revoke all on function public.record_public_reservation_email_result(
  bigint,
  bigint,
  text,
  text,
  text,
  text
) from public, authenticated;

grant execute on function public.record_public_reservation_email_result(
  bigint,
  bigint,
  text,
  text,
  text,
  text
) to anon;

commit;
