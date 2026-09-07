begin;

alter table public.professional_schedules enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.availability_overrides enable row level security;

revoke all privileges
  on public.professional_schedules,
     public.availability_blocks,
     public.availability_overrides
  from anon, authenticated;

grant select (professional_id, day_of_week, start_time, end_time, active)
  on public.professional_schedules
  to anon;

grant select (
  business_id,
  professional_id,
  start_datetime,
  end_datetime,
  active
)
  on public.availability_blocks
  to anon;

grant select (professional_id, date, start_time, end_time, available)
  on public.availability_overrides
  to anon;

drop policy if exists "Public can read Haircut Style schedules"
  on public.professional_schedules;

create policy "Public can read Haircut Style schedules"
  on public.professional_schedules
  for select
  to anon
  using (
    active is true
    and exists (
      select 1
      from public.professionals as professional
      where professional.id = professional_schedules.professional_id
        and professional.business_id = 1
        and professional.active is true
    )
  );

drop policy if exists "Public can read Haircut Style availability blocks"
  on public.availability_blocks;

create policy "Public can read Haircut Style availability blocks"
  on public.availability_blocks
  for select
  to anon
  using (
    business_id = 1
    and active is true
    and exists (
      select 1
      from public.professionals as professional
      where professional.id = availability_blocks.professional_id
        and professional.business_id = 1
        and professional.active is true
    )
  );

drop policy if exists "Public can read Haircut Style availability overrides"
  on public.availability_overrides;

create policy "Public can read Haircut Style availability overrides"
  on public.availability_overrides
  for select
  to anon
  using (
    exists (
      select 1
      from public.professionals as professional
      where professional.id = availability_overrides.professional_id
        and professional.business_id = 1
        and professional.active is true
    )
  );

commit;
