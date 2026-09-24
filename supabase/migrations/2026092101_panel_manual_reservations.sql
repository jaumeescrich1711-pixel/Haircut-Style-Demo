begin;

alter table public.reservations enable row level security;
alter table public.email_logs enable row level security;

revoke all privileges on table public.reservations
  from anon, authenticated;
revoke all privileges on table public.email_logs
  from anon, authenticated;

create or replace function public.create_my_manual_reservation(
  p_service_id bigint,
  p_professional_id bigint,
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
  management_token text,
  email_log_id bigint,
  email_delivery_token text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_business_id bigint;
  v_created record;
  v_reservation public.reservations%rowtype;
  v_business_name text;
  v_business_address text;
  v_business_timezone text;
  v_email_log_id bigint;
  v_email_delivery_token text;
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

  select created.*
  into strict v_created
  from public.create_public_reservation(
    p_service_id,
    p_professional_id,
    false,
    p_booking_date,
    p_start_time,
    p_client_name,
    p_client_phone,
    p_client_email
  ) as created;

  update public.reservations as reservation
  set origin = 'manual'
  where reservation.id = v_created.reservation_id
    and reservation.business_id = v_business_id
  returning reservation.* into strict v_reservation;

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
  where business.id = v_business_id;

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
    v_business_id,
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
      false,
      v_reservation.client_name,
      v_reservation.client_email,
      v_business_name,
      v_business_address,
      v_business_timezone,
      v_reservation.management_token,
      v_email_log_id,
      v_email_delivery_token;
end
$function$;

revoke all on function public.create_my_manual_reservation(
  bigint,
  bigint,
  date,
  time without time zone,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_my_manual_reservation(
  bigint,
  bigint,
  date,
  time without time zone,
  text,
  text,
  text
) to authenticated;

commit;
