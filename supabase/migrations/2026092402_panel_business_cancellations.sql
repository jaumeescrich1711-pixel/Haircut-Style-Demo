begin;

alter table public.reservations
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz;

alter table public.email_logs
  drop constraint if exists email_logs_delivery_result_valid;

alter table public.email_logs
  add constraint email_logs_delivery_result_valid
  check (
    email_type in (
      'reservation_confirmation',
      'reservation_cancellation',
      'reservation_business_cancellation'
    )
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

create unique index if not exists availability_blocks_active_interval_unique
  on public.availability_blocks (
    business_id,
    professional_id,
    start_datetime,
    end_datetime
  )
  where active is true;

create unique index if not exists email_logs_business_cancellation_once
  on public.email_logs (reservation_id, email_type)
  where email_type = 'reservation_business_cancellation';

create table if not exists public.availability_block_cancellation_operations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  business_id bigint not null references public.businesses(id),
  user_id uuid not null references auth.users(id),
  professional_ids bigint[] not null,
  block_date date not null,
  all_day boolean not null,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  block_reason text,
  expected_reservation_ids bigint[] not null default '{}'::bigint[],
  status text not null default 'awaiting_confirmation',
  block_ids bigint[] not null default '{}'::bigint[],
  result_payload jsonb,
  constraint availability_block_cancellation_operations_status_valid
    check (status in ('awaiting_confirmation', 'completed')),
  constraint availability_block_cancellation_operations_interval_valid
    check (end_datetime > start_datetime),
  constraint availability_block_cancellation_operations_reason_valid
    check (length(coalesce(block_reason, '')) <= 500)
);

alter table public.availability_block_cancellation_operations
  enable row level security;

revoke all privileges on table public.availability_block_cancellation_operations
  from public, anon, authenticated;

create index if not exists availability_block_cancellation_operations_lookup_idx
  on public.availability_block_cancellation_operations (
    business_id,
    user_id,
    status,
    expires_at
  );

create or replace function public.prepare_my_availability_block(
  p_professional_id bigint,
  p_all_professionals boolean,
  p_block_date date,
  p_all_day boolean,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_reason text default null
)
returns table (
  operation_result text,
  operation_id uuid,
  affected_reservations integer,
  reservations jsonb,
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
  v_reservation_ids bigint[] := '{}'::bigint[];
  v_reservations jsonb := '[]'::jsonb;
  v_blocks jsonb := '[]'::jsonb;
  v_operation_id uuid;
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
    or length(coalesce(p_reason, '')) > 500
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

  perform pg_catalog.pg_advisory_xact_lock(v_business_id::integer, 74821);

  select
    coalesce(array_agg(reservation.id order by reservation.id), '{}'::bigint[]),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', reservation.id,
          'client_name', reservation.client_name,
          'service_name', reservation.service_name,
          'professional_name', btrim(professional.name),
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
  into v_reservation_ids, v_reservations
  from public.reservations as reservation
  inner join public.professionals as professional
    on professional.id = reservation.professional_id
   and professional.business_id = reservation.business_id
  where reservation.business_id = v_business_id
    and reservation.professional_id = any (v_professional_ids)
    and reservation.status in ('confirmed', 'pending')
    and reservation.start_datetime < v_end_datetime
    and reservation.end_datetime > v_start_datetime;

  if cardinality(v_reservation_ids) > 0 then
    insert into public.availability_block_cancellation_operations (
      business_id,
      user_id,
      professional_ids,
      block_date,
      all_day,
      start_datetime,
      end_datetime,
      block_reason,
      expected_reservation_ids
    ) values (
      v_business_id,
      auth.uid(),
      v_professional_ids,
      p_block_date,
      p_all_day,
      v_start_datetime,
      v_end_datetime,
      nullif(btrim(p_reason), ''),
      v_reservation_ids
    )
    returning id into v_operation_id;

    return query select
      'confirmation_required'::text,
      v_operation_id,
      cardinality(v_reservation_ids),
      v_reservations,
      '[]'::jsonb;
    return;
  end if;

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
  on conflict (
    business_id,
    professional_id,
    start_datetime,
    end_datetime
  ) where active is true do nothing;

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
        'all_day', p_all_day,
        'reason', nullif(btrim(block.reason), '')
      )
      order by block.professional_id
    ),
    '[]'::jsonb
  )
  into v_blocks
  from public.availability_blocks as block
  inner join public.professionals as professional
    on professional.id = block.professional_id
   and professional.business_id = block.business_id
  where block.business_id = v_business_id
    and block.professional_id = any (v_professional_ids)
    and block.start_datetime = v_start_datetime
    and block.end_datetime = v_end_datetime
    and block.active is true;

  return query select
    'created'::text,
    null::uuid,
    0,
    '[]'::jsonb,
    v_blocks;
end
$function$;

revoke all on function public.prepare_my_availability_block(
  bigint,
  boolean,
  date,
  boolean,
  time without time zone,
  time without time zone,
  text
) from public, anon, authenticated;

