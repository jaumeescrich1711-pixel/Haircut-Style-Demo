import "server-only";

import {
  getProfessionalAvailability,
  type ProfessionalAvailability,
} from "@/lib/availability";
import { getActiveService, type PublicService } from "@/lib/services";
import {
  generateBookableSlots,
  type BookableSlot,
} from "@/lib/slot-generator";
import { createClient } from "@/lib/supabase/server";

export class ProfessionalServiceNotFoundError extends Error {}

export type BookableSchedule = {
  availability: ProfessionalAvailability;
  service: Pick<PublicService, "id" | "name" | "durationMinutes">;
  slots: BookableSlot[];
};

export type BookableSlotWithProfessionals = BookableSlot & {
  professionalIds: number[];
};

export function mergeProfessionalSlots(
  schedules: Array<{ professionalId: number; slots: BookableSlot[] }>,
): BookableSlotWithProfessionals[] {
  const slotsByStart = new Map<string, BookableSlotWithProfessionals>();

  for (const schedule of schedules) {
    for (const slot of schedule.slots) {
      const existing = slotsByStart.get(slot.start);

      if (existing) {
        if (!existing.professionalIds.includes(schedule.professionalId)) {
          existing.professionalIds.push(schedule.professionalId);
          existing.professionalIds.sort((left, right) => left - right);
        }
        continue;
      }

      slotsByStart.set(slot.start, {
        ...slot,
        professionalIds: [schedule.professionalId],
      });
    }
  }

  return [...slotsByStart.values()].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
}

export async function getBookableSchedule(
  professionalId: number,
  serviceId: number,
  date: string,
): Promise<BookableSchedule> {
  const supabase = createClient();
  const [availability, service, professionalServiceResult] = await Promise.all([
    getProfessionalAvailability(professionalId, date),
    getActiveService(serviceId),
    supabase
      .from("professional_services")
      .select("professional_id")
      .eq("professional_id", professionalId)
      .eq("service_id", serviceId)
      .maybeSingle<{ professional_id: number }>(),
  ]);

  if (professionalServiceResult.error) {
    throw new Error(
      "No se ha podido comprobar la relación entre profesional y servicio.",
      { cause: professionalServiceResult.error },
    );
  }

  if (!professionalServiceResult.data) {
    throw new ProfessionalServiceNotFoundError(
      "El profesional no realiza el servicio indicado.",
    );
  }

  return {
    availability,
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
    },
    // Las futuras reservas se descontarán como intervalos ocupados en
    // availability.ts antes de llegar a este generador.
    slots: generateBookableSlots(
      availability.availablePeriods,
      service.durationMinutes,
    ),
  };
}
