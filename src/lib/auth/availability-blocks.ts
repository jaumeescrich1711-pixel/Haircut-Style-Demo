import "server-only";

import type { CalendarAvailabilityBlock } from "@/lib/auth/calendar-reservations";
import type { ReservationEmailRecord } from "@/lib/reservation-email";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

type AvailabilityBlockRpcRow = {
  operation_result: unknown;
  operation_id: unknown;
  affected_reservations: unknown;
  reservations: unknown;
  blocks: unknown;
};

type ConfirmAvailabilityBlockRpcRow = Omit<
  AvailabilityBlockRpcRow,
  "operation_id"
> & {
  email_deliveries: unknown;
};

export type CreateAvailabilityBlockInput = {
  professionalId: number | null;
  allProfessionals: boolean;
  date: string;
  allDay: boolean;
  start: string | null;
  end: string | null;
  reason: string;
};

export type AffectedBlockReservation = {
  id: number;
  clientName: string;
  serviceName: string;
  professionalName: string;
  startDatetime: string;
  endDatetime: string;
  localDate: string;
  localStart: string;
  localEnd: string;
};

export type BusinessCancellationEmailDelivery = {
  operationId: string;
  reservationId: number;
  emailLogId: number;
  deliveryToken: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  professionalName: string;
  startDatetime: string;
  endDatetime: string;
  businessName: string;
  businessAddress: string;
  businessTimezone: string;
  cancellationReason: string;
};

export type PrepareAvailabilityBlockResult =
  | {
      outcome: "created";
      blocks: CalendarAvailabilityBlock[];
    }
  | {
      outcome: "confirmation_required";
      operationId: string;
      affectedReservations: AffectedBlockReservation[];
    };

export type ConfirmAvailabilityBlockResult =
  | {
      outcome: "completed";
      affectedReservations: number;
      blocks: CalendarAvailabilityBlock[];
      emailDeliveries: BusinessCancellationEmailDelivery[];
    }
  | {
      outcome: "confirmation_required";
      affectedReservations: AffectedBlockReservation[];
    }
  | {
      outcome: "preview_expired";
    };

type RpcBlock = {
  id?: unknown;
  professional_id?: unknown;
  professional_name?: unknown;
  start_datetime?: unknown;
  end_datetime?: unknown;
  local_date?: unknown;
  local_start?: unknown;
  local_end?: unknown;
  all_day?: unknown;
  reason?: unknown;
};

type RpcAffectedReservation = {
  id?: unknown;
  client_name?: unknown;
  service_name?: unknown;
  professional_name?: unknown;
  start_datetime?: unknown;
  end_datetime?: unknown;
  local_date?: unknown;
  local_start?: unknown;
  local_end?: unknown;
};

type RpcEmailDelivery = {
  reservation_id?: unknown;
  email_log_id?: unknown;
  email_delivery_token?: unknown;
  client_name?: unknown;
  client_email?: unknown;
  service_name?: unknown;
  professional_name?: unknown;
  start_datetime?: unknown;
  end_datetime?: unknown;
  business_name?: unknown;
  business_address?: unknown;
  business_timezone?: unknown;
  cancellation_reason?: unknown;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deliveryTokenPattern = /^[0-9a-f]{64}$/;

function isDatetime(value: unknown): value is string {
  return (
    typeof value === "string" && !Number.isNaN(new Date(value).getTime())
  );
}

function parseBlock(value: unknown): CalendarAvailabilityBlock | null {
  if (!value || typeof value !== "object") return null;

  const block = value as RpcBlock;
  const id = Number(block.id);
  const professionalId = Number(block.professional_id);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(professionalId) ||
    professionalId <= 0 ||
    typeof block.professional_name !== "string" ||
    !block.professional_name.trim() ||
    !isDatetime(block.start_datetime) ||
    !isDatetime(block.end_datetime) ||
    typeof block.local_date !== "string" ||
    !datePattern.test(block.local_date) ||
    typeof block.local_start !== "string" ||
    !timePattern.test(block.local_start) ||
    typeof block.local_end !== "string" ||
    !timePattern.test(block.local_end) ||
    typeof block.all_day !== "boolean" ||
    !(
      block.reason === null ||
      block.reason === undefined ||
      typeof block.reason === "string"
    )
  ) {
    return null;
  }

  return {
    id,
    professionalId,
    professionalName: block.professional_name.trim(),
    startDatetime: block.start_datetime,
    endDatetime: block.end_datetime,
    localDate: block.local_date,
    localStart: block.local_start,
    localEnd: block.local_end,
    allDay: block.all_day,
    reason:
      typeof block.reason === "string" && block.reason.trim()
        ? block.reason.trim()
        : null,
  };
}

