import "server-only";

import { createAuthServerClient } from "@/lib/supabase/auth-server";

export type CalendarProfessional = {
  id: number;
  name: string;
};

export type CalendarReservation = {
  id: number;
  professionalId: number;
  professionalName: string;
  clientName: string;
  serviceName: string;
  startDatetime: string;
  endDatetime: string;
  localDate: string;
  localStart: string;
  localEnd: string;
};

export type CalendarAvailabilityBlock = {
  id: number;
  professionalId: number;
  professionalName: string;
  startDatetime: string;
  endDatetime: string;
  localDate: string;
  localStart: string;
  localEnd: string;
  allDay: boolean;
  reason: string | null;
};

export type BusinessCalendarMonth = {
  month: string;
  today: string;
  timeZone: string;
  professionals: CalendarProfessional[];
  reservations: CalendarReservation[];
  blocks: CalendarAvailabilityBlock[];
};

export type CalendarMonthResult = {
  ok: boolean;
  calendar: BusinessCalendarMonth;
};

type RpcProfessional = { id?: unknown; name?: unknown };
type RpcReservation = {
  id?: unknown;
  professional_id?: unknown;
  professional_name?: unknown;
  client_name?: unknown;
  service_name?: unknown;
  start_datetime?: unknown;
  end_datetime?: unknown;
  local_date?: unknown;
  local_start?: unknown;
  local_end?: unknown;
};
type RpcAvailabilityBlock = {
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

const monthPattern = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function madridToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function emptyCalendar(month?: string): BusinessCalendarMonth {
  const today = madridToday();

  return {
    month: month && monthPattern.test(month) ? month : today.slice(0, 7),
    today,
    timeZone: "Europe/Madrid",
    professionals: [],
    reservations: [],
    blocks: [],
  };
}

function parseProfessional(value: unknown): CalendarProfessional | null {
  if (!value || typeof value !== "object") return null;

  const professional = value as RpcProfessional;
  const id = Number(professional.id);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof professional.name !== "string" ||
    !professional.name.trim()
  ) {
    return null;
  }

  return { id, name: professional.name.trim() };
}

function parseReservation(value: unknown): CalendarReservation | null {
  if (!value || typeof value !== "object") return null;

  const reservation = value as RpcReservation;
  const id = Number(reservation.id);
  const professionalId = Number(reservation.professional_id);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(professionalId) ||
    professionalId <= 0 ||
    typeof reservation.professional_name !== "string" ||
    typeof reservation.client_name !== "string" ||
    typeof reservation.service_name !== "string" ||
    typeof reservation.start_datetime !== "string" ||
    typeof reservation.end_datetime !== "string" ||
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
    professionalId,
    professionalName: reservation.professional_name.trim(),
    clientName: reservation.client_name,
    serviceName: reservation.service_name,
    startDatetime: reservation.start_datetime,
    endDatetime: reservation.end_datetime,
    localDate: reservation.local_date,
    localStart: reservation.local_start,
    localEnd: reservation.local_end,
  };
}

function parseAvailabilityBlock(
  value: unknown,
): CalendarAvailabilityBlock | null {
  if (!value || typeof value !== "object") return null;

  const block = value as RpcAvailabilityBlock;
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

export function isCalendarMonth(value: string | null): value is string {
  return typeof value === "string" && monthPattern.test(value);
}

export async function getMyCalendarMonth(
  month?: string,
): Promise<CalendarMonthResult> {
  const fallback = emptyCalendar(month);

  if (month && !isCalendarMonth(month)) {
    return { ok: false, calendar: fallback };
  }

  const supabase = await createAuthServerClient();
  const args = month ? { p_month: `${month}-01` } : undefined;
  const [reservationResult, blockResult] = await Promise.all([
    supabase.rpc("get_my_calendar_reservations", args),
    supabase.rpc("get_my_calendar_availability_blocks", args),
  ]);
  const { data, error } = reservationResult;

  if (
    error ||
    blockResult.error ||
    !Array.isArray(data) ||
    data.length !== 1 ||
    !Array.isArray(blockResult.data) ||
    blockResult.data.length !== 1
  ) {
    return { ok: false, calendar: fallback };
  }

  const result = data[0] as {
    business_timezone?: unknown;
    today_date?: unknown;
    month_start?: unknown;
    professionals?: unknown;
    reservations?: unknown;
  };
  const blockData = blockResult.data[0] as {
    business_timezone?: unknown;
    today_date?: unknown;
    month_start?: unknown;
    blocks?: unknown;
  };

  if (
    typeof result.business_timezone !== "string" ||
    typeof result.today_date !== "string" ||
    !datePattern.test(result.today_date) ||
    typeof result.month_start !== "string" ||
    !datePattern.test(result.month_start) ||
    !Array.isArray(result.professionals) ||
    !Array.isArray(result.reservations) ||
    blockData.business_timezone !== result.business_timezone ||
    blockData.today_date !== result.today_date ||
    blockData.month_start !== result.month_start ||
    !Array.isArray(blockData.blocks)
  ) {
    return { ok: false, calendar: fallback };
  }

  const professionals = result.professionals
    .map(parseProfessional)
    .filter((professional): professional is CalendarProfessional => professional !== null);
  const reservations = result.reservations
    .map(parseReservation)
    .filter((reservation): reservation is CalendarReservation => reservation !== null);
  const blocks = blockData.blocks
    .map(parseAvailabilityBlock)
    .filter((block): block is CalendarAvailabilityBlock => block !== null);

  if (
    professionals.length !== result.professionals.length ||
    reservations.length !== result.reservations.length ||
    blocks.length !== blockData.blocks.length
  ) {
    return { ok: false, calendar: fallback };
  }

  return {
    ok: true,
    calendar: {
      month: result.month_start.slice(0, 7),
      today: result.today_date,
      timeZone: result.business_timezone,
      professionals,
      reservations,
      blocks,
    },
  };
}

