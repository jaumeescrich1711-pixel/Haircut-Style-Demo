import {
  getProfessionalAvailability,
  ProfessionalNotFoundError,
} from "@/lib/availability";
import {
  getBookableSchedule,
  ProfessionalServiceNotFoundError,
} from "@/lib/booking-slots";
import { ServiceNotFoundError } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const professionalId = Number(searchParams.get("professionalId"));
  const serviceIdParam = searchParams.get("serviceId");
  const date = searchParams.get("date") ?? "";

  if (!Number.isInteger(professionalId) || professionalId <= 0) {
    return Response.json(
      { ok: false, message: "professionalId debe ser un entero positivo." },
      { status: 400 },
    );
  }

  if (
    serviceIdParam !== null &&
    (!Number.isInteger(Number(serviceIdParam)) || Number(serviceIdParam) <= 0)
  ) {
    return Response.json(
      { ok: false, message: "serviceId debe ser un entero positivo." },
      { status: 400 },
    );
  }

  try {
    if (serviceIdParam !== null) {
      const schedule = await getBookableSchedule(
        professionalId,
        Number(serviceIdParam),
        date,
      );

      return Response.json({ ok: true, ...schedule });
    }

    const availability = await getProfessionalAvailability(
      professionalId,
      date,
    );

    return Response.json({ ok: true, availability });
  } catch (error) {
    if (
      error instanceof ProfessionalNotFoundError ||
      error instanceof ServiceNotFoundError ||
      error instanceof ProfessionalServiceNotFoundError
    ) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 404 },
      );
    }

    if (
      error instanceof Error &&
      (error.message.includes("fecha") || error.message.includes("formato"))
    ) {
      return Response.json(
        { ok: false, message: error.message },
        { status: 400 },
      );
    }

    return Response.json(
      {
        ok: false,
        message:
          "No se ha podido calcular la disponibilidad. Revisa la conexión y las políticas RLS.",
      },
      { status: 503 },
    );
  }
}
