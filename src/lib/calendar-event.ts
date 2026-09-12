import type { ManagedReservation } from "@/lib/reservations";

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatUtc(datetime: string) {
  const date = new Date(datetime);

  if (Number.isNaN(date.getTime())) {
    throw new Error("La cita no contiene una fecha válida.");
  }

  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(line: string) {
  const folded: string[] = [];
  let current = "";

  for (const character of line) {
    const candidate = current + character;

    if (Buffer.byteLength(candidate, "utf8") > 73) {
      folded.push(current);
      current = ` ${character}`;
    } else {
      current = candidate;
    }
  }

  folded.push(current);
  return folded.join("\r\n");
}

export function buildReservationCalendarEvent(
  reservation: ManagedReservation,
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Haircut Style//Reservas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:reservation-${reservation.id}@haircut-style`,
    `DTSTAMP:${formatUtc(new Date().toISOString())}`,
    `DTSTART:${formatUtc(reservation.startDatetime)}`,
    `DTEND:${formatUtc(reservation.endDatetime)}`,
    `SUMMARY:${escapeCalendarText(`${reservation.businessName} — ${reservation.serviceName}`)}`,
    `DESCRIPTION:${escapeCalendarText(`Servicio: ${reservation.serviceName}\nProfesional: ${reservation.professionalName}`)}`,
    `LOCATION:${escapeCalendarText(reservation.businessAddress)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
