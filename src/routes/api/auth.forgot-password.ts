import { createFileRoute } from "@tanstack/react-router";

import { normalizeEmail } from "@/lib/security/account-rules";
import {
  findUserByEmail,
  randomToken,
  sendResetEmail,
  sha256Hex,
  storePasswordReset,
} from "@/lib/security/auth-server.server";
import { requirePublicRateLimit } from "@/lib/security/require-api-auth.server";

const GENERIC = {
  ok: true,
  message: "If that account exists, password reset instructions have been sent.",
};

export const Route = createFileRoute("/api/auth/forgot-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = requirePublicRateLimit(request, "auth-forgot", 5, 60_000);
        if (limited) return limited;

        let body: { email?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(GENERIC);
        }

        const email = normalizeEmail(body.email ?? "");
        if (!email) return Response.json(GENERIC);

        const account = await findUserByEmail(email).catch(() => null);
        if (!account || account.status !== "ACTIVE" || account.deletedAt || !account.authUserId || !account.email) {
          return Response.json(GENERIC);
        }

        const token = randomToken();
        await storePasswordReset(account.userId, account.tenantId, await sha256Hex(token)).catch(() => undefined);
        await sendResetEmail(account.email, token, new URL(request.url).origin).catch(() => undefined);
        return Response.json(GENERIC);
      },
    },
  },
});
