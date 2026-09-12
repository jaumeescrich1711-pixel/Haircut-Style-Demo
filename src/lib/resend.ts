import "server-only";

import {
  buildReservationCancellationEmail,
  buildReservationConfirmationEmail,
  type ReservationEmailContext,
} from "@/lib/reservation-email";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

type ResendResponse = {
  id?: unknown;
  message?: unknown;
  name?: unknown;
};

function getRequiredServerVariable(name: "RESEND_API_KEY" | "RESEND_FROM_EMAIL") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} no está configurada en el servidor.`);
  }

  return value;
}

function getResendErrorMessage(status: number, payload: ResendResponse | null) {
  const detail =
    typeof payload?.name === "string"
      ? payload.name
      : typeof payload?.message === "string"
        ? payload.message
        : "respuesta no válida";

  return `Resend respondió con HTTP ${status}: ${detail}`;
}

async function sendWithResend(
  context: ReservationEmailContext,
  email: { subject: string; html: string; text: string },
  idempotencyKey: string,
) {
  const apiKey = getRequiredServerVariable("RESEND_API_KEY");
  const from = getRequiredServerVariable("RESEND_FROM_EMAIL");
  const response = await fetch(RESEND_EMAILS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [context.clientEmail],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  let payload: ResendResponse | null = null;

  try {
    payload = (await response.json()) as ResendResponse;
  } catch {
    // La respuesta HTTP sigue determinando el resultado aunque no contenga JSON.
  }

  if (!response.ok) {
    throw new Error(getResendErrorMessage(response.status, payload));
  }

  if (typeof payload?.id !== "string" || !payload.id.trim()) {
    throw new Error("Resend no devolvió un identificador de envío válido.");
  }

  return payload.id;
}

export async function sendReservationConfirmationWithResend(
  context: ReservationEmailContext,
) {
  return sendWithResend(
    context,
    buildReservationConfirmationEmail(context),
    `reservation-confirmation/${context.reservationId}`,
  );
}

export async function sendReservationCancellationWithResend(
  context: ReservationEmailContext,
) {
  return sendWithResend(
    context,
    buildReservationCancellationEmail(context),
    `reservation-cancellation/${context.reservationId}`,
  );
}
