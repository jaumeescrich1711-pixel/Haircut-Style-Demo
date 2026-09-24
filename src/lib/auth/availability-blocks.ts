import "server-only";

import type { CalendarAvailabilityBlock } from "@/lib/auth/calendar-reservations";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

type AvailabilityBlockRpcRow = {
  created: boolean;
  affected_reservations: number;
  blocks: unknown;
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

export type CreateAvailabilityBlockResult =
  | {
      created: true;
      affectedReservations: 0;
      blocks: CalendarAvailabilityBlock[];
    }
  | {
      created: false;
      affectedReservations: number;
      blocks: [];
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

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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
    typeof block.start_datetime !== "string" ||
    typeof block.end_datetime !== "string" ||
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

function isRpcError(error: { message: string }, code: string) {
  return error.message.includes(code);
}

export class AvailabilityBlockValidationError extends Error {}

export class AvailabilityBlockAccessError extends Error {}

export async function createMyAvailabilityBlock(
  input: CreateAvailabilityBlockInput,
): Promise<CreateAvailabilityBlockResult> {
  const supabase = await createAuthServerClient();
  const result = await supabase.rpc("create_my_availability_block", {
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

    throw new Error("Supabase no ha podido guardar el bloqueo.", {
      cause: result.error,
    });
  }

  const row = rows?.[0];

  if (!row || typeof row.created !== "boolean") {
    throw new Error("Supabase no ha confirmado el resultado del bloqueo.");
  }

  const affectedReservations = Number(row.affected_reservations);

  if (!Number.isSafeInteger(affectedReservations) || affectedReservations < 0) {
    throw new Error("Supabase ha devuelto un resultado de bloqueo no válido.");
  }

  if (!row.created) {
    return {
      created: false,
      affectedReservations,
      blocks: [],
    };
  }

  if (!Array.isArray(row.blocks)) {
    throw new Error("Supabase no ha devuelto los bloqueos creados.");
  }

  const blocks = row.blocks
    .map(parseBlock)
    .filter((block): block is CalendarAvailabilityBlock => block !== null);

  if (blocks.length === 0 || blocks.length !== row.blocks.length) {
    throw new Error("Supabase ha devuelto un bloqueo incompleto.");
  }

  return {
    created: true,
    affectedReservations: 0,
    blocks,
  };
}
