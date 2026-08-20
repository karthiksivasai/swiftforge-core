import { createFileRoute } from "@tanstack/react-router";

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
        const url = new URL(request.url);
        const userIdParam = url.searchParams.get("userId")?.trim() || "";
        const branchParam = url.searchParams.get("branch")?.trim() || "";

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const db = supabaseAdmin as any;

          let awbUserId: string | null = null;
          let podUserId: string | null = null;
          let branchId: string | null = null;

          // 1. Resolve User
          if (userIdParam) {
            const { data: userRow } = await db
              .from("users")
              .select("id, username, home_branch_id, full_name")
              .or(`id.eq.${userIdParam},username.ilike.${userIdParam}`)
              .maybeSingle();

            if (userRow) {
              awbUserId = (userRow.username || userRow.full_name || userIdParam).toUpperCase();
              branchId = userRow.home_branch_id || null;
            } else {
              awbUserId = userIdParam.toUpperCase();
            }
          }

          if (!awbUserId) {
            // Fallback to latest admin / active user if no specific userId provided
            const { data: firstUser } = await db
              .from("users")
              .select("id, username, home_branch_id, full_name")
              .eq("status", "ACTIVE")
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();

            if (firstUser) {
              awbUserId = (firstUser.username || firstUser.full_name || "ADMINISTRATOR").toUpperCase();
              if (!branchId) branchId = firstUser.home_branch_id || null;
            } else {
              awbUserId = "ADMINISTRATOR";
            }
          }

          // 2. Resolve Branch Stock
          let limit: number | null = null;
          let used: number | null = null;
          let balance: number | null = null;

          try {
            const { data: stockData, error: stockErr } = await db.rpc(
              "get_branch_awb_stock_summary",
              { p_branch_id: branchId || null },
            );

            if (!stockErr && stockData) {
              const stockObj = stockData as unknown as { limit?: number; used?: number; balance?: number };
              limit = typeof stockObj.limit === "number" ? stockObj.limit : 50000;
              used = typeof stockObj.used === "number" ? stockObj.used : 0;
              balance = limit - used;
            }
          } catch {
            // fallback
          }

          if (limit === null) {
            limit = 50000;
            // Count shipments for used stock count
            const { count } = await db
              .from("shipments")
              .select("*", { count: "exact", head: true });
            used = typeof count === "number" ? count : 0;
            balance = limit - (used ?? 0);
          }

          // 3. Operational Counts & Details
          let manifestNo = "0";
          let manifestDate: string | null = null;
          let invoiceNo: string | null = null;
          let debitNoteNo = "0";
          let creditNoteNo = "0";
          let flightNo: string | null = null;

          // Manifest count
          const { count: manifestCount } = await db
            .from("manifests")
            .select("*", { count: "exact", head: true });
          manifestNo = String(manifestCount ?? 0);

          return Response.json({
            awbUserId,
            podUserId,
            limit,
            used,
            balance,
            manifestNo,
            manifestDate,
            invoiceNo,
            debitNoteNo,
            creditNoteNo,
            flightNo,
          } satisfies AwbEntryStatusResponse);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Internal Server Error";
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
