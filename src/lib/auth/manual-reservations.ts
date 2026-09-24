import "server-only";

import {
  getBookingCalendar,
  type CalendarDayStatus,
} from "@/lib/booking-calendar";
import { addDaysToIsoDate, getTodayInTimeZone } from "@/lib/calendar-date";
import { getPublicBookingSettings } from "@/lib/business-settings";
import { getActiveProfessionals } from "@/lib/professionals";
import type {
  ConfirmedReservation,
  CreateReservationInput,
  CreatedReservation,
} from "@/lib/reservations";
import {
  ReservationUnavailableError,
  ReservationValidationError,
} from "@/lib/reservations";
import { getActiveServices } from "@/lib/services";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

type ManualReservationRpcRow = {
  reservation_id: number;
  assigned_professional_id: number;
  assigned_professional_name: string;
  service_id: number;
  service_name: string;
  service_price: number | string;
  service_duration_minutes: number;
  start_datetime: string;
  end_datetime: string;
  selected_any_professional: boolean;
  client_name: string;
  client_email: string;
  business_name: string;
  business_address: string;
  business_timezone: string;
  management_token: string;
  email_log_id: number;
  email_delivery_token: string;
};

export type ManualReservationOptions = {
  bookingEnabled: boolean;
  timeZone: string;
  today: string;
  maxDate: string;
  services: Array<{
    id: number;
    name: string;
    durationMinutes: number;
    price: number;
  }>;
  professionals: Array<{
    id: number;
    name: string;
    serviceIds: number[];
  }>;
};

export type ManualReservationSlots = {
  date: string;
  status: CalendarDayStatus;
  slots: Array<{ start: string; end: string }>;
};

function isRpcError(error: { message: string }, code: string) {
  return error.message.includes(code);
}

function getCurrentTimeInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.hour}:${values.minute}`;
}

export async function getManualReservationOptions(): Promise<ManualReservationOptions> {
  const [settings, services, professionals] = await Promise.all([
    getPublicBookingSettings(),
    getActiveServices(),
    getActiveProfessionals(),
  ]);
  const today = getTodayInTimeZone(settings.timeZone);

  return {
    bookingEnabled: settings.bookingEnabled,
    timeZone: settings.timeZone,
    today,
    maxDate: addDaysToIsoDate(today, settings.maxBookingDaysAhead),
    services,
    professionals,
  };
}

export async function getManualReservationSlots(
  professionalId: number,
  serviceId: number,
  date: string,
): Promise<ManualReservationSlots> {
  const [year, month, day] = date.split("-").map(Number);
  const calendar = await getBookingCalendar(
    professionalId,
    serviceId,
    year,
    month,
  );
  const calendarDay = calendar.days.find((entry) => entry.day === day);

  if (!calendarDay || calendarDay.date !== date) {
    throw new ReservationValidationError("La fecha indicada no es válida.");
  }

  const currentTime = getCurrentTimeInTimeZone(calendar.settings.timeZone);
  const slots = calendarDay.slots.filter(
    (slot) => date !== calendar.today || slot.start > currentTime,
  );

  return {
    date,
    status: slots.length > 0 ? calendarDay.status : "unavailable",
    slots: slots.map(({ start, end }) => ({ start, end })),
  };
}

export async function createManualReservation(
  input: Omit<CreateReservationInput, "selectedAnyProfessional">,
  publicBaseUrl: string,
): Promise<CreatedReservation> {
  const supabase = await createAuthServerClient();
  const result = await supabase.rpc("create_my_manual_reservation", {
    p_service_id: input.serviceId,
    p_professional_id: input.professionalId,
    p_booking_date: input.date,
    p_start_time: input.start,
    p_client_name: input.client.name,
    p_client_phone: input.client.phone,
    p_client_email: input.client.email,
  });
  const data = result.data as ManualReservationRpcRow[] | null;

  if (result.error) {
    if (
      isRpcError(result.error, "slot_unavailable") ||
      isRpcError(result.error, "booking_unavailable")
    ) {
      throw new ReservationUnavailableError(
        "Este horario acaba de dejar de estar disponible. Elige otro horario.",
        { cause: result.error },
      );
    }

    if (
      isRpcError(result.error, "invalid_booking_request") ||
      isRpcError(result.error, "invalid_customer_data") ||
      isRpcError(result.error, "booking_date_outside_range") ||
      isRpcError(result.error, "booking_time_in_the_past") ||
      isRpcError(result.error, "invalid_service") ||
      isRpcError(result.error, "invalid_start_time")
    ) {
      throw new ReservationValidationError(
        "Los datos de la reserva no son válidos o el horario ya no se puede reservar.",
        { cause: result.error },
      );
    }

    if (isRpcError(result.error, "panel_access_denied")) {
      throw new ReservationValidationError(
        "La sesión no tiene acceso a este negocio.",
        { cause: result.error },
      );
    }

    throw new Error("Supabase no ha podido guardar la reserva manual.", {
      cause: result.error,
    });
  }

  const reservation = data?.[0];

  if (!reservation) {
    throw new Error("Supabase no ha confirmado la reserva manual.");
  }

  const professionalName = reservation.assigned_professional_name.trim();
  const serviceName = reservation.service_name.trim();
  const managementToken = reservation.management_token;
  const calendarUrl = new URL(
    `/api/reservations/calendar/${managementToken}`,
    publicBaseUrl,
  ).toString();
  const cancellationUrl = new URL(
    `/cancelar/${managementToken}`,
    publicBaseUrl,
  ).toString();
  const booking: ConfirmedReservation = {
    id: reservation.reservation_id,
    professional: {
      id: reservation.assigned_professional_id,
      name: professionalName,
    },
    service: {
      id: reservation.service_id,
      name: serviceName,
      price: Number(reservation.service_price),
      durationMinutes: reservation.service_duration_minutes,
    },
    startDatetime: reservation.start_datetime,
    endDatetime: reservation.end_datetime,
    selectedAnyProfessional: false,
    calendarUrl,
    cancellationUrl,
  };

  return {
    booking,
    email: {
      reservationId: reservation.reservation_id,
      emailLogId: reservation.email_log_id,
      deliveryToken: reservation.email_delivery_token,
      clientName: reservation.client_name.trim(),
      clientEmail: reservation.client_email.trim(),
      serviceName,
      professionalName,
      startDatetime: reservation.start_datetime,
      endDatetime: reservation.end_datetime,
      businessName: reservation.business_name.trim(),
      businessAddress: reservation.business_address.trim(),
      businessTimezone: reservation.business_timezone.trim(),
      calendarUrl,
      cancellationUrl,
    },
  };
}
