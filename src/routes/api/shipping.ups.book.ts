import { createFileRoute } from "@tanstack/react-router";

import { requireApiAuth } from "@/lib/security/require-api-auth.server";

/**
 * Carrier booking stays offline until each request is tied to a shipment
 * the caller already owns. The current AWB screen books before the shipment
 * row exists, so the external call cannot be proven safe yet.
 */
async function disabledCarrierBooking(request: Request): Promise<Response> {
  const auth = await requireApiAuth(request, {
    anyOf: [{ slug: "txn.awb-entry", action: "modify" }],
    limit: 20,
  });
  if (auth instanceof Response) return auth;
  return Response.json(
    {
      success: false,
      message:
        "Carrier booking is temporarily disabled until each booking is tied to an authorized user and a shipment owned by their tenant.",
      apiStatus: "CARRIER_BOOKING_DISABLED",
      documents: [],
      noResponse: false,
    },
    { status: 503 },
  );
}

export const Route = createFileRoute("/api/shipping/ups/book")({
  server: {
    handlers: {
      POST: async ({ request }) => disabledCarrierBooking(request),
    },
  },
});
