import { createFileRoute } from "@tanstack/react-router";
import {
  calculatePieceWeights,
  computeShipmentRating,
  SEED_CUSTOMER_RATES,
  SEED_SERVICE_WEIGHT_RULES,
  validateServiceWeight,
  type CustomerRateRecord,
  type RateQueryInput,
  type ServiceWeightRuleRecord,
} from "@/lib/rating/ratingEngine";

export const Route = createFileRoute("/api/shipments/rate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Partial<RateQueryInput>;

          // Required field checks
          const customerCode = (body.customerCode || "").trim();
          const contractNo = (body.contractNo || "243792").trim();

          if (!customerCode) {
            return Response.json(
              { error: "INVALID_INPUT", message: "customerCode is required" },
              { status: 422 },
            );
          }

          const pieces = Array.isArray(body.pieces) ? body.pieces : [];
          if (pieces.length === 0) {
            return Response.json(
              { error: "INVALID_INPUT", message: "At least one piece row is required" },
              { status: 422 },
            );
          }

          const query: RateQueryInput = {
            customerCode,
            contractNo,
            productCode: body.productCode,
            vendorCode: body.vendorCode,
            serviceCode: body.serviceCode,
            serviceName: body.serviceName || body.serviceCode,
            originCode: body.originCode,
            destinationCode: body.destinationCode,
            zoneId: body.zoneId,
            bookDate: body.bookDate || new Date().toISOString().slice(0, 10),
            pieces,
            division: body.division || 5000,
            otherCharges: body.otherCharges || 0,
            customerBillingStateCode: body.customerBillingStateCode || "TELANGANA",
            branchStateCode: body.branchStateCode || "TELANGANA",
            gstPct: body.gstPct ?? 18,
            fuelPct: body.fuelPct ?? 0,
          };

          // Service weight rules lookup from DB or SEED
          let serviceRules: ServiceWeightRuleRecord[] = [...SEED_SERVICE_WEIGHT_RULES];
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: rulesData } = await supabaseAdmin
              .from("service_weight_rules")
              .select("*")
              .eq("status", "ACTIVE")
              .is("deleted_at", null);

            if (Array.isArray(rulesData) && rulesData.length > 0) {
              serviceRules = rulesData.map((r: Record<string, unknown>) => ({
                id: String(r.id),
                service_code: String(r.service_code || r.service_name || ""),
                service_name: String(r.service_name || r.service_code || ""),
                min_weight: Number(r.min_weight ?? 0),
                max_weight: Number(r.max_weight ?? 999),
                status: "ACTIVE",
              }));
            }
          } catch {
            serviceRules = [...SEED_SERVICE_WEIGHT_RULES];
          }

          // Pre-check service weight bounds BEFORE computing charges
          const { chargeableWeight } = calculatePieceWeights(query.pieces, query.division);
          const weightCheck = validateServiceWeight({
            serviceCode: query.serviceCode,
            serviceName: query.serviceName || query.serviceCode,
            chargeableWeight,
            rules: serviceRules,
          });

          if (!weightCheck.valid) {
            return Response.json(
              {
                error: weightCheck.message,
                code: "WEIGHT_OUT_OF_RANGE",
                min: weightCheck.min,
                max: weightCheck.max,
                serviceName: weightCheck.serviceName,
                message: weightCheck.message,
              },
              { status: 422 },
            );
          }

          // Database rate lookup with seed fallback
          let dbRates: CustomerRateRecord[] = [...SEED_CUSTOMER_RATES];
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("customer_rates")
              .select("*")
              .eq("status", "ACTIVE")
              .is("deleted_at", null);

            if (Array.isArray(data) && data.length > 0) {
              const mappedDb: CustomerRateRecord[] = data.map((r: Record<string, unknown>) => ({
                id: String(r.id),
                customer_code: String(r.customer_code || r.customer_id || "CKING"),
                contract_no: String(r.contract_no || "243792"),
                product_code: r.product_code ? String(r.product_code) : null,
                vendor_code: r.vendor_code ? String(r.vendor_code) : null,
                origin_code: r.origin_code ? String(r.origin_code) : null,
                destination_code: r.destination_code ? String(r.destination_code) : null,
                zone_id: r.zone_id ? String(r.zone_id) : null,
                weight_slab_from: r.weight_slab_from != null ? Number(r.weight_slab_from) : null,
                weight_slab_to: r.weight_slab_to != null ? Number(r.weight_slab_to) : null,
                rate_per_kg: Number(r.rate_per_kg ?? 0),
                status: "ACTIVE",
                from_date: String(r.from_date || "2020-01-01"),
                to_date: r.to_date ? String(r.to_date) : null,
              }));

              dbRates = [...mappedDb, ...SEED_CUSTOMER_RATES];
            }
          } catch {
            dbRates = [...SEED_CUSTOMER_RATES];
          }

          const result = computeShipmentRating(query, dbRates, serviceRules);
          return Response.json(result, { status: 200 });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);

          if (msg.includes("weight allowed between")) {
            return Response.json(
              {
                error: msg,
                code: "WEIGHT_OUT_OF_RANGE",
                message: msg,
              },
              { status: 422 },
            );
          }

          if (msg.startsWith("NO_RATE_FOUND:")) {
            return Response.json(
              {
                error: "NO_RATE_FOUND",
                message: msg,
              },
              { status: 422 },
            );
          }

          return Response.json(
            {
              error: "SERVER_ERROR",
              message: msg,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
