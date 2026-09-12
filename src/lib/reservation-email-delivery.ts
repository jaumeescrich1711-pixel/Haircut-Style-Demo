import "server-only";

import {
  deliverReservationCancellationEmail,
  deliverReservationConfirmationEmail,
  type ReservationEmailContext,
} from "@/lib/reservation-email";
import {
  recordReservationCancellationEmailResult,
  recordReservationEmailResult,
} from "@/lib/reservations";
import {
  sendReservationCancellationWithResend,
  sendReservationConfirmationWithResend,
} from "@/lib/resend";

export async function attemptReservationConfirmationEmail(
  context: ReservationEmailContext,
) {
  return deliverReservationConfirmationEmail(context, {
    send: sendReservationConfirmationWithResend,
    record: async (reservation, result) => {
      await recordReservationEmailResult({
        reservationId: reservation.reservationId,
        emailLogId: reservation.emailLogId,
        deliveryToken: reservation.deliveryToken,
        ...result,
      });
    },
  });
}

export async function attemptReservationCancellationEmail(
  context: ReservationEmailContext,
) {
  return deliverReservationCancellationEmail(context, {
    send: sendReservationCancellationWithResend,
    record: async (reservation, result) => {
      await recordReservationCancellationEmailResult({
        reservationId: reservation.reservationId,
        emailLogId: reservation.emailLogId,
        deliveryToken: reservation.deliveryToken,
        ...result,
      });
    },
  });
}
