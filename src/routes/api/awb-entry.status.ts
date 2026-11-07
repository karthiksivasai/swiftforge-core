import { createFileRoute } from "@tanstack/react-router";

import { requireApiAuth } from "@/lib/security/require-api-auth.server";

export type AwbEntryStatusResponse = {
  awbUserId: string | null;
  podUserId: string | null;
  manifestNo: string;
  manifestDate: string | null;
  invoiceNo: string | null;
  debitNoteNo: string;
  creditNoteNo: string;
  flightNo: string | null;
};

export const Route = createFileRoute("/api/awb-entry/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request, {
          anyOf: [{ slug: "txn.awb-entry", action: "list" }],
        });
        if (auth instanceof Response) return auth;

        try {
          const db = auth.supabase;
          const awbUserId = (auth.username || "USER").toUpperCase();

          const { count: manifestCount } = await db
            .from("manifests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", auth.tenantId);

          return Response.json({
            awbUserId,
            podUserId: null,
            manifestNo: String(manifestCount ?? 0),
            manifestDate: null,
            invoiceNo: null,
            debitNoteNo: "0",
            creditNoteNo: "0",
            flightNo: null,
          } satisfies AwbEntryStatusResponse);
        } catch {
          return Response.json({ error: "Could not load AWB status" }, { status: 500 });
        }
      },
    },
  },
});
