import "server-only";

import { createClient } from "@/lib/supabase/server";

const HAIRCUT_STYLE_BUSINESS_ID = 1;

export type PublicService = {
  id: number;
  name: string;
  durationMinutes: number;
  price: number;
};

type ServiceRow = {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
};

export class ServiceNotFoundError extends Error {}

function toPublicService(service: ServiceRow): PublicService {
  if (
    !Number.isInteger(service.duration_minutes) ||
    service.duration_minutes <= 0
  ) {
    throw new Error("La duración del servicio no es válida.");
  }

  return {
    id: service.id,
    name: service.name.trim(),
    durationMinutes: service.duration_minutes,
    price: service.price,
  };
}

export async function getActiveServices(): Promise<PublicService[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price")
    .eq("business_id", HAIRCUT_STYLE_BUSINESS_ID)
    .eq("active", true)
    .order("id", { ascending: true })
    .returns<ServiceRow[]>();

  if (error) {
    throw new Error("No se han podido cargar los servicios públicos.", {
      cause: error,
    });
  }

  return data.map(toPublicService);
}

export async function getActiveService(
  serviceId: number,
): Promise<PublicService> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, duration_minutes, price")
    .eq("id", serviceId)
    .eq("business_id", HAIRCUT_STYLE_BUSINESS_ID)
    .eq("active", true)
    .maybeSingle<ServiceRow>();

  if (error) {
    throw new Error("No se ha podido cargar el servicio público.", {
      cause: error,
    });
  }

  if (!data) {
    throw new ServiceNotFoundError(
      "El servicio no existe o no está activo en Haircut Style.",
    );
  }

  return toPublicService(data);
}
