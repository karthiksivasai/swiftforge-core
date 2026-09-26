import { createFileRoute } from "@tanstack/react-router";

import { applicationAllows, normalizeEmail } from "@/lib/security/account-rules";
import {
  asInet,
  authEmailForUser,
  findUserByEmail,
  findUserByUsername,
  loginLocked,
  recordLoginAsUser,
  signInWithPassword,
  writeLoginLog,
} from "@/lib/security/auth-server.server";
import { clientAddress } from "@/lib/security/rate-limit";
import { requirePublicRateLimit } from "@/lib/security/require-api-auth.server";

const GENERIC = { error: "Invalid username or password" };

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = requirePublicRateLimit(request, "auth-login", 10, 60_000);
        if (limited) return limited;

        let body: { username?: string; email?: string; password?: string; channel?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(GENERIC, { status: 401 });
        }

        const username = typeof body.username === "string" ? body.username.trim() : "";
        const email = normalizeEmail(body.email ?? "");
        const password = body.password ?? "";
        const channel = body.channel === "MOBILE" ? "MOBILE" : "WEB";
        if ((!username && !email) || !password) return Response.json(GENERIC, { status: 401 });

        const ip = clientAddress(request);
        const userAgent = request.headers.get("user-agent");
        let account = null;
        try {
          account = username ? await findUserByUsername(username) : await findUserByEmail(email);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("Missing Supabase environment variable")) {
            return Response.json({ error: "Server auth is not configured" }, { status: 500 });
          }
          return Response.json(GENERIC, { status: 401 });
        }
        if (!account || account.status !== "ACTIVE" || account.deletedAt || !account.authUserId) {
          if (account) {
            await writeLoginLog({
              tenantId: account.tenantId,
              userId: account.userId,
              username: account.username,
              event: "LOGIN_FAILED",
              ip,
              userAgent,
              detail: account.deletedAt ? "deleted" : "inactive",
            }).catch(() => undefined);
          }
          return Response.json(GENERIC, { status: 401 });
        }

        if (!applicationAllows(account.applicationType, channel)) {
          return Response.json(GENERIC, { status: 401 });
        }

        if (await loginLocked(account.tenantId, account.username).catch(() => false)) {
          await writeLoginLog({
            tenantId: account.tenantId,
            userId: account.userId,
            username: account.username,
            event: "LOGIN_FAILED",
            ip,
            userAgent,
            detail: "locked",
          }).catch(() => undefined);
          return Response.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
        }

        const authEmail = await authEmailForUser(account.authUserId);
        if (!authEmail) return Response.json(GENERIC, { status: 401 });
        const signedIn = await signInWithPassword(authEmail, password);
        if ("error" in signedIn) {
          await writeLoginLog({
            tenantId: account.tenantId,
            userId: account.userId,
            username: account.username,
            event: "LOGIN_FAILED",
            ip,
            userAgent,
          }).catch(() => undefined);
          return Response.json(GENERIC, { status: 401 });
        }

        const sessionId = await recordLoginAsUser(signedIn.accessToken, userAgent, asInet(ip)).catch(() => null);
        await writeLoginLog({
          tenantId: account.tenantId,
          userId: account.userId,
          username: account.username,
          event: "LOGIN_SUCCESS",
          ip,
          userAgent,
          detail: "password",
        }).catch(() => undefined);

        return Response.json({
          access_token: signedIn.accessToken,
          refresh_token: signedIn.refreshToken,
          session_id: sessionId,
        });
      },
    },
  },
});
