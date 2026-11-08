import { createFileRoute } from "@tanstack/react-router";

import { loadVendorTariffs } from "@/lib/rating/pricingCatalog.server";
import { readPricingBody, type PricingRequestBody } from "@/lib/rating/pricingRequest";
import { quoteSelectedVendor } from "@/lib/rating/vendorTariff";
import { requireApiAuth } from "@/lib/security/require-api-auth.server";

export const Route = createFileRoute("/api/shipments/vendor-rate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireApiAuth(request, {
          anyOf: [{ slug: "txn.awb-entry", action: "search" }],
        });
        if (auth instanceof Response) return auth;

        try {
          const body = (await request.json()) as PricingRequestBody;
          const vendorCode = (body.vendorCode || "").trim();
          if (!vendorCode) {
            return Response.json(
              { error: "INVALID_INPUT", message: "Select a vendor before calculating vendor charges" },
              { status: 422 },
            );
          }

          const { chargeableWeight, quote } = readPricingBody(body);
          if (chargeableWeight <= 0) {
            return Response.json(
              { error: "INVALID_INPUT", message: "Add the shipment weight before calculating vendor charges" },
              { status: 422 },
            );
          }

          const tariffs = await loadVendorTariffs(auth.supabase, auth.tenantId);
          const priced = quoteSelectedVendor(tariffs, { ...quote, vendorCode });
          if (!priced) {
            return Response.json(
              {
                error: "NO_VENDOR_RATE",
                message: `No vendor tariff for ${vendorCode} on this route and weight`,
              },
              { status: 422 },
            );
          }

          return Response.json(priced, { status: 200 });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json({ error: "SERVER_ERROR", message }, { status: 500 });
        }
      },
    },
  },
});
