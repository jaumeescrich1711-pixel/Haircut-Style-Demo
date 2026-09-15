import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type LoginRequest = {
  email?: unknown;
  password?: unknown;
};

type CookieToSet = {
  name: string;
  value: string;
  options: Parameters<NextResponse["cookies"]["set"]>[2];
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cookiesToSet: CookieToSet[],
  authHeaders: Record<string, string>,
) {
  const response = NextResponse.json(body, { status });

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(authHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { ok: false, message: "Origen de la petición no permitido." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let payload: LoginRequest;

  try {
    payload = (await request.json()) as LoginRequest;
  } catch {
    return NextResponse.json(
      { ok: false, message: "La petición no contiene JSON válido." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (
    typeof payload.email !== "string" ||
    typeof payload.password !== "string" ||
    !payload.email.trim() ||
    !payload.password
  ) {
    return NextResponse.json(
      { ok: false, code: "invalid_credentials" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const cookiesToSet: CookieToSet[] = [];
  const authHeaders: Record<string, string> = {};
  const { url, publishableKey } = getSupabasePublicConfig();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies, headers) {
        cookiesToSet.splice(0, cookiesToSet.length, ...nextCookies);
        Object.assign(authHeaders, headers);
      },
    },
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: payload.email.trim(),
    password: payload.password,
  });

  if (signInError) {
    return jsonResponse(
      { ok: false, code: "invalid_credentials" },
      401,
      cookiesToSet,
      authHeaders,
    );
  }

  const { data: access, error: accessError } = await supabase.rpc(
    "get_my_business_access",
  );
  const businessAccess = Array.isArray(access) ? access[0] : null;

  if (
    accessError ||
    !Array.isArray(access) ||
    access.length !== 1 ||
    Number(businessAccess?.business_id) !== 1
  ) {
    await supabase.auth.signOut();
    return jsonResponse(
      { ok: false, code: "unauthorized" },
      403,
      cookiesToSet,
      authHeaders,
    );
  }

  return jsonResponse({ ok: true }, 200, cookiesToSet, authHeaders);
}