grant execute on function public.prepare_my_availability_block(
  bigint,
  boolean,
  date,
  boolean,
  time without time zone,
  time without time zone,
  text
) to authenticated;

create or replace function public.confirm_my_availability_block_cancellations(
  p_operation_id uuid,
  p_cancellation_reason text
)
returns table (
  operation_result text,
  affected_reservations integer,
  reservations jsonb,
  blocks jsonb,
  email_deliveries jsonb
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_business_id bigint;
  v_business_timezone text;
  v_business_name text;
  v_business_address text;
  v_operation public.availability_block_cancellation_operations%rowtype;
  v_current_ids bigint[] := '{}'::bigint[];
  v_reservations jsonb := '[]'::jsonb;
  v_blocks jsonb := '[]'::jsonb;
  v_block_ids bigint[] := '{}'::bigint[];
  v_result_payload jsonb := '[]'::jsonb;
  v_retryable_payload jsonb := '[]'::jsonb;
  v_reservation record;
  v_email_log_id bigint;
  v_delivery_token text;
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

  if p_operation_id is null
    or length(btrim(coalesce(p_cancellation_reason, ''))) not between 1 and 500
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_business_cancellation';
  end if;

  select operation.*
  into v_operation
  from public.availability_block_cancellation_operations as operation
  where operation.id = p_operation_id
    and operation.business_id = v_business_id
    and operation.user_id = auth.uid()
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'invalid_block_operation';
  end if;

  select
    settings.timezone,
    btrim(business.name),
    btrim(business.address)
  into strict
    v_business_timezone,
    v_business_name,
    v_business_address
  from public.businesses as business
  inner join public.business_settings as settings
    on settings.business_id = business.id
  where business.id = v_business_id;

  if v_operation.status = 'completed' then
    select coalesce(
      jsonb_agg(payload.item order by (payload.item ->> 'reservation_id')::bigint),
      '[]'::jsonb
    )
    into v_retryable_payload
    from jsonb_array_elements(coalesce(v_operation.result_payload, '[]'::jsonb))
      as payload(item)
    inner join public.email_logs as email_log
      on email_log.id = (payload.item ->> 'email_log_id')::bigint
     and email_log.business_id = v_business_id
    where email_log.status <> 'sent';

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
          'all_day', v_operation.all_day,
          'reason', nullif(btrim(block.reason), '')
        )
        order by block.professional_id
      ),
      '[]'::jsonb
    )
    into v_blocks
    from public.availability_blocks as block
    inner join public.professionals as professional
      on professional.id = block.professional_id
     and professional.business_id = block.business_id
    where block.id = any (v_operation.block_ids);

    return query select
      'completed'::text,
      cardinality(v_operation.expected_reservation_ids),
      '[]'::jsonb,
      v_blocks,
      v_retryable_payload;
    return;
  end if;

  if v_operation.expires_at < current_timestamp then
    return query select
      'preview_expired'::text,
      cardinality(v_operation.expected_reservation_ids),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(v_business_id::integer, 74821);

  perform reservation.id
  from public.reservations as reservation
  where reservation.business_id = v_business_id
    and reservation.professional_id = any (v_operation.professional_ids)
    and reservation.status in ('confirmed', 'pending')
    and reservation.start_datetime < v_operation.end_datetime
    and reservation.end_datetime > v_operation.start_datetime
  for update;

  select
    coalesce(array_agg(reservation.id order by reservation.id), '{}'::bigint[]),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', reservation.id,
          'client_name', reservation.client_name,
          'service_name', reservation.service_name,
          'professional_name', btrim(professional.name),
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
  into v_current_ids, v_reservations
  from public.reservations as reservation
  inner join public.professionals as professional
    on professional.id = reservation.professional_id
   and professional.business_id = reservation.business_id
  where reservation.business_id = v_business_id
    and reservation.professional_id = any (v_operation.professional_ids)
    and reservation.status in ('confirmed', 'pending')
    and reservation.start_datetime < v_operation.end_datetime
    and reservation.end_datetime > v_operation.start_datetime;

  if v_current_ids is distinct from v_operation.expected_reservation_ids then
    update public.availability_block_cancellation_operations
    set
      expected_reservation_ids = v_current_ids,
      expires_at = current_timestamp + interval '15 minutes'
    where id = v_operation.id;

    return query select
      'confirmation_required'::text,
      cardinality(v_current_ids),
      v_reservations,
      '[]'::jsonb,
      '[]'::jsonb;
    return;
  end if;

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
    v_operation.start_datetime,
    v_operation.end_datetime,
    nullif(btrim(coalesce(v_operation.block_reason, p_cancellation_reason)), ''),
    true
  from unnest(v_operation.professional_ids) as selected(professional_id)
  on conflict (
    business_id,
    professional_id,
    start_datetime,
    end_datetime
  ) where active is true do nothing;

  select
    coalesce(array_agg(block.id order by block.id), '{}'::bigint[]),
    coalesce(
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
          'all_day', v_operation.all_day,
          'reason', nullif(btrim(block.reason), '')
        )
        order by block.professional_id
      ),
      '[]'::jsonb
    )
  into v_block_ids, v_blocks
  from public.availability_blocks as block
  inner join public.professionals as professional
    on professional.id = block.professional_id
   and professional.business_id = block.business_id
  where block.business_id = v_business_id
    and block.professional_id = any (v_operation.professional_ids)
    and block.start_datetime = v_operation.start_datetime
    and block.end_datetime = v_operation.end_datetime
    and block.active is true;

  for v_reservation in
    select
      reservation.*,
      btrim(professional.name) as professional_name
    from public.reservations as reservation
    inner join public.professionals as professional
      on professional.id = reservation.professional_id
     and professional.business_id = reservation.business_id
    where reservation.business_id = v_business_id
      and reservation.id = any (v_current_ids)
      and reservation.status in ('confirmed', 'pending')
    order by reservation.id
    for update of reservation
  loop
    update public.reservations
    set
      status = 'cancelled_by_business',
      cancellation_reason = btrim(p_cancellation_reason),
      cancelled_at = current_timestamp
    where id = v_reservation.id;

    insert into public.reservation_events (
      reservation_id,
      business_id,
      event_type,
      reason,
      details
    ) values (
      v_reservation.id,
      v_business_id,
      'cancelled_by_business',
      btrim(p_cancellation_reason),
      jsonb_build_object(
        'previous_status', v_reservation.status,
        'source', 'business_panel_availability_block',
        'operation_id', v_operation.id,
        'block_ids', to_jsonb(v_block_ids),
        'cancelled_by_user_id', auth.uid()
      )
    );

    v_delivery_token := encode(gen_random_bytes(32), 'hex');

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
      'reservation_business_cancellation',
      'pending',
      null,
      null,
      null,
      encode(digest(v_delivery_token, 'sha256'), 'hex')
    )
    on conflict (reservation_id, email_type)
      where email_type = 'reservation_business_cancellation'
    do update set recipient_email = excluded.recipient_email
    returning id into v_email_log_id;

    v_result_payload := v_result_payload || jsonb_build_array(
      jsonb_build_object(
        'reservation_id', v_reservation.id,
        'client_name', v_reservation.client_name,
        'client_email', v_reservation.client_email,
        'service_name', v_reservation.service_name,
        'professional_name', v_reservation.professional_name,
        'start_datetime', v_reservation.start_datetime,
        'end_datetime', v_reservation.end_datetime,
        'business_name', v_business_name,
        'business_address', v_business_address,
        'business_timezone', v_business_timezone,
        'cancellation_reason', btrim(p_cancellation_reason),
        'email_log_id', v_email_log_id,
        'email_delivery_token', v_delivery_token
      )
    );
  end loop;

  update public.availability_block_cancellation_operations
  set
    status = 'completed',
    block_ids = v_block_ids,
    result_payload = v_result_payload,
    expires_at = current_timestamp
  where id = v_operation.id;

  return query select
    'completed'::text,
    cardinality(v_current_ids),
    '[]'::jsonb,
    v_blocks,
    v_result_payload;
