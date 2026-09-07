export type AvailablePeriod = {
  start: string;
  end: string;
};

export type BookableSlot = {
  start: string;
  end: string;
};

function timeToMinutes(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);

  if (!match) {
    throw new Error(`La hora ${time} no tiene el formato HH:MM.`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) {
    throw new Error(`La hora ${time} no existe.`);
  }

  return hour * 60 + minute;
}

function minutesToTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function generateBookableSlots(
  availablePeriods: AvailablePeriod[],
  durationMinutes: number,
): BookableSlot[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("La duración del servicio debe ser un entero positivo.");
  }

  return availablePeriods.flatMap((period) => {
    const periodStart = timeToMinutes(period.start);
    const periodEnd = timeToMinutes(period.end);

    if (periodStart >= periodEnd) {
      throw new Error(
        `El periodo disponible ${period.start}–${period.end} no es válido.`,
      );
    }

    const slots: BookableSlot[] = [];

    for (
      let slotStart = periodStart;
      slotStart + durationMinutes <= periodEnd;
      slotStart += durationMinutes
    ) {
      slots.push({
        start: minutesToTime(slotStart),
        end: minutesToTime(slotStart + durationMinutes),
      });
    }

    return slots;
  });
}
