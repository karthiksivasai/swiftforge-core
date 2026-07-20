/** Integration framework types — Milestone 7A. */

export type IntegrationProvider = {
  id: string;
  provider_code: string;
  provider_name: string;
  provider_type: "CARRIER" | "EINVOICE" | "CUSTOMS" | "VENDOR_GATEWAY";
  status: "ACTIVE" | "INACTIVE";
  supports_booking: boolean;
  supports_tracking: boolean;
  supports_labels: boolean;
  supports_serviceability: boolean;
  sort_order: number;
};

export type IntegrationCredential = {
  id: string;
  provider_id: string;
  provider_code: string;
  provider_name: string;
  provider_type: string;
  username: string | null;
  has_password: boolean;
  has_api_key: boolean;
  has_api_secret: boolean;
  account_number: string | null;
  endpoint: string | null;
  sandbox_mode: boolean;
  is_active: boolean;
  remark: string | null;
  supports_booking?: boolean;
  supports_tracking?: boolean;
  supports_labels?: boolean;
  supports_serviceability?: boolean;
  row_version: number;
  created_at?: string;
  updated_at?: string;
};

export type IntegrationCredentialFields = {
  provider_id?: string | null;
  provider_code?: string | null;
  username?: string | null;
  password?: string | null;
  api_key?: string | null;
  api_secret?: string | null;
  account_number?: string | null;
  endpoint?: string | null;
  sandbox_mode?: boolean;
  is_active?: boolean;
  remark?: string | null;
};
