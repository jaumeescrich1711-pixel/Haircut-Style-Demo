import { redirect } from "next/navigation";

import { getPanelIdentity } from "@/lib/auth/business-access";
import { getMyCalendarMonth } from "@/lib/auth/calendar-reservations";
import { getMyTodayReservations } from "@/lib/auth/today-reservations";

import { PanelShell } from "./panel-shell";

export const dynamic = "force-dynamic";

export default async function PanelPage() {
  const identity = await getPanelIdentity();

  if (!identity.authenticated) {
    redirect("/login");
  }

  if (!identity.access) {
    redirect("/login?error=unauthorized");
  }

  const [today, calendar] = await Promise.all([
    getMyTodayReservations(),
    getMyCalendarMonth(),
  ]);

  return (
    <PanelShell
      businessName={identity.access.business_name}
      initialCalendar={calendar}
      role={identity.access.role ?? "equipo"}
      reservations={today.reservations}
      reservationsAvailable={today.ok}
      timeZone={today.timeZone}
    />
  );
}
