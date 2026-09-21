import { getPanelIdentity } from "@/lib/auth/business-access";
import {
  getMyCalendarMonth,
  isCalendarMonth,
} from "@/lib/auth/calendar-reservations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month");

  if (!isCalendarMonth(month)) {
    return Response.json(
      { ok: false, message: "El mes solicitado no es válido." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const identity = await getPanelIdentity();

  if (!identity.authenticated) {
    return Response.json(
      { ok: false, message: "Debes iniciar sesión." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (!identity.access) {
    return Response.json(
      { ok: false, message: "No tienes acceso a este negocio." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const result = await getMyCalendarMonth(month);

  if (!result.ok) {
    return Response.json(
      { ok: false, message: "No se ha podido cargar la agenda." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
