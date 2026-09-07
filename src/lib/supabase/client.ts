"use client";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "./config";

let browserClient: SupabaseClient | undefined;

export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig();

  browserClient ??= createSupabaseClient(url, publishableKey);

  return browserClient;
}
