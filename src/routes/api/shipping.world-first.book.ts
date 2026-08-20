import { createFileRoute } from "@tanstack/react-router";
import {
  parseWfBookingResponse,
  validateWfBookingRequest,
  type WfBookingPayload,
  type WfBookingResponse,
} from "@/lib/integrations/world-first-api";

export const Route = createFileRoute("/api/shipping/world-first/book")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;

          // Read SERVER-ONLY environment variables (never exposed to browser)
          const apiUrl =
            process.env.WF_API_URL || "https://wf.xpresion.in/api/v1/Awbentry/Awbentry";
          const userId = process.env.WF_USER_ID || "WF_DEMO_USER";
          const password = process.env.WF_PASSWORD || "WF_DEMO_PASS";
          const customerCode = process.env.WF_CUSTOMER_CODE || "WF_CUST_001";
          const vendorCode = process.env.WF_VENDOR_CODE || "WFT";

          // Inject credentials into server payload
          const payload: WfBookingPayload = {
            ...(body as unknown as WfBookingPayload),
            UserID: userId,
            Password: password,
            CustomerCode: customerCode,
            VendorName: (body.VendorName as string) || vendorCode,
          };

          // Server-side validation
          const validation = validateWfBookingRequest(payload);
          if (!validation.valid) {
            return Response.json(
              {
                success: false,
                message: `Server validation error: ${validation.errors.join("; ")}`,
                apiError: validation.errors.join("; "),
                apiStatus: "CLIENT_VALIDATION_ERROR",
                documents: [],
                noResponse: false,
              },
              { status: 400 },
            );
          }

          // Execute HTTP call from server to World-First API endpoint
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          let res: Response;
          try {
            res = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
          } catch (fetchErr) {
            clearTimeout(timeoutId);
            const isAbort = fetchErr instanceof Error && fetchErr.name === "AbortError";
            const msg = isAbort
              ? "World-First API request timed out on server (15s)"
              : fetchErr instanceof Error
                ? fetchErr.message
                : String(fetchErr);

            return Response.json({
              success: false,
              message: `Server connection error: ${msg}`,
              apiError: msg,
              apiStatus: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
              documents: [],
              noResponse: true, // NO HTTP response was received from WF API
            });
          }

          // An HTTP response was received (even 4xx / 5xx) -> DO NOT retry
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            return Response.json({
              success: false,
              message: `World-First HTTP ${res.status}: ${res.statusText}`,
              apiError: errText || `HTTP error ${res.status}`,
              apiStatus: `HTTP_${res.status}`,
              documents: [],
              noResponse: false,
            });
          }

          const data = (await res.json()) as WfBookingResponse;
          const parsed = parseWfBookingResponse(data);
          return Response.json({
            ...parsed,
            noResponse: false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json(
            {
              success: false,
              message: `Server handler error: ${msg}`,
              apiError: msg,
              apiStatus: "SERVER_ERROR",
              documents: [],
              noResponse: false,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
