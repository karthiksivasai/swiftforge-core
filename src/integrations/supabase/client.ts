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

const missing: string[] = [];
if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
if (!supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY");

if (missing.length > 0) {
  const message =
    `[supabase] Missing required environment variable(s): ${missing.join(", ")}. ` +
    `Set them in Lovable → Project Settings → Secrets (values must match your Supabase project). ` +
    `Refusing to fall back to http://localhost:54321.`;
  // Surface loudly so it's obvious in the preview console instead of silently
  // pointing auth requests at localhost.
  console.error(message);
  throw new Error(message);
}

export const supabase: SupabaseClient = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
