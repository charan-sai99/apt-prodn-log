"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Browser client — publishable key only; session lives in HTTP cookies. */
export function createClient() {
  if (!client) {
    const { url, key } = getPublicSupabaseEnv();
    client = createBrowserClient(url, key);
  }
  return client;
}
