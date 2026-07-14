/**
 * Server-only Supabase client (service-role / secret key).
 *
 * WARNING: this client BYPASSES Row Level Security. It must only be used in
 * trusted server contexts (provisioning, webhooks, cron, admin tasks) and must
 * NEVER be imported at the module scope of a route or `*.functions.ts` file —
 * always `await import()` it inside the handler (see docs/PROJECT_RULES.md §5).
 *
 * For normal authenticated user requests, use a request-scoped client bound to
 * the caller's JWT instead (added in Phase 2), so RLS stays in force.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv(name: string): string | undefined {
  // process.env on the server runtime; guarded for isomorphic safety.
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

/**
 * Create the admin (service-role) client. Throws if secrets are missing so we
 * never silently fall back to an unprivileged client on the server.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = readEnv("VITE_SUPABASE_URL") ?? readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "[supabase.server] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "These must be set in the server environment (never in browser code).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
