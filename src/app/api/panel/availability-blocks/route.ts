import {
  AvailabilityBlockAccessError,
  AvailabilityBlockValidationError,
  confirmMyAvailabilityBlockCancellations,
  prepareMyAvailabilityBlock,
} from "@/lib/auth/availability-blocks";
import { getPanelIdentity } from "@/lib/auth/business-access";
import { attemptBusinessCancellationEmail } from "@/lib/auth/business-cancellation-email";
import { parseIsoDate } from "@/lib/calendar-date";

export const dynamic = "force-dynamic";

type PrepareBlockRequest = {
  action?: unknown;
  professionalId?: unknown;
  allProfessionals?: unknown;
  date?: unknown;
  allDay?: unknown;
  start?: unknown;
  end?: unknown;
  reason?: unknown;
};

type ConfirmBlockRequest = {
  action?: unknown;
  operationId?: unknown;
  cancellationReason?: unknown;
};

const privateHeaders = { "Cache-Control": "private, no-store" };
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidRequest(message = "Revisa los datos antes de continuar.") {
  return Response.json(
    { ok: false, message },
    { status: 400, headers: privateHeaders },
  );
}

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

  let payload: PrepareBlockRequest | ConfirmBlockRequest;

  try {
    payload = (await request.json()) as PrepareBlockRequest | ConfirmBlockRequest;
  } catch {
    return invalidRequest("La petición no contiene JSON válido.");
  }

  try {
    if (payload.action === "confirm") {
      const confirmPayload = payload as ConfirmBlockRequest;
      const operationId =
        typeof confirmPayload.operationId === "string"
          ? confirmPayload.operationId.trim()
          : "";
      const cancellationReason =
        typeof confirmPayload.cancellationReason === "string"
          ? confirmPayload.cancellationReason.trim()
          : "";

      if (
        !uuidPattern.test(operationId) ||
        cancellationReason.length < 1 ||
        cancellationReason.length > 500
      ) {
        return invalidRequest(
          "Indica un motivo de cancelación antes de confirmar.",
        );
      }

      const result = await confirmMyAvailabilityBlockCancellations(
        operationId,
        cancellationReason,
      );

      if (result.outcome === "preview_expired") {
        return Response.json(
          {
            ok: false,
            code: "preview_expired",
            message:
              "La comprobación ha caducado. Revisa de nuevo las citas afectadas.",
          },
          { status: 409, headers: privateHeaders },
        );
      }

      if (result.outcome === "confirmation_required") {
        return Response.json(
          {
            ok: true,
            outcome: "confirmation_required",
            operationId,
            affectedReservations: result.affectedReservations,
            message:
              "Las citas afectadas han cambiado. Revisa la lista actualizada y confirma de nuevo.",
          },
          { headers: privateHeaders },
        );
      }

      const bookingUrl = new URL("/#reservar", request.url).toString();
      const deliveries = await Promise.all(
        result.emailDeliveries.map((delivery) =>
          attemptBusinessCancellationEmail(delivery, bookingUrl),
        ),
      );
      const sentEmails = deliveries.filter(
        (delivery) => delivery.status === "sent",
      ).length;
      const failedEmails = deliveries.filter(
        (delivery) => delivery.status === "error",
      ).length;
      const unrecordedEmails = deliveries.filter(
        (delivery) => !delivery.recorded,
      ).length;

      return Response.json(
        {
          ok: true,
          outcome: "completed",
          blocks: result.blocks,
          cancelledReservations: result.affectedReservations,
          email: {
            attempted: deliveries.length,
            sent: sentEmails,
            failed: failedEmails,
            unrecorded: unrecordedEmails,
          },
        },
        { status: 201, headers: privateHeaders },
      );
    }

    if (payload.action !== "prepare") {
      return invalidRequest();
    }

    const preparePayload = payload as PrepareBlockRequest;
    const allProfessionals = preparePayload.allProfessionals === true;
    const professionalId =
      preparePayload.professionalId === null
        ? null
        : Number(preparePayload.professionalId);
    const allDay = preparePayload.allDay === true;
    const reason =
      typeof preparePayload.reason === "string"
        ? preparePayload.reason.trim()
        : "";
    const start =
      typeof preparePayload.start === "string" ? preparePayload.start : null;
    const end =
      typeof preparePayload.end === "string" ? preparePayload.end : null;
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
      typeof preparePayload.allProfessionals !== "boolean" ||
      typeof preparePayload.allDay !== "boolean" ||
      !validProfessionalSelection ||
      typeof preparePayload.date !== "string" ||
      !parseIsoDate(preparePayload.date) ||
      !validInterval ||
      reason.length > 500
    ) {
      return invalidRequest("Revisa los datos del bloqueo antes de guardar.");
    }

    const result = await prepareMyAvailabilityBlock({
      professionalId,
      allProfessionals,
      date: preparePayload.date,
      allDay,
      start,
      end,
      reason,
    });

    if (result.outcome === "confirmation_required") {
      const count = result.affectedReservations.length;

      return Response.json(
        {
          ok: true,
          outcome: "confirmation_required",
          operationId: result.operationId,
          affectedReservations: result.affectedReservations,
          message:
            count === 1
              ? "Este bloqueo afecta a 1 reserva confirmada. Si continúas, se cancelará y se notificará al cliente."
              : `Este bloqueo afecta a ${count} reservas confirmadas. Si continúas, se cancelarán y se notificará individualmente a los clientes.`,
        },
        { headers: privateHeaders },
      );
    }

    return Response.json(
      { ok: true, outcome: "created", blocks: result.blocks },
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

    console.error("Ha fallado la operación de bloqueo del panel.", {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : "unknown_error",
    });

    return Response.json(
      {
        ok: false,
        message:
          "No se ha podido completar la operación. No se ha mostrado ninguna confirmación falsa.",
      },
      { status: 503, headers: privateHeaders },
    );
  }
}
