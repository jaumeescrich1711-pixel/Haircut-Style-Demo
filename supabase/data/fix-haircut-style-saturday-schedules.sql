begin;

update public.professional_schedules as schedule
set end_time = '14:00'
from public.professionals as professional
where professional.id = schedule.professional_id
  and professional.business_id = 1
  and professional.active is true
  and schedule.professional_id in (1, 2)
  and schedule.day_of_week = 6
  and schedule.start_time = '09:00'
  and schedule.end_time = '13:30'
  and schedule.active is true;

commit;
