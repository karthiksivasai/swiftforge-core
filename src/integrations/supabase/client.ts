/**
 * Browser-safe Supabase client.
 *
 * Uses ONLY the anon (publishable) key and the public project URL, both exposed
 * through Vite's `VITE_` env prefix. This client is subject to Row Level
 * Security — it can never bypass tenant isolation. Never import the
 * service-role client (`client.server.ts`) into browser/route module scope.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev; keeps a clear signal until Phase 2 wires auth-driven usage.
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "Copy .env.example to .env and fill in your project values.",
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl ?? "http://localhost:54321",
  supabaseAnonKey ?? "public-anon-key-not-set",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
