import { parseIsoDate } from "@/lib/calendar-date";
import {
  createReservation,
  ReservationUnavailableError,
  ReservationValidationError,
} from "@/lib/reservations";

export const dynamic = "force-dynamic";

type ReservationRequest = {
  serviceId?: unknown;
  professional?: unknown;
  date?: unknown;
  start?: unknown;
  client?: {
    name?: unknown;
    phone?: unknown;
    email?: unknown;
  };
};

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9\s().-]+$/;

function isValidCustomer(client: ReservationRequest["client"]) {
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

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { ok: false, message: "Origen de la petición no permitido." },
      { status: 403 },
    );
  }

  let payload: ReservationRequest;

  try {
    payload = (await request.json()) as ReservationRequest;
  } catch {
    return Response.json(
      { ok: false, message: "La petición no contiene JSON válido." },
      { status: 400 },
    );
  }

  const serviceId = Number(payload.serviceId);
  const professionalSelection = payload.professional;
  const professionalId =
    professionalSelection === "any" ? null : Number(professionalSelection);

  if (
    !Number.isInteger(serviceId) ||
    serviceId <= 0 ||
    (professionalSelection !== "any" &&
      (!Number.isInteger(professionalId) || (professionalId ?? 0) <= 0)) ||
    typeof payload.date !== "string" ||
    !parseIsoDate(payload.date) ||
    typeof payload.start !== "string" ||
    !timePattern.test(payload.start) ||
    !isValidCustomer(payload.client)
  ) {
    return Response.json(
      { ok: false, message: "Revisa los datos antes de confirmar la reserva." },
      { status: 400 },
    );
  }

  try {
    const booking = await createReservation({
      serviceId,
      professionalId,
      selectedAnyProfessional: professionalSelection === "any",
      date: payload.date,
      start: payload.start,
      client: {
        name: payload.client!.name as string,
        phone: payload.client!.phone as string,
        email: payload.client!.email as string,
      },
    });

    return Response.json(
      { ok: true, booking },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof ReservationUnavailableError) {
      return Response.json(
        { ok: false, code: "slot_unavailable", message: error.message },
        { status: 409 },
      );
    }

    if (error instanceof ReservationValidationError) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 400 },
      );
    }

    return Response.json(
      {
        ok: false,
        message:
          "No se ha podido guardar la reserva. Inténtalo de nuevo en unos segundos.",
      },
      { status: 503 },
    );
  }
}
