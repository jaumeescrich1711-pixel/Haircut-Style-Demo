-- Impide cancelar citas que ya han comenzado y elimina permisos de escritura
-- innecesarios sobre el catálogo público de servicios.

revoke insert, update, delete on table public.services
  from public, anon, authenticated;

create or replace function public.cancel_public_reservation_by_management_token(
  p_management_token text
)
returns table (
  cancellation_result text,
  reservation_id bigint,
  client_name text,
  client_email text,
  service_name text,
  professional_name text,
  start_datetime timestamptz,
  end_datetime timestamptz,
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
  v_reservation public.reservations%rowtype;
  v_professional_name text;
  v_business_name text;
  v_business_address text;
  v_business_timezone text;
  v_email_log_id bigint;
  v_email_delivery_token text;
begin
  if length(coalesce(p_management_token, '')) <> 64
    or p_management_token !~ '^[0-9a-f]{64}$'
  then
    return;
  end if;

  select reservation.*
  into v_reservation
  from public.reservations as reservation
  where reservation.business_id = 1
    and reservation.management_token = p_management_token
  for update;

  if not found then
    return;
  end if;

  select
    btrim(professional.name),
    btrim(business.name),
    btrim(business.address),
    settings.timezone
  into strict
    v_professional_name,
    v_business_name,
    v_business_address,
    v_business_timezone
  from public.professionals as professional
  inner join public.businesses as business
    on business.id = v_reservation.business_id
  inner join public.business_settings as settings
    on settings.business_id = business.id
  where professional.id = v_reservation.professional_id;

  if v_reservation.status = 'cancelled_by_client' then
    return query select
      'already_cancelled'::text,
      v_reservation.id,
      v_reservation.client_name,
      v_reservation.client_email,
      v_reservation.service_name,
      v_professional_name,
      v_reservation.start_datetime,
      v_reservation.end_datetime,
      v_business_name,
      v_business_address,
      v_business_timezone,
      null::bigint,
      null::text;
    return;
  end if;

  -- start_datetime es timestamptz: esta comparación confronta instantes reales
  -- y es independiente de la zona horaria del servidor. La zona del negocio se
  -- sigue usando para presentar la fecha y la hora al cliente.
  if v_reservation.status <> 'confirmed'
    or v_reservation.start_datetime <= now()
  then
    return query select
      'not_cancellable'::text,
      v_reservation.id,
      v_reservation.client_name,
      v_reservation.client_email,
      v_reservation.service_name,
      v_professional_name,
      v_reservation.start_datetime,
      v_reservation.end_datetime,
      v_business_name,
      v_business_address,
      v_business_timezone,
      null::bigint,
      null::text;
    return;
  end if;

  update public.reservations
  set status = 'cancelled_by_client'
  where id = v_reservation.id;

  insert into public.reservation_events (
    reservation_id,
    business_id,
    event_type,
    reason,
    details
  ) values (
    v_reservation.id,
    v_reservation.business_id,
    'cancelled_by_client',
    'client_request',
    jsonb_build_object(
      'previous_status', v_reservation.status,
      'source', 'public_management_link'
    )
  );

  insert into public.notifications (
    business_id,
    reservation_id,
    type,
    title,
    message,
    read
  ) values (
    v_reservation.business_id,
    v_reservation.id,
    'reservation_cancelled_by_client',
    'Cita cancelada por el cliente',
    format(
      '%s con %s — %s',
      v_reservation.service_name,
      v_professional_name,
      to_char(
        v_reservation.start_datetime at time zone v_business_timezone,
        'DD/MM/YYYY HH24:MI'
      )
    ),
    false
  );

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
    'reservation_cancellation',
    'pending',
    null,
    null,
    null,
    encode(digest(v_email_delivery_token, 'sha256'), 'hex')
  )
  returning id into v_email_log_id;

  return query select
    'cancelled'::text,
    v_reservation.id,
    v_reservation.client_name,
    v_reservation.client_email,
    v_reservation.service_name,
    v_professional_name,
    v_reservation.start_datetime,
    v_reservation.end_datetime,
    v_business_name,
    v_business_address,
    v_business_timezone,
    v_email_log_id,
    v_email_delivery_token;
end
$function$;

revoke all on function public.cancel_public_reservation_by_management_token(text)
  from public, anon, authenticated;
grant execute on function public.cancel_public_reservation_by_management_token(text)
  to anon;

comment on function public.cancel_public_reservation_by_management_token(text)
  is 'Cancela por management token solo citas confirmadas que todavía no han comenzado.';
