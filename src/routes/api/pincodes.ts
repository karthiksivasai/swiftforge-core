import { createFileRoute } from "@tanstack/react-router";

import { getPincodesByPrefix, parsePincodeApiQuery } from "@/lib/pincodes/pincode.controller";

export const Route = createFileRoute("/api/pincodes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const query = parsePincodeApiQuery(url);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const prefix = (query.prefix ?? "").trim();
          if (prefix.length < 3) {
            return Response.json([]);
          }

          const { data, error } = await supabaseAdmin.rpc("search_postal_pincodes", {
            p_prefix: prefix,
            p_country_code: (query.countryCode ?? "IN").trim() || "IN",
            p_limit: Math.min(Math.max(query.limit ?? 15, 1), 100),
          });

          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }

          return Response.json(data ?? []);
        } catch (error) {
          const rows = await getPincodesByPrefix(query, { live: false });
          return Response.json(rows);
        }
      },
    },
  },
});
