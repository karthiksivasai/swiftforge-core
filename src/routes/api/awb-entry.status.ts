import { createFileRoute } from "@tanstack/react-router";

import { requireApiAuth } from "@/lib/security/require-api-auth.server";

export type AwbEntryStatusResponse = {
  awbUserId: string | null;
  podUserId: string | null;
  limit: number | null;
  used: number | null;
  balance: number | null;
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
          const branchId = auth.homeBranchId;

          let limit: number | null = null;
          let used: number | null = null;
          let balance: number | null = null;

          const { data: stockData, error: stockErr } = await db.rpc("get_branch_awb_stock_summary", {
            p_branch_id: branchId,
          });
          if (!stockErr && stockData && typeof stockData === "object") {
            const stockObj = stockData as { limit?: number; used?: number; balance?: number };
            limit = typeof stockObj.limit === "number" ? stockObj.limit : null;
            used = typeof stockObj.used === "number" ? stockObj.used : null;
            if (limit != null && used != null) balance = limit - used;
          }

          if (limit == null) {
            const { count } = await db
              .from("shipments")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", auth.tenantId);
            limit = 50000;
            used = typeof count === "number" ? count : 0;
            balance = limit - used;
          }

          const { count: manifestCount } = await db
            .from("manifests")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", auth.tenantId);

          return Response.json({
            awbUserId,
            podUserId: null,
            limit,
            used,
            balance,
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
