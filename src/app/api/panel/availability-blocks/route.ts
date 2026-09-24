import { createMyAvailabilityBlock } from "@/lib/auth/availability-blocks";
import {
  AvailabilityBlockAccessError,
  AvailabilityBlockValidationError,
} from "@/lib/auth/availability-blocks";
import { getPanelIdentity } from "@/lib/auth/business-access";
import { parseIsoDate } from "@/lib/calendar-date";

export const dynamic = "force-dynamic";

type AvailabilityBlockRequest = {
  professionalId?: unknown;
  allProfessionals?: unknown;
  date?: unknown;
  allDay?: unknown;
  start?: unknown;
  end?: unknown;
  reason?: unknown;
};

const privateHeaders = { "Cache-Control": "private, no-store" };
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { ok: false, message: "Origen de la petición no permitido." },
      { status: 403, headers: privateHeaders },
    );
  }

  const identity = await getPanelIdentity();

  if (!identity.authenticated) {
    return Response.json(
      { ok: false, message: "Debes iniciar sesión." },
      { status: 401, headers: privateHeaders },
    );
  }

  if (!identity.access) {
    return Response.json(
      { ok: false, message: "No tienes acceso a este negocio." },
      { status: 403, headers: privateHeaders },
    );
  }

  let payload: AvailabilityBlockRequest;

  try {
    payload = (await request.json()) as AvailabilityBlockRequest;
  } catch {
    return Response.json(
      { ok: false, message: "La petición no contiene JSON válido." },
      { status: 400, headers: privateHeaders },
    );
  }

  const allProfessionals = payload.allProfessionals === true;
  const professionalId =
    payload.professionalId === null ? null : Number(payload.professionalId);
  const allDay = payload.allDay === true;
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const start = typeof payload.start === "string" ? payload.start : null;
  const end = typeof payload.end === "string" ? payload.end : null;
  const validProfessionalSelection = allProfessionals
    ? professionalId === null
    : Number.isSafeInteger(professionalId) && Number(professionalId) > 0;
  const validInterval = allDay
    ? start === null && end === null
    : start !== null &&
      end !== null &&
      timePattern.test(start) &&
      timePattern.test(end) &&
      start < end;

  if (
    typeof payload.allProfessionals !== "boolean" ||
    typeof payload.allDay !== "boolean" ||
    !validProfessionalSelection ||
    typeof payload.date !== "string" ||
    !parseIsoDate(payload.date) ||
    !validInterval ||
    reason.length > 300
  ) {
    return Response.json(
      { ok: false, message: "Revisa los datos del bloqueo antes de guardar." },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const result = await createMyAvailabilityBlock({
      professionalId,
      allProfessionals,
      date: payload.date,
      allDay,
      start,
      end,
      reason,
    });

    if (!result.created) {
      return Response.json(
        {
          ok: false,
          code: "active_reservations_affected",
          affectedReservations: result.affectedReservations,
          message:
            result.affectedReservations === 1
              ? "Hay 1 reserva activa afectada. Gestiona esa cita antes de bloquear el horario."
              : `Hay ${result.affectedReservations} reservas activas afectadas. Gestiona esas citas antes de bloquear el horario.`,
        },
        { status: 409, headers: privateHeaders },
      );
    }

    return Response.json(
      { ok: true, blocks: result.blocks },
      { status: 201, headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof AvailabilityBlockAccessError) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 403, headers: privateHeaders },
      );
    }

    if (error instanceof AvailabilityBlockValidationError) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 400, headers: privateHeaders },
      );
    }

    return Response.json(
      {
        ok: false,
        message:
          "No se ha podido guardar el bloqueo. Inténtalo de nuevo en unos segundos.",
      },
      { status: 503, headers: privateHeaders },
    );
  }
}
