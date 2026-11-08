import { createFileRoute } from "@tanstack/react-router";

import { loadVendorTariffs } from "@/lib/rating/pricingCatalog.server";
import { readPricingBody, type PricingRequestBody } from "@/lib/rating/pricingRequest";
import { compareVendorRates } from "@/lib/rating/vendorTariff";
import { requireApiAuth } from "@/lib/security/require-api-auth.server";

export const Route = createFileRoute("/api/shipments/rate-compare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request, {
          anyOf: [{ slug: "txn.awb-entry", action: "search" }],
        });
        if (auth instanceof Response) return auth;

        try {
          const body = (await request.json()) as PricingRequestBody;
          const { chargeableWeight, quote } = readPricingBody(body);
          if (chargeableWeight <= 0) {
            return Response.json(
              { error: "INVALID_INPUT", message: "Add the shipment weight before comparing rates" },
              { status: 422 },
            );
          }

          const tariffs = await loadVendorTariffs(auth.supabase, auth.tenantId);
          const rows = compareVendorRates(tariffs, quote);
          return Response.json({ rows }, { status: 200 });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: "SERVER_ERROR", message }, { status: 500 });
        }
      },
    },
  },
});
