import { createFileRoute } from "@tanstack/react-router";

import { loadCustomerRateCard } from "@/lib/rating/pricingCatalog.server";
import { requireApiAuth } from "@/lib/security/require-api-auth.server";
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
        const auth = await requireApiAuth(request, {
          anyOf: [{ slug: "txn.awb-entry", action: "search" }],
        });
        if (auth instanceof Response) return auth;

        try {
          const body = (await request.json()) as Partial<RateQueryInput>;

          // Required field checks
          const customerCode = (body.customerCode || "").trim();
          const contractNo = (body.contractNo || "").trim();

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
            originName: body.originName,
            destinationCode: body.destinationCode,
            destinationName: body.destinationName,
            destinationCountry: body.destinationCountry,
            zoneId: body.zoneId,
            bookDate: body.bookDate || new Date().toISOString().slice(0, 10),
            pieces,
            division: body.division || 5000,
            roundHalfKg: body.roundHalfKg === true,
            otherCharges: body.otherCharges || 0,
            customerBillingStateCode: body.customerBillingStateCode || "TELANGANA",
            branchStateCode: body.branchStateCode || "TELANGANA",
            gstPct: body.gstPct ?? 18,
            fuelPct: body.fuelPct ?? 0,
          };

          // Service weight rules lookup from DB or SEED
          let serviceRules: ServiceWeightRuleRecord[] = [...SEED_SERVICE_WEIGHT_RULES];
          try {
            const { data: rulesData } = await auth.supabase
              .from("service_weight_rules")
              .select("id, service_code, service_name, min_weight, max_weight")
              .eq("tenant_id", auth.tenantId)
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

          let dbRates: CustomerRateRecord[] = [];
          try {
            dbRates = await loadCustomerRateCard(auth.supabase, auth.tenantId, customerCode);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return Response.json({ error: "SERVER_ERROR", message }, { status: 500 });
          }
          if (dbRates.length === 0 && customerCode.toUpperCase() === "CKING") {
            dbRates = [...SEED_CUSTOMER_RATES];
          }

          let result;
          try {
            result = computeShipmentRating(query, dbRates, serviceRules);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.startsWith("NO_RATE_FOUND:")) throw error;
            const { data, error: quoteError } = await auth.supabase.rpc("quote_zone_rate_freight", {
              p_vendor: query.vendorCode || "",
              p_origin: query.originCode || query.originName || "",
              p_destination: query.destinationCode || query.destinationName || "",
              p_product: query.productCode || "",
              p_service: query.serviceName || query.serviceCode || "",
              p_weight: chargeableWeight,
              p_as_of: query.bookDate,
              p_customer: query.customerCode || "",
            });
            if (quoteError) {
              const quoteMessage = quoteError.message || "";
              if (/No price in the rate grid/i.test(quoteMessage)) {
                throw new Error(`NO_RATE_FOUND: ${quoteMessage}`);
              }
              if (!/quote_zone_rate_freight|schema cache|PGRST202/i.test(quoteMessage)) {
                throw new Error(quoteMessage);
              }
            }
            const zoneFreight = quoteError || data == null || data === "" ? null : Number(data);
            if (zoneFreight == null || !Number.isFinite(zoneFreight)) throw error;
            result = computeShipmentRating(query, dbRates, serviceRules, zoneFreight);
          }
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
