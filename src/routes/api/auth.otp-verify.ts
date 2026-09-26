import { createFileRoute } from "@tanstack/react-router";

import { requirePublicRateLimit } from "@/lib/security/require-api-auth.server";

// Temporary: email codes stay off until the Resend sender domain is verified.
export const Route = createFileRoute("/api/auth/otp-verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = requirePublicRateLimit(request, "auth-otp-verify", 12, 10 * 60_000);
        if (limited) return limited;
        return Response.json({ error: "Email sign-in codes are turned off during testing." }, { status: 503 });
      },
    },
  },
});