end
$function$;

revoke all on function public.confirm_my_availability_block_cancellations(
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.confirm_my_availability_block_cancellations(
  uuid,
  text
) to authenticated;

create or replace function public.record_my_business_cancellation_email_result(
  p_operation_id uuid,
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
  v_business_id bigint;
  v_email_log public.email_logs%rowtype;
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

  if p_operation_id is null
    or p_reservation_id is null
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

  perform 1
  from public.availability_block_cancellation_operations as operation
  where operation.id = p_operation_id
    and operation.business_id = v_business_id
    and operation.status = 'completed';

  if not found then
    raise exception using
      errcode = '22023',
      message = 'invalid_block_operation';
  end if;

  select email_log.*
  into v_email_log
  from public.email_logs as email_log
  inner join public.reservations as reservation
    on reservation.id = email_log.reservation_id
   and reservation.business_id = email_log.business_id
  where email_log.id = p_email_log_id
    and email_log.business_id = v_business_id
    and email_log.reservation_id = p_reservation_id
    and email_log.email_type = 'reservation_business_cancellation'
    and reservation.status = 'cancelled_by_business'
    and email_log.delivery_token_hash = encode(
      digest(p_email_delivery_token, 'sha256'),
      'hex'
    )
  for update of email_log;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'invalid_email_delivery_token';
  end if;

  if v_email_log.status = 'sent' then
    return false;
  end if;

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

revoke all on function public.record_my_business_cancellation_email_result(
  uuid,
  bigint,
  bigint,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_my_business_cancellation_email_result(
  uuid,
  bigint,
  bigint,
  text,
  text,
  text,
  text
) to authenticated;

commit;
