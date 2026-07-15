/**
 * Carrier adapter interface — Phase 7 Milestone 7A/7B.
 * 7A: stub NotImplementedCarrierAdapter
 * 7B: RpcCarrierAdapter for FEDEX / DHL / BLUEDART (ops via SECURITY DEFINER RPCs)
 */

import {
  bookShipmentCarrier,
  cancelShipmentCarrier,
  checkCarrierServiceability,
  getShipmentCarrierLabel,
  refreshShipmentCarrierTracking,
  SUPPORTED_CARRIER_CODES,
  type SupportedCarrierCode,
} from "@/lib/integrations/carriers";

export type CarrierOperation = "book" | "cancel" | "track" | "label" | "serviceability";

export type AdapterResultStatus = "SUCCESS" | "ERROR" | "NOT_IMPLEMENTED";

export type AdapterResult = {
  status: AdapterResultStatus;
  message: string;
  operation: CarrierOperation;
  providerCode?: string;
  data?: Record<string, unknown>;
};

export type BookRequest = {
  shipmentId?: string;
  rowVersion?: number;
  awbNo?: string;
  [key: string]: unknown;
};

export type CancelRequest = {
  shipmentId?: string;
  rowVersion?: number;
  trackingNo?: string;
  [key: string]: unknown;
};

export type TrackRequest = {
  trackingNo?: string;
  shipmentId?: string;
  rowVersion?: number;
  [key: string]: unknown;
};

export type LabelRequest = {
  shipmentId?: string;
  rowVersion?: number;
  trackingNo?: string;
  [key: string]: unknown;
};

export type ServiceabilityRequest = {
  originPincode?: string;
  destinationPincode?: string;
  [key: string]: unknown;
};

export interface CarrierAdapter {
  readonly providerCode: string;
  book(request: BookRequest): Promise<AdapterResult>;
  cancel(request: CancelRequest): Promise<AdapterResult>;
  track(request: TrackRequest): Promise<AdapterResult>;
  label(request: LabelRequest): Promise<AdapterResult>;
  serviceability(request: ServiceabilityRequest): Promise<AdapterResult>;
}

function notImplemented(operation: CarrierOperation, providerCode?: string): AdapterResult {
  return {
    status: "NOT_IMPLEMENTED",
    message: "Not Implemented",
    operation,
    providerCode,
  };
}

function requireShipmentId(request: { shipmentId?: string }, operation: CarrierOperation): string {
  const id = request.shipmentId?.trim();
  if (!id) {
    throw new Error(`${operation}: shipmentId is required`);
  }
  return id;
}

/** Default stub adapter for unsupported providers. */
export class NotImplementedCarrierAdapter implements CarrierAdapter {
  constructor(public readonly providerCode: string = "UNKNOWN") {}

  async book(_request: BookRequest): Promise<AdapterResult> {
    return notImplemented("book", this.providerCode);
  }

  async cancel(_request: CancelRequest): Promise<AdapterResult> {
    return notImplemented("cancel", this.providerCode);
  }

  async track(_request: TrackRequest): Promise<AdapterResult> {
    return notImplemented("track", this.providerCode);
  }

  async label(_request: LabelRequest): Promise<AdapterResult> {
    return notImplemented("label", this.providerCode);
  }

  async serviceability(_request: ServiceabilityRequest): Promise<AdapterResult> {
    return notImplemented("serviceability", this.providerCode);
  }
}

/**
 * First-party carrier adapters (7B). Provider-specific HTTP stays in the DB
 * sandbox/production path — this class only invokes the shared RPCs.
 */
export class RpcCarrierAdapter implements CarrierAdapter {
  constructor(public readonly providerCode: SupportedCarrierCode) {}

  async book(request: BookRequest): Promise<AdapterResult> {
    try {
      const shipmentId = requireShipmentId(request, "book");
      const data = await bookShipmentCarrier({
        id: shipmentId,
        rowVersion: request.rowVersion ?? null,
        providerCode: this.providerCode,
      });
      return {
        status: "SUCCESS",
        message: "Carrier booking accepted",
        operation: "book",
        providerCode: this.providerCode,
        data,
      };
    } catch (e) {
      return {
        status: "ERROR",
        message: e instanceof Error ? e.message : String(e),
        operation: "book",
        providerCode: this.providerCode,
      };
    }
  }

  async cancel(request: CancelRequest): Promise<AdapterResult> {
    try {
      const shipmentId = requireShipmentId(request, "cancel");
      const data = await cancelShipmentCarrier({
        id: shipmentId,
        rowVersion: request.rowVersion ?? null,
      });
      return {
        status: "SUCCESS",
        message: "Carrier booking cancelled",
        operation: "cancel",
        providerCode: this.providerCode,
        data,
      };
    } catch (e) {
      return {
        status: "ERROR",
        message: e instanceof Error ? e.message : String(e),
        operation: "cancel",
        providerCode: this.providerCode,
      };
    }
  }

  async track(request: TrackRequest): Promise<AdapterResult> {
    try {
      const shipmentId = requireShipmentId(request, "track");
      const data = await refreshShipmentCarrierTracking({
        id: shipmentId,
        rowVersion: request.rowVersion ?? null,
      });
      return {
        status: "SUCCESS",
        message: "Tracking refreshed",
        operation: "track",
        providerCode: this.providerCode,
        data,
      };
    } catch (e) {
      return {
        status: "ERROR",
        message: e instanceof Error ? e.message : String(e),
        operation: "track",
        providerCode: this.providerCode,
      };
    }
  }

  async label(request: LabelRequest): Promise<AdapterResult> {
    try {
      const shipmentId = requireShipmentId(request, "label");
      const data = await getShipmentCarrierLabel({
        id: shipmentId,
        rowVersion: request.rowVersion ?? null,
      });
      return {
        status: "SUCCESS",
        message: "Label metadata retrieved",
        operation: "label",
        providerCode: this.providerCode,
        data,
      };
    } catch (e) {
      return {
        status: "ERROR",
        message: e instanceof Error ? e.message : String(e),
        operation: "label",
        providerCode: this.providerCode,
      };
    }
  }

  async serviceability(request: ServiceabilityRequest): Promise<AdapterResult> {
    try {
      const origin = String(request.originPincode ?? "").trim();
      const dest = String(request.destinationPincode ?? "").trim();
      if (!origin || !dest) {
        throw new Error("Origin and destination pincode are required");
      }
      const data = await checkCarrierServiceability({
        providerCode: this.providerCode,
        originPincode: origin,
        destinationPincode: dest,
      });
      const serviceable = data.serviceable === true;
      return {
        status: "SUCCESS",
        message: serviceable ? "Serviceable" : "Not serviceable",
        operation: "serviceability",
        providerCode: this.providerCode,
        data,
      };
    } catch (e) {
      return {
        status: "ERROR",
        message: e instanceof Error ? e.message : String(e),
        operation: "serviceability",
        providerCode: this.providerCode,
      };
    }
  }
}

export function isSupportedCarrier(code: string): code is SupportedCarrierCode {
  return (SUPPORTED_CARRIER_CODES as readonly string[]).includes(code.toUpperCase());
}

/** Registry — supported carriers get RpcCarrierAdapter; others remain stubs. */
export function getCarrierAdapter(providerCode: string): CarrierAdapter {
  const code = providerCode.toUpperCase();
  if (isSupportedCarrier(code)) {
    return new RpcCarrierAdapter(code);
  }
  return new NotImplementedCarrierAdapter(code);
}
