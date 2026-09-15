import type { NextRequest } from "next/server";

import { refreshAuthSession } from "@/lib/supabase/auth-proxy";

export async function proxy(request: NextRequest) {
  return refreshAuthSession(request);
}

export const config = {
  matcher: [
    "/panel/:path*",
    "/login",
    "/recuperar",
    "/restablecer",
    "/auth/callback",
  ],
};
