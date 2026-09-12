import { attemptReservationCancellationEmail } from "@/lib/reservation-email-delivery";
import { cancelReservationByManagementToken } from "@/lib/reservations";

export const dynamic = "force-dynamic";

const managementTokenPattern = /^[0-9a-f]{64}$/;

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const origin = request.headers.get("origin");
  const publicBaseUrl = new URL(request.url).origin;

  if (origin && origin !== publicBaseUrl) {
    return Response.json(
      { ok: false, message: "Origen de la petición no permitido." },
      { status: 403 },
    );
  }

  const { token } = await context.params;

  if (!managementTokenPattern.test(token)) {
    return Response.json(
      { ok: false, message: "El enlace de cancelación no es válido." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const cancelled = await cancelReservationByManagementToken(
      token,
      publicBaseUrl,
    );

    if (!cancelled) {
      return Response.json(
        { ok: false, message: "El enlace de cancelación no es válido." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (cancelled.result === "already_cancelled") {
      return Response.json(
        {
          ok: true,
          result: "already_cancelled",
          message: "Esta cita ya estaba cancelada.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (cancelled.result === "not_cancellable" || !cancelled.email) {
      return Response.json(
        {
          ok: false,
          message: "Esta cita no se puede cancelar desde este enlace.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const emailResult = await attemptReservationCancellationEmail(
        cancelled.email,
      );

      if (!emailResult.recorded) {
        console.error(
          "No se ha podido registrar el resultado del email de cancelación.",
          { reservationId: cancelled.reservation.id },
        );
      }
    } catch {
      console.error("Ha fallado el procesamiento del email de cancelación.", {
        reservationId: cancelled.reservation.id,
      });
    }

    return Response.json(
      {
        ok: true,
        result: "cancelled",
        message: "Tu cita ha sido cancelada correctamente.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        message:
          "No se ha podido cancelar la cita. Puedes volver a intentarlo.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
