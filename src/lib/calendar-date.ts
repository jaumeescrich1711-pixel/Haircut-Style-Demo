const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function buildUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseIsoDate(value: string) {
  const match = ISO_DATE_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = buildUtcDate(year, month, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, date };
}

export function parseIsoMonth(value: string) {
  const match = ISO_MONTH_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

export function formatIsoDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function formatIsoMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addDaysToIsoDate(value: string, days: number) {
  const parsed = parseIsoDate(value);

  if (!parsed) {
    throw new Error(`Fecha no válida: ${value}`);
  }

  parsed.date.setUTCDate(parsed.date.getUTCDate() + days);
  return formatIsoDate(parsed.date);
}

export function getIsoDayOfWeek(value: string) {
  const parsed = parseIsoDate(value);

  if (!parsed) {
    throw new Error(`Fecha no válida: ${value}`);
  }

  const day = parsed.date.getUTCDay();
  return day === 0 ? 7 : day;
}

export function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getTodayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}
