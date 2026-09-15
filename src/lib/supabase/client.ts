"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./config";

let browserClient: SupabaseClient | undefined;

export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig();

  browserClient ??= createBrowserClient(url, publishableKey);

  return browserClient;
}