function parseAffectedReservation(
  value: unknown,
): AffectedBlockReservation | null {
  if (!value || typeof value !== "object") return null;

  const reservation = value as RpcAffectedReservation;
  const id = Number(reservation.id);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof reservation.client_name !== "string" ||
    !reservation.client_name.trim() ||
    typeof reservation.service_name !== "string" ||
    !reservation.service_name.trim() ||
    typeof reservation.professional_name !== "string" ||
    !reservation.professional_name.trim() ||
    !isDatetime(reservation.start_datetime) ||
    !isDatetime(reservation.end_datetime) ||
    typeof reservation.local_date !== "string" ||
    !datePattern.test(reservation.local_date) ||
    typeof reservation.local_start !== "string" ||
    !timePattern.test(reservation.local_start) ||
    typeof reservation.local_end !== "string" ||
    !timePattern.test(reservation.local_end)
  ) {
    return null;
  }

  return {
    id,
    clientName: reservation.client_name.trim(),
    serviceName: reservation.service_name.trim(),
    professionalName: reservation.professional_name.trim(),
    startDatetime: reservation.start_datetime,
    endDatetime: reservation.end_datetime,
    localDate: reservation.local_date,
    localStart: reservation.local_start,
    localEnd: reservation.local_end,
  };
}

function parseEmailDelivery(
  value: unknown,
  operationId: string,
): BusinessCancellationEmailDelivery | null {
  if (!value || typeof value !== "object") return null;

  const delivery = value as RpcEmailDelivery;
  const reservationId = Number(delivery.reservation_id);
  const emailLogId = Number(delivery.email_log_id);

  if (
    !Number.isSafeInteger(reservationId) ||
    reservationId <= 0 ||
    !Number.isSafeInteger(emailLogId) ||
    emailLogId <= 0 ||
    typeof delivery.email_delivery_token !== "string" ||
    !deliveryTokenPattern.test(delivery.email_delivery_token) ||
    typeof delivery.client_name !== "string" ||
    !delivery.client_name.trim() ||
    typeof delivery.client_email !== "string" ||
    !delivery.client_email.trim() ||
    typeof delivery.service_name !== "string" ||
    !delivery.service_name.trim() ||
    typeof delivery.professional_name !== "string" ||
    !delivery.professional_name.trim() ||
    !isDatetime(delivery.start_datetime) ||
    !isDatetime(delivery.end_datetime) ||
    typeof delivery.business_name !== "string" ||
    !delivery.business_name.trim() ||
    typeof delivery.business_address !== "string" ||
    typeof delivery.business_timezone !== "string" ||
    !delivery.business_timezone.trim() ||
    typeof delivery.cancellation_reason !== "string" ||
    !delivery.cancellation_reason.trim()
  ) {
    return null;
  }

  return {
    operationId,
    reservationId,
    emailLogId,
    deliveryToken: delivery.email_delivery_token,
    clientName: delivery.client_name.trim(),
    clientEmail: delivery.client_email.trim(),
    serviceName: delivery.service_name.trim(),
    professionalName: delivery.professional_name.trim(),
    startDatetime: delivery.start_datetime,
    endDatetime: delivery.end_datetime,
    businessName: delivery.business_name.trim(),
    businessAddress: delivery.business_address.trim(),
    businessTimezone: delivery.business_timezone.trim(),
    cancellationReason: delivery.cancellation_reason.trim(),
  };
}

function parseList<T>(
  value: unknown,
  parser: (item: unknown) => T | null,
  errorMessage: string,
) {
  if (!Array.isArray(value)) throw new Error(errorMessage);

  const parsed = value.map(parser).filter((item): item is T => item !== null);

  if (parsed.length !== value.length) throw new Error(errorMessage);

  return parsed;
}

function isRpcError(error: { message: string }, code: string) {
  return error.message.includes(code);
}

export class AvailabilityBlockValidationError extends Error {}

export class AvailabilityBlockAccessError extends Error {}

