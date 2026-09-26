import { createFileRoute } from "@tanstack/react-router";

import { getPincodesByPrefix, parsePincodeApiQuery } from "@/lib/pincodes/pincode.controller";
import { requireApiAuth } from "@/lib/security/require-api-auth.server";

export const Route = createFileRoute("/api/pincodes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireApiAuth(request, {
          anyOf: [
            { slug: "txn.awb-entry", action: "search" },
            { slug: "mst.pincode-master", action: "search" },
            { slug: "mst.country-pincodes", action: "search" },
          ],
        });
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const query = parsePincodeApiQuery(url);
        const prefix = (query.prefix ?? "").trim();
        if (prefix.length < 3) return Response.json([]);

        const countryCode = (query.countryCode ?? "IN").trim() || "IN";
        const limit = Math.min(Math.max(query.limit ?? 15, 1), 100);

        const { data, error } = await auth.supabase.rpc("search_postal_pincodes", {
          p_prefix: prefix,
          p_country_code: countryCode,
          p_limit: limit,
        });
        if (error) {
          const rows = await getPincodesByPrefix(query, { live: false });
          return Response.json(rows);
        }
        return Response.json(data ?? []);
      },
    },
  },
});
