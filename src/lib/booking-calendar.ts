import "server-only";

import { getProfessionalAvailabilityRange } from "@/lib/availability";
import {
  mergeProfessionalSlots,
  ProfessionalServiceNotFoundError,
  type BookableSlotWithProfessionals,
} from "@/lib/booking-slots";
import { getPublicBookingSettings } from "@/lib/business-settings";
import {
  addDaysToIsoDate,
  formatIsoDate,
  getDaysInMonth,
  getIsoDayOfWeek,
  getTodayInTimeZone,
} from "@/lib/calendar-date";
import { getActiveProfessionals } from "@/lib/professionals";
import { getActiveService } from "@/lib/services";
import { generateBookableSlots } from "@/lib/slot-generator";

export type CalendarProfessionalSelection = number | "any";

export type CalendarDayStatus =
  | "available"
  | "unavailable"
  | "past"
  | "sunday"
  | "outside-range"
  | "booking-disabled";

export type BookingCalendarDay = {
  date: string;
  day: number;
  status: CalendarDayStatus;
  slots: BookableSlotWithProfessionals[];
};

export type BookingCalendar = {
  month: string;
  today: string;
  maxDate: string;
  selection: CalendarProfessionalSelection;
  service: {
    id: number;
    name: string;
    durationMinutes: number;
  };
  professionalIds: number[];
  settings: {
    bookingEnabled: boolean;
    timeZone: string;
    maxBookingDaysAhead: number;
  };
  days: BookingCalendarDay[];
};

export async function getBookingCalendar(
  selection: CalendarProfessionalSelection,
  serviceId: number,
  year: number,
  month: number,
): Promise<BookingCalendar> {
  const [settings, service, professionals] = await Promise.all([
    getPublicBookingSettings(),
    getActiveService(serviceId),
    getActiveProfessionals(),
  ]);
  const eligibleProfessionals = professionals.filter((professional) =>
    professional.serviceIds.includes(serviceId),
  );
  const selectedProfessionals =
    selection === "any"
      ? eligibleProfessionals
      : eligibleProfessionals.filter(
          (professional) => professional.id === selection,
        );

  if (selectedProfessionals.length === 0) {
    throw new ProfessionalServiceNotFoundError(
      "No hay ningún profesional activo que realice el servicio indicado.",
    );
  }

  const today = getTodayInTimeZone(settings.timeZone);
  const maxDate = addDaysToIsoDate(today, settings.maxBookingDaysAhead);
  const dates = Array.from({ length: getDaysInMonth(year, month) }, (_, index) => {
    const day = index + 1;
    return {
      day,
      date: formatIsoDate(new Date(Date.UTC(year, month - 1, day))),
    };
  });

  const datesWithStatus = dates.map(({ date, day }) => {
    let status: CalendarDayStatus | null = null;

    if (!settings.bookingEnabled) {
      status = "booking-disabled";
    } else if (date < today) {
      status = "past";
    } else if (date > maxDate) {
      status = "outside-range";
    } else if (getIsoDayOfWeek(date) === 7) {
      status = "sunday";
    }

    return { date, day, status };
  });
  const bookableDates = datesWithStatus
    .filter(({ status }) => status === null)
    .map(({ date }) => date);
  const availabilityByProfessional = await Promise.all(
    selectedProfessionals.map(async (professional) => {
      const availability = await getProfessionalAvailabilityRange(
        professional.id,
        bookableDates,
      );

      return {
        professionalId: professional.id,
        byDate: new Map(
          availability.map((dayAvailability) => [
            dayAvailability.date,
            dayAvailability,
          ]),
        ),
      };
    }),
  );
  const days = datesWithStatus.map(({ date, day, status }) => {
    if (status) {
      return { date, day, status, slots: [] } satisfies BookingCalendarDay;
    }

    const schedules = availabilityByProfessional.map(
      ({ professionalId, byDate }) => ({
        professionalId,
        slots: generateBookableSlots(
          byDate.get(date)?.availablePeriods ?? [],
          service.durationMinutes,
        ),
      }),
    );
    const slots = mergeProfessionalSlots(schedules);

    return {
      date,
      day,
      status: slots.length > 0 ? "available" : "unavailable",
      slots,
    } satisfies BookingCalendarDay;
  });

  return {
    month: `${year}-${String(month).padStart(2, "0")}`,
    today,
    maxDate,
    selection,
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
    },
    professionalIds: selectedProfessionals.map((professional) => professional.id),
    settings,
    days,
  };
}
