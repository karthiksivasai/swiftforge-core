/** Provider-agnostic Vendor Shipping types — AWB Entry never imports adapter-specific shapes. */

export type VendorApiStatus =
  | "NONE"
  | "PENDING_CONFIRMATION"
  | "BOOKING_IN_PROGRESS"
  | "OTP_REQUIRED"
  | "VENDOR_PENDING"
  | "VENDOR_BOOKED"
  | "FAILED";

export type VendorSyncStatus = "IDLE" | "SYNCING" | "OK" | "PARTIAL" | "ERROR";

export type VendorDocType =
  | "VENDOR_AWB"
  | "SHIPPING_LABEL"
  | "VENDOR_INVOICE"
  | "COMMERCIAL_INVOICE"
  | "AUTHORITY_LETTER"
  | "AWB_LABEL"
  | "INVOICE"
  | "KYC"
  | "BOX_LABEL"
  | "CUSTOMS"
  | "OTHER";

export type VendorBookResultStatus = "SUCCESS" | "OTP_REQUIRED" | "ERROR";

export type VendorDocumentDescriptor = {
  doc_type: VendorDocType;
  label?: string;
  source_url?: string;
  content_b64?: string;
  mime_type?: string;
  raw_meta?: Record<string, unknown>;
};

export type VendorBookResult = {
  status: VendorBookResultStatus;
  message: string;
  vendorAwb?: string;
  vendorRef?: string;
  vendorBookingId?: string;
  vendorTrackingNumber?: string;
  vendorProvider?: string;
  vendorServiceCode?: string;
  otpVerified?: boolean;
  labelGenerated?: boolean;
  syncStatus?: VendorSyncStatus;
  documents?: VendorDocumentDescriptor[];
  rawResponse?: Record<string, unknown>;
  request?: Record<string, unknown>;
  error?: string;
  /** Maps to DB vendor_api_status after apply */
  apiStatus?: VendorApiStatus;
  /** Present only while SMS transport is SANDBOX (no live phone delivery). */
  sandboxOtp?: string | null;
  shipperMobileMasked?: string | null;
};

export type VendorShippingCredentials = {
  username?: string | null;
  password?: string | null;
  apiKey?: string | null;
  customerCode?: string | null;
  accountNumber?: string | null;
  endpointUrl?: string | null;
  sandboxMode?: boolean;
};

export type VendorShippingContext = {
  shippingApiEnabled: boolean;
  shipment: Record<string, unknown>;
  pieces: Record<string, unknown>[];
  charges: Record<string, unknown>[];
  integration: {
    id: string;
    provider_code: string;
    endpoint_url?: string | null;
    requires_otp: boolean;
    account_number?: string | null;
    customer_code?: string | null;
    enabled_services?: string[];
    supported_products?: string[];
    credential_id?: string | null;
    username?: string | null;
    has_username?: boolean;
    sandbox_mode?: boolean;
  } | null;
};

export type VendorBookRequest = {
  context: VendorShippingContext;
  otp?: string | null;
  /** When set, sandbox adapter accepts this OTP (issued to shipper mobile). */
  sandboxExpectedOtp?: string | null;
  credentials?: VendorShippingCredentials;
};

export interface VendorShippingAdapter {
  readonly providerCode: string;
  book(request: VendorBookRequest): Promise<VendorBookResult>;
  supportsRegenerate?: boolean;
}

export type VendorActivityEvent = {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
  created_by?: string | null;
};

export type VendorDocumentRow = {
  id: string;
  doc_type: VendorDocType;
  label?: string | null;
  file_id?: string | null;
  source_url?: string | null;
  content_b64?: string | null;
  mime_type?: string | null;
  raw_meta?: Record<string, unknown>;
  created_at: string;
};

export type VendorIntegrationRow = {
  id: string;
  provider_code: string;
  credential_id?: string | null;
  endpoint_url?: string | null;
  is_enabled: boolean;
  requires_otp: boolean;
  account_number?: string | null;
  customer_code?: string | null;
  enabled_services: string[];
  supported_products: string[];
  mapped_vendor_ids: string[];
  remark?: string | null;
  row_version: number;
  updated_at?: string;
};

export const VENDOR_DOC_TYPE_LABELS: Record<VendorDocType, string> = {
  VENDOR_AWB: "Vendor AWB",
  SHIPPING_LABEL: "Shipping Label",
  VENDOR_INVOICE: "Vendor Invoice",
  COMMERCIAL_INVOICE: "Commercial Invoice",
  AUTHORITY_LETTER: "Authority Letter",
  AWB_LABEL: "AWB Label",
  INVOICE: "Invoice",
  KYC: "KYC",
  BOX_LABEL: "Box Label",
  CUSTOMS: "Customs Documents",
  OTHER: "Other",
};

export const VENDOR_API_STATUS_LABELS: Record<VendorApiStatus, string> = {
  NONE: "None",
  PENDING_CONFIRMATION: "Pending Vendor Confirmation",
  BOOKING_IN_PROGRESS: "Booking Shipment…",
  OTP_REQUIRED: "OTP Required",
  VENDOR_PENDING: "Vendor Pending",
  VENDOR_BOOKED: "Vendor Booked",
  FAILED: "Failed",
};
