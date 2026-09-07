import "server-only";

import { createClient } from "@/lib/supabase/server";

const BUSINESS_ID = 1;

type BusinessSettingsRow = {
  booking_enabled: boolean;
  timezone: string;
  max_booking_days_ahead: number;
};

export type PublicBookingSettings = {
  bookingEnabled: boolean;
  timeZone: string;
  maxBookingDaysAhead: number;
};

export async function getPublicBookingSettings(): Promise<PublicBookingSettings> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("business_settings")
    .select("booking_enabled,timezone,max_booking_days_ahead")
    .eq("business_id", BUSINESS_ID)
    .maybeSingle<BusinessSettingsRow>();

  if (error) {
    throw new Error("No se ha podido leer la configuración de reservas.", {
      cause: error,
    });
  }

  if (!data) {
    throw new Error("Haircut Style no tiene configuración de reservas.");
  }

  if (
    !Number.isInteger(data.max_booking_days_ahead) ||
    data.max_booking_days_ahead < 0
  ) {
    throw new Error("max_booking_days_ahead no contiene un valor válido.");
  }

  return {
    bookingEnabled: data.booking_enabled,
    timeZone: data.timezone,
    maxBookingDaysAhead: data.max_booking_days_ahead,
  };
}
