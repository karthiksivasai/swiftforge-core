import { createFileRoute } from "@tanstack/react-router";

import { consumePasswordReset } from "@/lib/security/auth-server.server";
import { requirePublicRateLimit } from "@/lib/security/require-api-auth.server";

export const Route = createFileRoute("/api/auth/reset-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = requirePublicRateLimit(request, "auth-reset", 8, 60_000);
        if (limited) return limited;

        let body: { token?: string; password?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Reset link is invalid or has expired" }, { status: 400 });
        }

        const token = (body.token ?? "").trim();
        const password = body.password ?? "";
        if (!token || !password) {
          return Response.json({ error: "Reset link is invalid or has expired" }, { status: 400 });
        }

        const result = await consumePasswordReset(token, password);
        if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
        return Response.json({ ok: true, message: "Password updated. Sign in with the new password." });
      },
    },
  },
});