export async function prepareMyAvailabilityBlock(
  input: CreateAvailabilityBlockInput,
): Promise<PrepareAvailabilityBlockResult> {
  const supabase = await createAuthServerClient();
  const result = await supabase.rpc("prepare_my_availability_block", {
    p_professional_id: input.professionalId,
    p_all_professionals: input.allProfessionals,
    p_block_date: input.date,
    p_all_day: input.allDay,
    p_start_time: input.start,
    p_end_time: input.end,
    p_reason: input.reason,
  });
  const rows = result.data as AvailabilityBlockRpcRow[] | null;

  if (result.error) {
    if (isRpcError(result.error, "panel_access_denied")) {
      throw new AvailabilityBlockAccessError(
        "La sesión no tiene acceso a este negocio.",
        { cause: result.error },
      );
    }

    if (
      isRpcError(result.error, "invalid_availability_block") ||
      isRpcError(result.error, "availability_block_in_the_past") ||
      isRpcError(result.error, "invalid_block_professional")
    ) {
      throw new AvailabilityBlockValidationError(
        "Revisa el profesional, la fecha y el intervalo del bloqueo.",
        { cause: result.error },
      );
    }

    throw new Error("Supabase no ha podido preparar el bloqueo.", {
      cause: result.error,
    });
  }

  const row = rows?.[0];

  if (!row || typeof row.operation_result !== "string") {
    throw new Error("Supabase no ha confirmado el resultado del bloqueo.");
  }

  if (row.operation_result === "created") {
    const blocks = parseList(
      row.blocks,
      parseBlock,
      "Supabase ha devuelto un bloqueo incompleto.",
    );

    if (blocks.length === 0) {
      throw new Error("Supabase no ha devuelto los bloqueos creados.");
    }

    return { outcome: "created", blocks };
  }

  if (
    row.operation_result !== "confirmation_required" ||
    typeof row.operation_id !== "string" ||
    !uuidPattern.test(row.operation_id)
  ) {
    throw new Error("Supabase ha devuelto una operación de bloqueo no válida.");
  }

  const affectedReservations = parseList(
    row.reservations,
    parseAffectedReservation,
    "Supabase ha devuelto citas afectadas incompletas.",
  );

  if (
    affectedReservations.length === 0 ||
    affectedReservations.length !== Number(row.affected_reservations)
  ) {
    throw new Error("Supabase no ha confirmado las citas afectadas.");
  }

  return {
    outcome: "confirmation_required",
    operationId: row.operation_id,
    affectedReservations,
  };
}

export async function confirmMyAvailabilityBlockCancellations(
  operationId: string,
  cancellationReason: string,
): Promise<ConfirmAvailabilityBlockResult> {
  const supabase = await createAuthServerClient();
  const result = await supabase.rpc(
    "confirm_my_availability_block_cancellations",
    {
      p_operation_id: operationId,
      p_cancellation_reason: cancellationReason,
    },
  );
  const rows = result.data as ConfirmAvailabilityBlockRpcRow[] | null;

  if (result.error) {
    if (isRpcError(result.error, "panel_access_denied")) {
      throw new AvailabilityBlockAccessError(
        "La sesión no tiene acceso a este negocio.",
        { cause: result.error },
      );
    }

    if (
      isRpcError(result.error, "invalid_business_cancellation") ||
      isRpcError(result.error, "invalid_block_operation")
    ) {
      throw new AvailabilityBlockValidationError(
        "La confirmación del bloqueo no es válida o ha caducado.",
        { cause: result.error },
      );
    }

    throw new Error("Supabase no ha podido confirmar las cancelaciones.", {
      cause: result.error,
    });
  }

  const row = rows?.[0];

  if (!row || typeof row.operation_result !== "string") {
    throw new Error("Supabase no ha confirmado la operación.");
  }

  if (row.operation_result === "preview_expired") {
    return { outcome: "preview_expired" };
  }

  if (row.operation_result === "confirmation_required") {
    return {
      outcome: "confirmation_required",
      affectedReservations: parseList(
        row.reservations,
        parseAffectedReservation,
        "Supabase ha devuelto citas afectadas incompletas.",
      ),
    };
  }

  if (row.operation_result !== "completed") {
    throw new Error("Supabase ha devuelto un resultado desconocido.");
  }

  const blocks = parseList(
    row.blocks,
    parseBlock,
    "Supabase ha devuelto bloqueos incompletos.",
  );
  const emailDeliveries = parseList(
    row.email_deliveries,
    (value) => parseEmailDelivery(value, operationId),
    "Supabase ha devuelto emails de cancelación incompletos.",
  );
  const affectedReservations = Number(row.affected_reservations);

  if (
    !Number.isSafeInteger(affectedReservations) ||
    affectedReservations < 1 ||
    blocks.length === 0
  ) {
    throw new Error("Supabase ha devuelto una cancelación incompleta.");
  }

  return {
    outcome: "completed",
    affectedReservations,
    blocks,
    emailDeliveries,
  };
}

export async function recordBusinessCancellationEmailResult(
  context: BusinessCancellationEmailDelivery,
  emailResult: ReservationEmailRecord,
) {
  const supabase = await createAuthServerClient();
  const result = await supabase.rpc(
    "record_my_business_cancellation_email_result",
    {
      p_operation_id: context.operationId,
      p_reservation_id: context.reservationId,
      p_email_log_id: context.emailLogId,
      p_email_delivery_token: context.deliveryToken,
      p_email_status: emailResult.status,
      p_provider_message_id: emailResult.providerMessageId,
      p_error_message: emailResult.errorMessage,
    },
  );

  if (result.error) {
    throw new Error(
      "Supabase no ha podido registrar el resultado del email de cancelación del negocio.",
      { cause: result.error },
    );
  }
}
