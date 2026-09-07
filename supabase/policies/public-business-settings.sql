begin;

alter table public.business_settings enable row level security;

revoke all privileges on table public.business_settings from anon, authenticated;

grant select (
  business_id,
  booking_enabled,
  timezone,
  max_booking_days_ahead
) on table public.business_settings to anon;

drop policy if exists "Public can read Haircut Style booking settings"
  on public.business_settings;

create policy "Public can read Haircut Style booking settings"
on public.business_settings
for select
to anon
using (business_id = 1);

commit;
