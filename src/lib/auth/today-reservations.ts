import "server-only";

import { createAuthServerClient } from "@/lib/supabase/auth-server";

export type TodayReservation = {
  id: number;
  clientName: string;
  serviceName: string;
  professionalName: string;
  startDatetime: string;
  endDatetime: string;
};

export type TodayReservationsResult =
  | {
      ok: true;
      timeZone: string;
      reservations: TodayReservation[];
    }
  | {
      ok: false;
      timeZone: "Europe/Madrid";
      reservations: [];
    };

type RpcReservation = {
  id?: unknown;
  client_name?: unknown;
  service_name?: unknown;
  professional_name?: unknown;
  start_datetime?: unknown;
  end_datetime?: unknown;
};

function parseReservation(value: unknown): TodayReservation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const reservation = value as RpcReservation;
  const id = Number(reservation.id);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof reservation.client_name !== "string" ||
    typeof reservation.service_name !== "string" ||
    typeof reservation.professional_name !== "string" ||
    typeof reservation.start_datetime !== "string" ||
    typeof reservation.end_datetime !== "string"
  ) {
    return null;
  }

  return {
    id,
    clientName: reservation.client_name,
    serviceName: reservation.service_name,
    professionalName: reservation.professional_name,
    startDatetime: reservation.start_datetime,
    endDatetime: reservation.end_datetime,
  };
}

export async function getMyTodayReservations(): Promise<TodayReservationsResult> {
  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.rpc("get_my_today_reservations");

  if (error || !Array.isArray(data) || data.length !== 1) {
    return {
      ok: false,
      timeZone: "Europe/Madrid",
      reservations: [],
    };
  }

  const result = data[0] as {
    business_timezone?: unknown;
    reservations?: unknown;
  };

  if (
    typeof result.business_timezone !== "string" ||
    !Array.isArray(result.reservations)
  ) {
    return {
      ok: false,
      timeZone: "Europe/Madrid",
      reservations: [],
    };
  }

  const reservations = result.reservations
    .map(parseReservation)
    .filter((reservation): reservation is TodayReservation => reservation !== null);

  if (reservations.length !== result.reservations.length) {
    return {
      ok: false,
      timeZone: "Europe/Madrid",
      reservations: [],
    };
  }

  return {
    ok: true,
    timeZone: result.business_timezone,
    reservations,
  };
}
