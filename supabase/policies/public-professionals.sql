begin;

alter table public.professionals enable row level security;
alter table public.professional_services enable row level security;

revoke all privileges
  on public.professionals
  from anon, authenticated;

revoke all privileges
  on public.professional_services
  from anon, authenticated;

grant select (id, business_id, name, active)
  on public.professionals
  to anon;

grant select (professional_id, service_id)
  on public.professional_services
  to anon;

drop policy if exists "Public can read active Haircut Style professionals"
  on public.professionals;

create policy "Public can read active Haircut Style professionals"
  on public.professionals
  for select
  to anon
  using (business_id = 1 and active is true);

drop policy if exists "Public can read Haircut Style professional services"
  on public.professional_services;

create policy "Public can read Haircut Style professional services"
  on public.professional_services
  for select
  to anon
  using (
    exists (
      select 1
      from public.professionals as professional
      join public.services as service
        on service.id = professional_services.service_id
      where professional.id = professional_services.professional_id
        and professional.business_id = 1
        and professional.active is true
        and service.business_id = 1
        and service.active is true
    )
  );

commit;
