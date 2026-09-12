export const RESERVATION_CONFIRMATION_SUBJECT =
  "Reserva confirmada — Haircut Style ✅";
export const RESERVATION_CANCELLATION_SUBJECT =
  "Cita cancelada — Haircut Style";

export type ReservationEmailContext = {
  reservationId: number;
  emailLogId: number;
  deliveryToken: string;
  clientName: string;
  clientEmail: string;
  serviceName: string;
  professionalName: string;
  startDatetime: string;
  endDatetime: string;
  businessName: string;
  businessAddress: string;
  businessTimezone: string;
  calendarUrl: string;
  cancellationUrl: string;
  bookingUrl?: string;
};

export type ReservationEmailRecord =
  | {
      status: "sent";
      providerMessageId: string;
      errorMessage: null;
    }
  | {
      status: "error";
      providerMessageId: null;
      errorMessage: string;
    };

export type ReservationEmailDeliveryResult = {
  status: "sent" | "error";
  providerMessageId: string | null;
  recorded: boolean;
};

type ReservationEmailDeliveryDependencies = {
  send: (context: ReservationEmailContext) => Promise<string>;
  record: (
    context: ReservationEmailContext,
    result: ReservationEmailRecord,
  ) => Promise<void>;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatReservationDate(context: ReservationEmailContext) {
  const start = new Date(context.startDatetime);

  if (Number.isNaN(start.getTime())) {
    throw new Error("La reserva no contiene una fecha válida.");
  }

  return capitalize(
    new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: context.businessTimezone,
    }).format(start),
  );
}

function formatReservationTime(datetime: string, timeZone: string) {
  const value = new Date(datetime);

  if (Number.isNaN(value.getTime())) {
    throw new Error("La reserva no contiene una hora válida.");
  }

  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(value);
}

export function buildReservationConfirmationEmail(
  context: ReservationEmailContext,
) {
  const date = formatReservationDate(context);
  const start = formatReservationTime(
    context.startDatetime,
    context.businessTimezone,
  );
  const end = formatReservationTime(
    context.endDatetime,
    context.businessTimezone,
  );
  const clientName = escapeHtml(context.clientName);
  const serviceName = escapeHtml(context.serviceName);
  const professionalName = escapeHtml(context.professionalName);
  const businessName = escapeHtml(context.businessName);
  const businessAddress = escapeHtml(context.businessAddress);
  const calendarUrl = escapeHtml(context.calendarUrl);
  const cancellationUrl = escapeHtml(context.cancellationUrl);

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #3a342b;color:#b9ab98;font-family:Arial,sans-serif;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;">${label}</td>
      <td style="padding:12px 0;border-bottom:1px solid #3a342b;color:#f5efe5;font-family:Georgia,serif;font-size:16px;text-align:right;">${value}</td>
    </tr>`;

  const html = `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;background:#0f0f0f;padding:32px 12px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#171614;border:1px solid #3a342b;">
          <tr>
            <td style="padding:34px 36px 24px;border-bottom:1px solid #3a342b;">
              <div style="color:#c8a15a;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${businessName}</div>
              <h1 style="margin:12px 0 0;color:#f5efe5;font-family:Georgia,serif;font-size:34px;font-weight:400;line-height:1.15;">Reserva confirmada</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 36px 36px;">
              <p style="margin:0 0 12px;color:#f5efe5;font-family:Georgia,serif;font-size:20px;line-height:1.5;">Hola, ${clientName}.</p>
              <p style="margin:0 0 24px;color:#c8bfb3;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;">Tu cita está reservada. Estos son los datos confirmados:</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${detailRow("Servicio", serviceName)}
                ${detailRow("Profesional", professionalName)}
                ${detailRow("Fecha", escapeHtml(date))}
                ${detailRow("Inicio", escapeHtml(start))}
                ${detailRow("Finalización", escapeHtml(end))}
                ${detailRow("Ubicación", businessAddress)}
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                <tr>
                  <td style="padding:0 0 12px;">
                    <a href="${calendarUrl}" style="display:block;padding:15px 18px;background:#c8a15a;color:#101010;font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:1.5px;text-align:center;text-decoration:none;">AÑADIR AL CALENDARIO</a>
                  </td>
                </tr>
                <tr>
                  <td>
                    <a href="${cancellationUrl}" style="display:block;padding:14px 18px;border:1px solid #65543a;color:#e6d8bf;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.3px;text-align:center;text-decoration:none;">CANCELAR MI CITA</a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;color:#81776b;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;">Este email confirma una reserva creada correctamente en ${businessName}.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hola, ${context.clientName}.`,
    "",
    "Tu cita está reservada.",
    `Servicio: ${context.serviceName}`,
    `Profesional: ${context.professionalName}`,
    `Fecha: ${date}`,
    `Inicio: ${start}`,
    `Finalización: ${end}`,
    `Ubicación: ${context.businessAddress}`,
    "",
    `Añadir al calendario: ${context.calendarUrl}`,
    `Cancelar mi cita: ${context.cancellationUrl}`,
  ].join("\n");

  return {
    subject: RESERVATION_CONFIRMATION_SUBJECT,
    html,
    text,
  };
}

