import "server-only";

import { createClient } from "@/lib/supabase/server";

const HAIRCUT_STYLE_BUSINESS_ID = 1;
const HAIRCUT_STYLE_TIME_ZONE = "Europe/Madrid";

type ScheduleRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type AvailabilityBlockRow = {
  start_datetime: string;
  end_datetime: string;
};

type AvailabilityOverrideRow = {
  date: string;
  start_time: string | null;
  end_time: string | null;
  available: boolean;
};

type ProfessionalRow = {
  id: number;
  name: string;
};

type InstantInterval = {
  start: number;
  end: number;
};

export type AvailabilityPeriod = {
  start: string;
  end: string;
};

export type AppliedAvailabilityOverride = AvailabilityPeriod & {
  available: boolean;
};

export type ProfessionalAvailability = {
  businessId: number;
  professional: {
    id: number;
    name: string;
  };
  date: string;
  dayOfWeek: number;
  timeZone: string;
  source: "weekly" | "override" | "closed";
  weeklySchedule: AvailabilityPeriod[];
  overrides: AppliedAvailabilityOverride[];
  blocks: AvailabilityPeriod[];
  availablePeriods: AvailabilityPeriod[];
};

export class ProfessionalNotFoundError extends Error {}

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HAIRCUT_STYLE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    throw new Error("La fecha debe tener el formato AAAA-MM-DD.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("La fecha indicada no existe.");
  }

  return { year, month, day };
}

function parseTime(time: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(time);

  if (!match) {
    throw new Error(`La hora ${time} no tiene un formato válido.`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);

  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`La hora ${time} no existe.`);
  }

  return { hour, minute, second };
}

function getFormattedParts(timestamp: number) {
  const values = new Map(
    dateTimeFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

function zonedDateTimeToTimestamp(date: string, time: string) {
  const { year, month, day } = parseDate(date);
  const { hour, minute, second } = parseTime(time);
  const expectedWallClock = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
  );
  let timestamp = expectedWallClock;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getFormattedParts(timestamp);
    const actualWallClock = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const adjusted = timestamp - (actualWallClock - expectedWallClock);

    if (adjusted === timestamp) {
      break;
    }

    timestamp = adjusted;
  }

  return timestamp;
}

