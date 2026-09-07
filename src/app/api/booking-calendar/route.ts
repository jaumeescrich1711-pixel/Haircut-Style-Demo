import {
  getBookingCalendar,
  type CalendarProfessionalSelection,
} from "@/lib/booking-calendar";
import { ProfessionalServiceNotFoundError } from "@/lib/booking-slots";
import { parseIsoMonth } from "@/lib/calendar-date";
import { ServiceNotFoundError } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const professionalIdParam = searchParams.get("professionalId") ?? "";
  const serviceId = Number(searchParams.get("serviceId"));
  const parsedMonth = parseIsoMonth(searchParams.get("month") ?? "");
  let selection: CalendarProfessionalSelection;

  if (professionalIdParam === "any") {
    selection = "any";
  } else {
    const professionalId = Number(professionalIdParam);

    if (!Number.isInteger(professionalId) || professionalId <= 0) {
      return Response.json(
        {
          ok: false,
          message: "professionalId debe ser un entero positivo o 'any'.",
        },
        { status: 400 },
      );
    }

    selection = professionalId;
  }

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return Response.json(
      { ok: false, message: "serviceId debe ser un entero positivo." },
      { status: 400 },
    );
  }

  if (!parsedMonth) {
    return Response.json(
      { ok: false, message: "month debe tener el formato AAAA-MM." },
      { status: 400 },
    );
  }

  try {
    const calendar = await getBookingCalendar(
      selection,
      serviceId,
      parsedMonth.year,
      parsedMonth.month,
    );

    return Response.json({ ok: true, calendar });
  } catch (error) {
    if (
      error instanceof ServiceNotFoundError ||
      error instanceof ProfessionalServiceNotFoundError
    ) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 404 },
      );
    }

    return Response.json(
      {
        ok: false,
        message:
          "No se ha podido cargar el calendario. Revisa la conexión y las políticas RLS.",
      },
      { status: 503 },
    );
  }
}
