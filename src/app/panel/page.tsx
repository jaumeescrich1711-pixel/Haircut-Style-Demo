import { redirect } from "next/navigation";

import { getPanelIdentity } from "@/lib/auth/business-access";

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

  return (
    <PanelShell
      businessName={identity.access.business_name}
      role={identity.access.role ?? "equipo"}
    />
  );
}
