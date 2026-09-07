import "server-only";

import { createClient } from "@/lib/supabase/server";

const HAIRCUT_STYLE_BUSINESS_ID = 1;

export type PublicProfessional = {
  id: number;
  name: string;
  serviceIds: number[];
};

type ProfessionalRow = {
  id: number;
  name: string;
};

type ProfessionalServiceRow = {
  professional_id: number;
  service_id: number;
};

export async function getActiveProfessionals(): Promise<
  PublicProfessional[]
> {
  const supabase = createClient();
  const { data: professionals, error: professionalsError } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("business_id", HAIRCUT_STYLE_BUSINESS_ID)
    .eq("active", true)
    .order("id", { ascending: true })
    .returns<ProfessionalRow[]>();

  if (professionalsError) {
    throw new Error("No se han podido cargar los profesionales públicos.", {
      cause: professionalsError,
    });
  }

  if (professionals.length === 0) {
    return [];
  }

  const professionalIds = professionals.map((professional) => professional.id);
  const { data: professionalServices, error: professionalServicesError } =
    await supabase
      .from("professional_services")
      .select("professional_id, service_id")
      .in("professional_id", professionalIds)
      .order("professional_id", { ascending: true })
      .order("service_id", { ascending: true })
      .returns<ProfessionalServiceRow[]>();

  if (professionalServicesError) {
    throw new Error(
      "No se han podido cargar los servicios de los profesionales.",
      { cause: professionalServicesError },
    );
  }

  const serviceIdsByProfessional = new Map<number, number[]>();

  for (const relation of professionalServices) {
    const serviceIds =
      serviceIdsByProfessional.get(relation.professional_id) ?? [];
    serviceIds.push(relation.service_id);
    serviceIdsByProfessional.set(relation.professional_id, serviceIds);
  }

  return professionals.map((professional) => ({
    id: professional.id,
    name: professional.name.trim(),
    serviceIds: serviceIdsByProfessional.get(professional.id) ?? [],
  }));
}
