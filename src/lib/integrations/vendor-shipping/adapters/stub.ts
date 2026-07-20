import type { VendorBookRequest, VendorBookResult, VendorShippingAdapter } from "../types";

/** Placeholder for native carrier HTTP — implement later without touching AWB Entry. */
export class StubVendorAdapter implements VendorShippingAdapter {
  constructor(public readonly providerCode: string) {}

  async book(_request: VendorBookRequest): Promise<VendorBookResult> {
    return {
      status: "ERROR",
      message: `${this.providerCode} adapter is not implemented yet. Configure a Vendor Gateway provider or enable sandbox credentials.`,
      error: "NOT_IMPLEMENTED",
      apiStatus: "FAILED",
      vendorProvider: this.providerCode,
    };
  }
}
