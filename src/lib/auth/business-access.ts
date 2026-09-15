import "server-only";

import { createAuthServerClient } from "@/lib/supabase/auth-server";

export type BusinessAccess = {
  business_id: number;
  business_name: string;
  role: string | null;
};

export type PanelIdentity =
  | { authenticated: false; access: null }
  | { authenticated: true; access: BusinessAccess | null };

export async function getPanelIdentity(): Promise<PanelIdentity> {
  const supabase = await createAuthServerClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return { authenticated: false, access: null };
  }

  const { data, error } = await supabase.rpc("get_my_business_access");

  if (error || !Array.isArray(data) || data.length !== 1) {
    return { authenticated: true, access: null };
  }

  const access = data[0] as Partial<BusinessAccess>;

  if (
    Number(access.business_id) !== 1 ||
    typeof access.business_name !== "string"
  ) {
    return { authenticated: true, access: null };
  }

  return {
    authenticated: true,
    access: {
      business_id: Number(access.business_id),
      business_name: access.business_name,
      role: typeof access.role === "string" ? access.role : null,
    },
  };
}
