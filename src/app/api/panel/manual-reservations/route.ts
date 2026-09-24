import { getPanelIdentity } from "@/lib/auth/business-access";
import {
  createManualReservation,
  getManualReservationOptions,
  getManualReservationSlots,
} from "@/lib/auth/manual-reservations";
import { ProfessionalServiceNotFoundError } from "@/lib/booking-slots";
import { parseIsoDate } from "@/lib/calendar-date";
import { attemptReservationConfirmationEmail } from "@/lib/reservation-email-delivery";
import {
  ReservationUnavailableError,
  ReservationValidationError,
} from "@/lib/reservations";
import { ServiceNotFoundError } from "@/lib/services";

export const dynamic = "force-dynamic";

type ManualReservationRequest = {
  serviceId?: unknown;
  professionalId?: unknown;
  date?: unknown;
  start?: unknown;
  client?: {
    name?: unknown;
    phone?: unknown;
    email?: unknown;
  };
};

const privateHeaders = { "Cache-Control": "private, no-store" };
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9\s().-]+$/;

function isValidCustomer(client: ManualReservationRequest["client"]) {
  if (
    typeof client?.name !== "string" ||
    typeof client.phone !== "string" ||
    typeof client.email !== "string"
  ) {
    return false;
  }

  const name = client.name.trim();
  const phone = client.phone.trim();
  const email = client.email.trim();
  const phoneDigits = phone.replace(/\D/g, "");

  return (
    name.length >= 1 &&
    name.length <= 120 &&
    phone.length >= 7 &&
    phone.length <= 20 &&
    phonePattern.test(phone) &&
    phoneDigits.length >= 7 &&
    phoneDigits.length <= 15 &&
    email.length >= 3 &&
    email.length <= 254 &&
    emailPattern.test(email)
  );
}

async function authorizePanelRequest() {
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

  return null;
}

export async function GET(request: Request) {
  const denied = await authorizePanelRequest();

  if (denied) return denied;

  const searchParams = new URL(request.url).searchParams;
  const serviceIdParam = searchParams.get("serviceId");
  const professionalIdParam = searchParams.get("professionalId");
  const date = searchParams.get("date");

  try {
    if (
      serviceIdParam === null &&
      professionalIdParam === null &&
      date === null
    ) {
      const options = await getManualReservationOptions();
      return Response.json(
        { ok: true, options },
        { headers: privateHeaders },
      );
    }

    const serviceId = Number(serviceIdParam);
    const professionalId = Number(professionalIdParam);

    if (
      !Number.isInteger(serviceId) ||
      serviceId <= 0 ||
      !Number.isInteger(professionalId) ||
      professionalId <= 0 ||
      typeof date !== "string" ||
      !parseIsoDate(date)
    ) {
      return Response.json(
        { ok: false, message: "Los datos para consultar horas no son válidos." },
        { status: 400, headers: privateHeaders },
      );
    }

    const availability = await getManualReservationSlots(
      professionalId,
      serviceId,
      date,
    );

    return Response.json(
      { ok: true, availability },
      { headers: privateHeaders },
    );
  } catch (error) {
    if (
      error instanceof ServiceNotFoundError ||
      error instanceof ProfessionalServiceNotFoundError
    ) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 404, headers: privateHeaders },
      );
    }

    if (error instanceof ReservationValidationError) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 400, headers: privateHeaders },
      );
    }

    return Response.json(
      { ok: false, message: "No se ha podido cargar la disponibilidad." },
      { status: 503, headers: privateHeaders },
    );
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { ok: false, message: "Origen de la petición no permitido." },
      { status: 403, headers: privateHeaders },
    );
  }

  const denied = await authorizePanelRequest();

  if (denied) return denied;

  let payload: ManualReservationRequest;

  try {
    payload = (await request.json()) as ManualReservationRequest;
  } catch {
    return Response.json(
      { ok: false, message: "La petición no contiene JSON válido." },
      { status: 400, headers: privateHeaders },
    );
  }

  const serviceId = Number(payload.serviceId);
  const professionalId = Number(payload.professionalId);

  if (
    !Number.isInteger(serviceId) ||
    serviceId <= 0 ||
    !Number.isInteger(professionalId) ||
    professionalId <= 0 ||
    typeof payload.date !== "string" ||
    !parseIsoDate(payload.date) ||
    typeof payload.start !== "string" ||
    !timePattern.test(payload.start) ||
    !isValidCustomer(payload.client)
  ) {
    return Response.json(
      { ok: false, message: "Revisa todos los datos antes de guardar." },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const created = await createManualReservation(
      {
        serviceId,
        professionalId,
        date: payload.date,
        start: payload.start,
        client: {
          name: payload.client!.name as string,
          phone: payload.client!.phone as string,
          email: payload.client!.email as string,
        },
      },
      new URL(request.url).origin,
    );
    let emailStatus: "sent" | "error" = "error";

    try {
      const emailResult = await attemptReservationConfirmationEmail(
        created.email,
      );
      emailStatus = emailResult.status;

      if (!emailResult.recorded) {
        console.error("No se ha podido registrar el resultado del email manual.", {
          reservationId: created.booking.id,
          emailStatus: emailResult.status,
        });
      }
    } catch {
      console.error("Ha fallado el email de la reserva manual.", {
        reservationId: created.booking.id,
      });
    }

    return Response.json(
      { ok: true, booking: created.booking, emailStatus },
      { status: 201, headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof ReservationUnavailableError) {
      return Response.json(
        {
          ok: false,
          code: "slot_unavailable",
          message: error.message,
        },
        { status: 409, headers: privateHeaders },
      );
    }

    if (error instanceof ReservationValidationError) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 400, headers: privateHeaders },
      );
    }

    return Response.json(
      {
        ok: false,
        message:
          "No se ha podido guardar la reserva. Inténtalo de nuevo en unos segundos.",
      },
      { status: 503, headers: privateHeaders },
    );
  }
}
