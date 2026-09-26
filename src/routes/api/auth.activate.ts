import { createFileRoute } from "@tanstack/react-router";

import { requirePublicRateLimit } from "@/lib/security/require-api-auth.server";

// Temporary: activation links stay off until the Resend sender domain is verified.
export const Route = createFileRoute("/api/auth/activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = requirePublicRateLimit(request, "auth-activate", 8, 60_000);
        if (limited) return limited;
        return Response.json({ error: "Account activation by email is turned off during testing." }, { status: 503 });
      },
    },
  },
});
