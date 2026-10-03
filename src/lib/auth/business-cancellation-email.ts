import "server-only";

import {
  recordBusinessCancellationEmailResult,
  type BusinessCancellationEmailDelivery,
} from "@/lib/auth/availability-blocks";
import {
  deliverReservationCancellationEmail,
  type ReservationEmailContext,
} from "@/lib/reservation-email";
import { sendBusinessReservationCancellationWithResend } from "@/lib/resend";

export async function attemptBusinessCancellationEmail(
  delivery: BusinessCancellationEmailDelivery,
  bookingUrl: string,
) {
  const context: ReservationEmailContext = {
    reservationId: delivery.reservationId,
    emailLogId: delivery.emailLogId,
    deliveryToken: delivery.deliveryToken,
    clientName: delivery.clientName,
    clientEmail: delivery.clientEmail,
    serviceName: delivery.serviceName,
    professionalName: delivery.professionalName,
    startDatetime: delivery.startDatetime,
    endDatetime: delivery.endDatetime,
    businessName: delivery.businessName,
    businessAddress: delivery.businessAddress,
    businessTimezone: delivery.businessTimezone,
    calendarUrl: "",
    cancellationUrl: "",
    bookingUrl,
    cancellationReason: delivery.cancellationReason,
  };

  return deliverReservationCancellationEmail(context, {
    send: sendBusinessReservationCancellationWithResend,
    record: async (_context, result) => {
      await recordBusinessCancellationEmailResult(delivery, result);
    },
  });
}
