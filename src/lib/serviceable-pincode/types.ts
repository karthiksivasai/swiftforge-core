/** Serviceable pincode types — Milestone 6F. */

export type ServiceablePincodeRow = {
  id: string;
  pin_code: string;
  pin_name: string | null;
  is_serviceable: boolean;
  is_oda: boolean;
  pickup_available: boolean;
  destination_id: string | null;
  destination_code: string | null;
  destination_name: string | null;
  destination_status: string | null;
  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;
  branch_id: string | null;
  service_center_code: string | null;
  service_center_name: string | null;
  vendor_id: string | null;
  vendor_code: string | null;
  vendor_name: string | null;
  state_code: string | null;
  state_name: string | null;
};

export type ServiceableCheckResult = {
  serviceable: boolean;
  failure_reason: string | null;
  origin_pincode: string | null;
  destination_pincode: string | null;
  origin_zone: { id: string; code: string; name: string } | null;
  destination_zone: { id: string; code: string; name: string } | null;
  destination_master: {
    id: string;
    code: string;
    name: string;
    status: string;
  } | null;
  service_center: { id: string; code: string; name: string } | null;
  product: {
    id: string;
    code: string;
    name: string;
    shipment_type: string;
    status: string;
  } | null;
  shipment_type: string | null;
  service: string | null;
  routing: Array<Record<string, unknown>>;
  is_oda: boolean;
  pickup_available: boolean;
  origin?: ServiceablePincodeRow | null;
  destination?: ServiceablePincodeRow | null;
};
