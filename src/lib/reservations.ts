import "server-only";

import type {
  ReservationEmailContext,
  ReservationEmailRecord,
} from "@/lib/reservation-email";
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
  client_name: string;
  client_email: string;
  business_name: string;
  business_address: string;
  business_timezone: string;
  management_token: string;
  email_log_id: number;
  email_delivery_token: string;
};

type ManagedReservationRpcRow = {
  reservation_id: number;
  reservation_status: string;
  service_name: string;
  professional_name: string;
  start_datetime: string;
  end_datetime: string;
  business_name: string;
  business_address: string;
  business_timezone: string;
};

type CancelReservationRpcRow = {
  cancellation_result: "cancelled" | "already_cancelled" | "not_cancellable";
  reservation_id: number;
  client_name: string;
  client_email: string;
  service_name: string;
  professional_name: string;
  start_datetime: string;
  end_datetime: string;
  business_name: string;
  business_address: string;
  business_timezone: string;
  email_log_id: number | null;
  email_delivery_token: string | null;
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
  calendarUrl: string;
  cancellationUrl: string;
};

export type ManagedReservation = {
  id: number;
  status: string;
  serviceName: string;
  professionalName: string;
  startDatetime: string;
  endDatetime: string;
  businessName: string;
  businessAddress: string;
  businessTimezone: string;
};

export type CancellationEmailContext = ReservationEmailContext;

export type CancelReservationResult = {
  result: "cancelled" | "already_cancelled" | "not_cancellable";
  reservation: ManagedReservation;
  email: CancellationEmailContext | null;
};

export type BusyReservationInterval = {
  professionalId: number;
  startDatetime: string;
  endDatetime: string;
};

export type CreatedReservation = {
  booking: ConfirmedReservation;
  email: ReservationEmailContext;
};

type RecordReservationEmailResultInput = ReservationEmailRecord & {
  reservationId: number;
  emailLogId: number;
  deliveryToken: string;
};

export class ReservationUnavailableError extends Error {}

export class ReservationValidationError extends Error {}

function isRpcError(error: { message: string }, code: string) {
  return error.message.includes(code);
}

export async function createReservation(
  input: CreateReservationInput,
  publicBaseUrl: string,
): Promise<CreatedReservation> {
  const supabase = createClient();
  const result = await supabase.rpc("create_public_reservation_with_management", {
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

  return {
    booking: {
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
      selectedAnyProfessional: reservation.selected_any_professional,
      calendarUrl,
      cancellationUrl,
    },
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

export async function recordReservationEmailResult(
  input: RecordReservationEmailResultInput,
) {
  const supabase = createClient();
  const { error } = await supabase.rpc(
    "record_public_reservation_email_result",
    {
      p_reservation_id: input.reservationId,
      p_email_log_id: input.emailLogId,
      p_email_delivery_token: input.deliveryToken,
      p_email_status: input.status,
      p_provider_message_id: input.providerMessageId,
      p_error_message: input.errorMessage,
    },
  );

  if (error) {
    throw new Error("Supabase no ha podido registrar el resultado del email.", {
      cause: error,
    });
  }
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

function mapManagedReservation(row: ManagedReservationRpcRow): ManagedReservation {
  return {
    id: row.reservation_id,
    status: row.reservation_status,
    serviceName: row.service_name.trim(),
    professionalName: row.professional_name.trim(),
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    businessName: row.business_name.trim(),
    businessAddress: row.business_address.trim(),
    businessTimezone: row.business_timezone.trim(),
  };
}

export async function getManagedReservation(
  managementToken: string,
): Promise<ManagedReservation | null> {
  const supabase = createClient();
  const result = await supabase.rpc(
    "get_public_reservation_by_management_token",
    { p_management_token: managementToken },
  );
  const data = result.data as ManagedReservationRpcRow[] | null;

  if (result.error) {
    throw new Error("No se ha podido consultar la cita.", {
      cause: result.error,
    });
  }

  return data?.[0] ? mapManagedReservation(data[0]) : null;
}

export async function cancelReservationByManagementToken(
  managementToken: string,
  publicBaseUrl: string,
): Promise<CancelReservationResult | null> {
  const supabase = createClient();
  const result = await supabase.rpc(
    "cancel_public_reservation_by_management_token",
    { p_management_token: managementToken },
  );
  const data = result.data as CancelReservationRpcRow[] | null;

  if (result.error) {
    throw new Error("Supabase no ha podido cancelar la cita.", {
      cause: result.error,
    });
  }

  const row = data?.[0];

  if (!row) {
    return null;
  }

  const reservation: ManagedReservation = {
    id: row.reservation_id,
    status:
      row.cancellation_result === "cancelled" ||
      row.cancellation_result === "already_cancelled"
        ? "cancelled_by_client"
        : "not_cancellable",
    serviceName: row.service_name.trim(),
    professionalName: row.professional_name.trim(),
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    businessName: row.business_name.trim(),
    businessAddress: row.business_address.trim(),
    businessTimezone: row.business_timezone.trim(),
  };

  const email =
    row.cancellation_result === "cancelled" &&
    row.email_log_id &&
    row.email_delivery_token
      ? {
          reservationId: row.reservation_id,
          emailLogId: row.email_log_id,
          deliveryToken: row.email_delivery_token,
          clientName: row.client_name.trim(),
          clientEmail: row.client_email.trim(),
          serviceName: row.service_name.trim(),
          professionalName: row.professional_name.trim(),
          startDatetime: row.start_datetime,
          endDatetime: row.end_datetime,
          businessName: row.business_name.trim(),
          businessAddress: row.business_address.trim(),
          businessTimezone: row.business_timezone.trim(),
          calendarUrl: "",
          cancellationUrl: "",
          bookingUrl: new URL("/#reservar", publicBaseUrl).toString(),
        }
      : null;

  return { result: row.cancellation_result, reservation, email };
}

export async function recordReservationCancellationEmailResult(
  input: RecordReservationEmailResultInput,
) {
  const supabase = createClient();
  const { error } = await supabase.rpc(
    "record_public_reservation_cancellation_email_result",
    {
      p_reservation_id: input.reservationId,
      p_email_log_id: input.emailLogId,
      p_email_delivery_token: input.deliveryToken,
      p_email_status: input.status,
      p_provider_message_id: input.providerMessageId,
      p_error_message: input.errorMessage,
    },
  );

  if (error) {
    throw new Error(
      "Supabase no ha podido registrar el resultado del email de cancelación.",
      { cause: error },
    );
  }
}
