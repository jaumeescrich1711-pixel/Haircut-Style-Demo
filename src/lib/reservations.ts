import "server-only";

import { createClient } from "@/lib/supabase/server";

const HAIRCUT_STYLE_BUSINESS_ID = 1;

type ReservationRpcRow = {
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
};

type BusyReservationRow = {
  professional_id: number;
  start_datetime: string;
  end_datetime: string;
};

export type CreateReservationInput = {
  serviceId: number;
  professionalId: number | null;
  selectedAnyProfessional: boolean;
  date: string;
  start: string;
  client: {
    name: string;
    phone: string;
    email: string;
  };
};

export type ConfirmedReservation = {
  id: number;
  professional: {
    id: number;
    name: string;
  };
  service: {
    id: number;
    name: string;
    price: number;
    durationMinutes: number;
  };
  startDatetime: string;
  endDatetime: string;
  selectedAnyProfessional: boolean;
};

export type BusyReservationInterval = {
  professionalId: number;
  startDatetime: string;
  endDatetime: string;
};

export class ReservationUnavailableError extends Error {}

export class ReservationValidationError extends Error {}

function isRpcError(error: { message: string }, code: string) {
  return error.message.includes(code);
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<ConfirmedReservation> {
  const supabase = createClient();
  const result = await supabase.rpc("create_public_reservation", {
    p_service_id: input.serviceId,
    p_professional_id: input.professionalId,
    p_selected_any_professional: input.selectedAnyProfessional,
    p_booking_date: input.date,
    p_start_time: input.start,
    p_client_name: input.client.name,
    p_client_phone: input.client.phone,
    p_client_email: input.client.email,
  });
  const data = result.data as ReservationRpcRow[] | null;
  const { error } = result;

  if (error) {
    if (
      isRpcError(error, "slot_unavailable") ||
      isRpcError(error, "booking_unavailable")
    ) {
      throw new ReservationUnavailableError(
        "Este horario acaba de dejar de estar disponible. Elige otro horario.",
        { cause: error },
      );
    }

    if (
      isRpcError(error, "invalid_booking_request") ||
      isRpcError(error, "invalid_customer_data") ||
      isRpcError(error, "booking_date_outside_range") ||
      isRpcError(error, "booking_time_in_the_past") ||
      isRpcError(error, "invalid_service") ||
      isRpcError(error, "invalid_start_time")
    ) {
      throw new ReservationValidationError(
        "Los datos de la reserva no son válidos o el horario ya no se puede reservar.",
        { cause: error },
      );
    }

    throw new Error("Supabase no ha podido guardar la reserva.", {
      cause: error,
    });
  }

  const reservation = data?.[0];

  if (!reservation) {
    throw new Error("Supabase no ha confirmado la creación de la reserva.");
  }

  return {
    id: reservation.reservation_id,
    professional: {
      id: reservation.assigned_professional_id,
      name: reservation.assigned_professional_name.trim(),
    },
    service: {
      id: reservation.service_id,
      name: reservation.service_name.trim(),
      price: Number(reservation.service_price),
      durationMinutes: reservation.service_duration_minutes,
    },
    startDatetime: reservation.start_datetime,
    endDatetime: reservation.end_datetime,
    selectedAnyProfessional: reservation.selected_any_professional,
  };
}

export async function getBusyReservationIntervals(
  professionalIds: number[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BusyReservationInterval[]> {
  if (professionalIds.length === 0) {
    return [];
  }

  const supabase = createClient();
  const result = await supabase.rpc("get_public_reservation_busy_intervals", {
    p_business_id: HAIRCUT_STYLE_BUSINESS_ID,
    p_professional_ids: professionalIds,
    p_range_start: rangeStart.toISOString(),
    p_range_end: rangeEnd.toISOString(),
  });
  const data = result.data as BusyReservationRow[] | null;
  const { error } = result;

  if (error) {
    throw new Error("No se han podido leer los horarios ya reservados.", {
      cause: error,
    });
  }

  return (data ?? []).map((reservation) => ({
    professionalId: reservation.professional_id,
    startDatetime: reservation.start_datetime,
    endDatetime: reservation.end_datetime,
  }));
}
