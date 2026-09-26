import { createFileRoute } from "@tanstack/react-router";

import { parseUserWrite } from "@/lib/security/account-rules";
import { clientAddress } from "@/lib/security/rate-limit";
import { asInet } from "@/lib/security/auth-server.server";
import { requireApiAuth } from "@/lib/security/require-api-auth.server";
import {
  createManagedUser,
  deactivateManagedUser,
  listManagedUsers,
  listUserLookups,
  reactivateManagedUser,
  resendManagedAccess,
  softDeleteManagedUser,
  updateManagedUser,
} from "@/lib/security/user-admin.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request, { anyOf: [{ slug: "utl.user-setup", action: "list" }, { slug: "utl.user-setup", action: "search" }] });
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        if (url.searchParams.get("lookups") === "1") {
          const lookups = await listUserLookups(auth.tenantId);
          return Response.json(lookups);
        }
        const users = await listManagedUsers(auth.tenantId, (url.searchParams.get("search") ?? "").trim());
        return Response.json({ users });
      },
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Enter the user details" }, { status: 400 });
        }
        const action = String(body.action ?? "");
        if (action === "deactivate" || action === "reactivate" || action === "delete" || action === "invite") {
          const permission = action === "delete" ? "delete" : "modify";
          const auth = await requireApiAuth(request, { anyOf: [{ slug: "utl.user-setup", action: permission }] });
          if (auth instanceof Response) return auth;
          const userId = String(body.userId ?? "");
          if (!UUID_RE.test(userId)) return Response.json({ error: "User was not found" }, { status: 404 });
          const ip = asInet(clientAddress(request));
          const result = action === "deactivate"
            ? await deactivateManagedUser(auth.tenantId, auth.userId, userId, ip)
            : action === "reactivate"
              ? await reactivateManagedUser(auth.tenantId, auth.userId, userId, ip)
              : action === "delete"
                ? await softDeleteManagedUser(auth.tenantId, auth.userId, userId, ip)
                : await resendManagedAccess({
                    tenantId: auth.tenantId,
                    actorId: auth.userId,
                    userId,
                    origin: new URL(request.url).origin,
                    ip,
                  });
          if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result);
        }

        const auth = await requireApiAuth(request, { anyOf: [{ slug: "utl.user-setup", action: "add" }] });
        if (auth instanceof Response) return auth;
        const parsed = parseUserWrite(body);
        if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
        const result = await createManagedUser({
          tenantId: auth.tenantId,
          actorId: auth.userId,
          input: parsed.value,
          origin: new URL(request.url).origin,
          ip: asInet(clientAddress(request)),
        });
        if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
        return Response.json(result, { status: 201 });
      },
      PATCH: async ({ request }) => {
        const auth = await requireApiAuth(request, { anyOf: [{ slug: "utl.user-setup", action: "modify" }] });
        if (auth instanceof Response) return auth;
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Enter the user details" }, { status: 400 });
        }
        const userId = String(body.userId ?? "");
        if (!UUID_RE.test(userId)) return Response.json({ error: "User was not found" }, { status: 404 });
        const parsed = parseUserWrite(body);
        if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
        const result = await updateManagedUser({
          tenantId: auth.tenantId,
          actorId: auth.userId,
          userId,
          input: parsed.value,
          ip: asInet(clientAddress(request)),
        });
        if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
        return Response.json(result);
      },
    },
  },
});
