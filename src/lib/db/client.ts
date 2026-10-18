import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** True when Supabase credentials are present in the environment. */
export function hasDatabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/**
 * Server-only Supabase client using the secret key. Row level security is on with no policies,
 * so this client is the only way in. Never import this from a client component.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured. Fill in SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.");
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const PHOTO_BUCKET = "photos";
