import { createFileRoute } from "@tanstack/react-router";

import { deleteGoTrueSessions } from "@/lib/security/auth-server.server";
import { requireApiAuth } from "@/lib/security/require-api-auth.server";

export const Route = createFileRoute("/api/auth/force-logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request, {
          anyOf: [{ slug: "utl.loggedin-users", action: "modify" }],
          limit: 30,
        });
        if (auth instanceof Response) return auth;

        let body: { sessionId?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Session id is required" }, { status: 400 });
        }
        const sessionId = (body.sessionId ?? "").trim();
        if (!sessionId) return Response.json({ error: "Session id is required" }, { status: 400 });

        const { error } = await auth.supabase.rpc("revoke_session", { p_session_id: sessionId });
        if (error) return Response.json({ error: "Not permitted to force logoff" }, { status: 403 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as unknown as {
          from: (table: string) => {
            select: (cols: string) => {
              eq: (col: string, value: string) => {
                eq: (col: string, value: string) => {
                  maybeSingle: () => Promise<{ data: { auth_user_id?: string; auth_session_id?: string | null } | null }>;
                };
              };
            };
          };
        };
        const { data: row } = await db
          .from("sessions")
          .select("auth_user_id, auth_session_id")
          .eq("id", sessionId)
          .eq("tenant_id", auth.tenantId)
          .maybeSingle();

        if (row?.auth_user_id) {
          await deleteGoTrueSessions(
            String(row.auth_user_id),
            row.auth_session_id ? String(row.auth_session_id) : null,
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