export function buildReservationCancellationEmail(
  context: ReservationEmailContext,
) {
  if (!context.bookingUrl) {
    throw new Error("La URL para reservar otra cita no está configurada.");
  }

  const date = formatReservationDate(context);
  const start = formatReservationTime(
    context.startDatetime,
    context.businessTimezone,
  );
  const clientName = escapeHtml(context.clientName);
  const serviceName = escapeHtml(context.serviceName);
  const professionalName = escapeHtml(context.professionalName);
  const businessName = escapeHtml(context.businessName);
  const bookingUrl = escapeHtml(context.bookingUrl);

  const detailRow = (label: string, value: string) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #3a342b;color:#b9ab98;font-family:Arial,sans-serif;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;">${label}</td>
      <td style="padding:12px 0;border-bottom:1px solid #3a342b;color:#f5efe5;font-family:Georgia,serif;font-size:16px;text-align:right;">${value}</td>
    </tr>`;

  const html = `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;background:#0f0f0f;padding:32px 12px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#171614;border:1px solid #3a342b;">
          <tr>
            <td style="padding:34px 36px 24px;border-bottom:1px solid #3a342b;">
              <div style="color:#c8a15a;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">${businessName}</div>
              <h1 style="margin:12px 0 0;color:#f5efe5;font-family:Georgia,serif;font-size:34px;font-weight:400;line-height:1.15;">Cita cancelada</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 36px 36px;">
              <p style="margin:0 0 12px;color:#f5efe5;font-family:Georgia,serif;font-size:20px;line-height:1.5;">Hola, ${clientName}.</p>
              <p style="margin:0 0 24px;color:#c8bfb3;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;">Tu cita ha sido cancelada correctamente. El horario vuelve a estar disponible.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${detailRow("Servicio", serviceName)}
                ${detailRow("Profesional", professionalName)}
                ${detailRow("Fecha", escapeHtml(date))}
                ${detailRow("Hora", escapeHtml(start))}
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                <tr><td>
                  <a href="${bookingUrl}" style="display:block;padding:15px 18px;background:#c8a15a;color:#101010;font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:1.5px;text-align:center;text-decoration:none;">RESERVAR OTRA CITA</a>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hola, ${context.clientName}.`,
    "",
    "Tu cita ha sido cancelada correctamente.",
    `Servicio: ${context.serviceName}`,
    `Profesional: ${context.professionalName}`,
    `Fecha: ${date}`,
    `Hora: ${start}`,
    "",
    `Reservar otra cita: ${context.bookingUrl}`,
  ].join("\n");

  return { subject: RESERVATION_CANCELLATION_SUBJECT, html, text };
}

export function getSafeEmailErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Error desconocido de email.";

  return message
    .replace(/re_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .slice(0, 1000);
}

export async function deliverReservationConfirmationEmail(
  context: ReservationEmailContext,
  dependencies: ReservationEmailDeliveryDependencies,
): Promise<ReservationEmailDeliveryResult> {
  try {
    const providerMessageId = await dependencies.send(context);

    try {
      await dependencies.record(context, {
        status: "sent",
        providerMessageId,
        errorMessage: null,
      });

      return { status: "sent", providerMessageId, recorded: true };
    } catch {
      return { status: "sent", providerMessageId, recorded: false };
    }
  } catch (error) {
    const errorMessage = getSafeEmailErrorMessage(error);

    try {
      await dependencies.record(context, {
        status: "error",
        providerMessageId: null,
        errorMessage,
      });

      return { status: "error", providerMessageId: null, recorded: true };
    } catch {
      return { status: "error", providerMessageId: null, recorded: false };
    }
  }
}

export async function deliverReservationCancellationEmail(
  context: ReservationEmailContext,
  dependencies: ReservationEmailDeliveryDependencies,
): Promise<ReservationEmailDeliveryResult> {
  return deliverReservationConfirmationEmail(context, dependencies);
}
