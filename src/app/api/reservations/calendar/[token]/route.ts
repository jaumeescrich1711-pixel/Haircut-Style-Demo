import { buildReservationCalendarEvent } from "@/lib/calendar-event";
import { getManagedReservation } from "@/lib/reservations";

export const dynamic = "force-dynamic";

const managementTokenPattern = /^[0-9a-f]{64}$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  if (!managementTokenPattern.test(token)) {
    return Response.json(
      { ok: false, message: "El enlace de calendario no es válido." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const reservation = await getManagedReservation(token);

    if (!reservation) {
      return Response.json(
        { ok: false, message: "No hemos encontrado esta cita." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (reservation.status !== "confirmed") {
      return Response.json(
        { ok: false, message: "Esta cita ya no está activa." },
        { status: 410, headers: { "Cache-Control": "no-store" } },
      );
    }

    return new Response(buildReservationCalendarEvent(reservation), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="haircut-style-reserva-${reservation.id}.ics"`,
        "Content-Type": "text/calendar; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return Response.json(
      {
        ok: false,
        message: "No se ha podido preparar el calendario. Inténtalo de nuevo.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