function addDays(date: string, days: number) {
  const { year, month, day } = parseDate(date);
  const result = new Date(Date.UTC(year, month - 1, day + days));

  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, "0"),
    String(result.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getIsoDayOfWeek(date: string) {
  const { year, month, day } = parseDate(date);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return dayOfWeek === 0 ? 7 : dayOfWeek;
}

function formatLocalTime(timestamp: number) {
  const { hour, minute } = getFormattedParts(timestamp);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function createInstantInterval(date: string, start: string, end: string) {
  const interval = {
    start: zonedDateTimeToTimestamp(date, start),
    end: zonedDateTimeToTimestamp(date, end),
  };

  if (interval.start >= interval.end) {
    throw new Error(`El intervalo ${start}–${end} no es válido.`);
  }

  return interval;
}

function mergeIntervals(intervals: InstantInterval[]) {
  const sorted = intervals
    .filter((interval) => interval.start < interval.end)
    .toSorted((a, b) => a.start - b.start);
  const merged: InstantInterval[] = [];

  for (const interval of sorted) {
    const previous = merged.at(-1);

    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      continue;
    }

    previous.end = Math.max(previous.end, interval.end);
  }

  return merged;
}

// Las reservas ocupadas se podrán convertir en intervalos y pasar por esta
// misma operación antes de generar slots según la duración del servicio.
export function subtractUnavailableIntervals(
  available: InstantInterval[],
  unavailable: InstantInterval[],
) {
  let result = mergeIntervals(available);

  for (const blocked of mergeIntervals(unavailable)) {
    result = result.flatMap((period) => {
      if (blocked.end <= period.start || blocked.start >= period.end) {
        return [period];
      }

      const remaining: InstantInterval[] = [];

      if (blocked.start > period.start) {
        remaining.push({ start: period.start, end: blocked.start });
      }

      if (blocked.end < period.end) {
        remaining.push({ start: blocked.end, end: period.end });
      }

      return remaining;
    });
  }

  return result;
}

function toAvailabilityPeriods(intervals: InstantInterval[]) {
  return intervals.map((interval) => ({
    start: formatLocalTime(interval.start),
    end: formatLocalTime(interval.end),
  }));
}

function parseOverride(
  date: string,
  override: AvailabilityOverrideRow,
): InstantInterval | null {
  if (override.start_time === null && override.end_time === null) {
    if (!override.available) {
      return null;
    }

    throw new Error(
      "Un horario excepcional disponible debe indicar hora de inicio y fin.",
    );
  }

  if (override.start_time === null || override.end_time === null) {
    throw new Error(
      "Un horario excepcional debe indicar tanto inicio como fin.",
    );
  }

  return createInstantInterval(date, override.start_time, override.end_time);
}

function calculateProfessionalAvailability(
  professional: ProfessionalRow,
  date: string,
  schedules: ScheduleRow[],
  blocks: AvailabilityBlockRow[],
  overrides: AvailabilityOverrideRow[],
): ProfessionalAvailability {
  const dayOfWeek = getIsoDayOfWeek(date);
  const nextDate = addDays(date, 1);
  const dayStart = zonedDateTimeToTimestamp(date, "00:00");
  const dayEnd = zonedDateTimeToTimestamp(nextDate, "00:00");
  const weeklyIntervals = schedules
    .filter((schedule) => schedule.day_of_week === dayOfWeek)
    .map((schedule) =>
      createInstantInterval(date, schedule.start_time, schedule.end_time),
    );
  const parsedOverrides = overrides
    .filter((override) => override.date === date)
    .map((override) => ({
      row: override,
      interval: parseOverride(date, override),
    }));
  const closesAllDay = parsedOverrides.some(
    ({ row, interval }) => !row.available && interval === null,
  );
  const availableOverrides = parsedOverrides
    .filter(
      (override): override is typeof override & { interval: InstantInterval } =>
        override.row.available && override.interval !== null,
    )
    .map(({ interval }) => interval);
  const unavailableOverrides = parsedOverrides
    .filter(
      (override): override is typeof override & { interval: InstantInterval } =>
        !override.row.available && override.interval !== null,
    )
    .map(({ interval }) => interval);
  const blockIntervals = blocks
    .filter(
      (block) =>
        Date.parse(block.start_datetime) < dayEnd &&
        Date.parse(block.end_datetime) > dayStart,
    )
    .map((block) => ({
      start: Math.max(dayStart, Date.parse(block.start_datetime)),
      end: Math.min(dayEnd, Date.parse(block.end_datetime)),
    }));

  let source: ProfessionalAvailability["source"] = "weekly";
  let availableIntervals = weeklyIntervals;

  if (closesAllDay) {
    source = "closed";
    availableIntervals = [];
  } else if (availableOverrides.length > 0) {
    source = "override";
    availableIntervals = availableOverrides;
  }

  availableIntervals = subtractUnavailableIntervals(
    availableIntervals,
    [...unavailableOverrides, ...blockIntervals],
  );

  return {
    businessId: HAIRCUT_STYLE_BUSINESS_ID,
    professional: {
      id: professional.id,
      name: professional.name.trim(),
    },
    date,
    dayOfWeek,
    timeZone: HAIRCUT_STYLE_TIME_ZONE,
    source,
    weeklySchedule: toAvailabilityPeriods(weeklyIntervals),
    overrides: parsedOverrides.map(({ row, interval }) => ({
      available: row.available,
      start: interval ? formatLocalTime(interval.start) : "00:00",
      end: interval ? formatLocalTime(interval.end) : "24:00",
    })),
    blocks: toAvailabilityPeriods(blockIntervals),
    availablePeriods: toAvailabilityPeriods(availableIntervals),
  };
}

async function getActiveProfessional(professionalId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("professionals")
    .select("id, name")
    .eq("id", professionalId)
    .eq("business_id", HAIRCUT_STYLE_BUSINESS_ID)
    .eq("active", true)
    .maybeSingle<ProfessionalRow>();

  if (error) {
    throw new Error("No se ha podido comprobar el profesional.", {
      cause: error,
    });
  }

  if (!data) {
    throw new ProfessionalNotFoundError(
      "El profesional no existe o no está activo en Haircut Style.",
    );
  }

  return data;
}

export async function getProfessionalAvailabilityRange(
  professionalId: number,
  dates: string[],
): Promise<ProfessionalAvailability[]> {
  const uniqueDates = [...new Set(dates)].sort();

  if (uniqueDates.length === 0) {
    return [];
  }

  const dayOfWeeks = [
    ...new Set(uniqueDates.map((date) => getIsoDayOfWeek(date))),
  ];
  const firstDate = uniqueDates[0];
  const lastDate = uniqueDates.at(-1) ?? firstDate;
  const rangeStart = zonedDateTimeToTimestamp(firstDate, "00:00");
  const rangeEnd = zonedDateTimeToTimestamp(addDays(lastDate, 1), "00:00");
  const supabase = createClient();
  const [professional, scheduleResult, blocksResult, overridesResult] =
    await Promise.all([
      getActiveProfessional(professionalId),
      supabase
        .from("professional_schedules")
        .select("day_of_week, start_time, end_time")
        .eq("professional_id", professionalId)
        .in("day_of_week", dayOfWeeks)
        .eq("active", true)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true })
        .returns<ScheduleRow[]>(),
      supabase
        .from("availability_blocks")
        .select("start_datetime, end_datetime")
        .eq("business_id", HAIRCUT_STYLE_BUSINESS_ID)
        .eq("professional_id", professionalId)
        .eq("active", true)
        .lt("start_datetime", new Date(rangeEnd).toISOString())
        .gt("end_datetime", new Date(rangeStart).toISOString())
        .order("start_datetime", { ascending: true })
        .returns<AvailabilityBlockRow[]>(),
      supabase
        .from("availability_overrides")
        .select("date, start_time, end_time, available")
        .eq("professional_id", professionalId)
        .gte("date", firstDate)
        .lte("date", lastDate)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true })
        .returns<AvailabilityOverrideRow[]>(),
    ]);

  if (scheduleResult.error || blocksResult.error || overridesResult.error) {
    throw new Error(
      "No se han podido leer los horarios, bloqueos o excepciones.",
      {
        cause:
          scheduleResult.error ?? blocksResult.error ?? overridesResult.error,
      },
    );
  }

  return uniqueDates.map((date) =>
    calculateProfessionalAvailability(
      professional,
      date,
      scheduleResult.data,
      blocksResult.data,
      overridesResult.data,
    ),
  );
}

export async function getProfessionalAvailability(
  professionalId: number,
  date: string,
): Promise<ProfessionalAvailability> {
  const [availability] = await getProfessionalAvailabilityRange(
    professionalId,
    [date],
  );

  return availability;
}
