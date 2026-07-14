/**
 * Maps between Pickup UI form/list shape and DB / RPC payloads.
 */
import type { PickupFields } from "@/lib/transactions/schemas/pickups";
import type { PickupRow as PickupDbRow } from "@/lib/transactions/resources/pickups";

export type LookupPair = { id?: string; code: string; name: string };

export type UiPickupForm = {
  customer: LookupPair;
  pickupDate: string;
  origin: LookupPair;
  mobileNo: string;
  shipper: LookupPair;
  contact: string;
  address1: string;
  address2: string;
  zipCode: string;
  city: string;
  state: string;
  payOption: string;
  consigneeDetails: boolean;
  serviceCenter: string;
  serviceCenterId: string;
  vehicleReq: string;
  area: LookupPair;
  fieldExecutive: LookupPair;
  salesExecutive: LookupPair;
  specialInstructions: string;
  reason: string;
  pickupReady: boolean;
  pickupTime: string;
  bookedBy: string;
  editedBy: string;
};

export type UiPickupRow = UiPickupForm & {
  id: string;
  pickupNo: number;
  status: string;
  rowVersion: number;
  passed: string;
  awbNo: string;
  confirm: string;
  cancel: string;
};

const VEHICLE_UI_TO_DB: Record<string, string> = {
  Bicycle: "BICYCLE",
  Bike: "BIKE",
  Car: "CAR",
  Van: "VAN",
  Truck: "TRUCK",
  Tempo: "TEMPO",
};

const VEHICLE_DB_TO_UI: Record<string, string> = {
  BICYCLE: "Bicycle",
  BIKE: "Bike",
  CAR: "Car",
  VAN: "Van",
  TRUCK: "Truck",
  TEMPO: "Tempo",
};

function pairFrom(
  id: string | null | undefined,
  ref: { code?: string; name?: string } | null | undefined,
  fallbackName?: string | null,
): LookupPair {
  return {
    id: id ?? undefined,
    code: ref?.code ?? "",
    name: ref?.name ?? fallbackName ?? "",
  };
}

export function dbPickupToUi(row: PickupDbRow): UiPickupRow {
  const branch = row.branches;
  return {
    id: row.id,
    pickupNo: Number(row.pickup_no),
    status: row.status,
    rowVersion: row.row_version,
    customer: pairFrom(row.customer_id, row.customers),
    pickupDate: row.pickup_date,
    origin: pairFrom(row.origin_destination_id, row.destinations),
    mobileNo: row.mobile_no ?? "",
    shipper: pairFrom(row.shipper_id, row.shippers, row.shipper_name),
    contact: row.contact ?? "",
    address1: row.address1 ?? "",
    address2: row.address2 ?? "",
    zipCode: row.zip ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    payOption: row.pay_option ?? "",
    consigneeDetails: row.consignee_details,
    serviceCenter: branch?.code ?? "",
    serviceCenterId: row.branch_id ?? "",
    vehicleReq: row.vehicle_type ? (VEHICLE_DB_TO_UI[row.vehicle_type] ?? row.vehicle_type) : "",
    area: {
      id: row.area_id ?? undefined,
      code: row.areas?.name ?? "",
      name: row.areas?.name ?? "",
    },
    fieldExecutive: pairFrom(row.field_executive_id, row.field_executives),
    salesExecutive: pairFrom(row.sales_executive_id, row.sales_executives),
    specialInstructions: row.special_instructions ?? "",
    reason: row.reason ?? "",
    pickupReady: row.pickup_ready,
    pickupTime: row.pickup_time ? String(row.pickup_time).slice(0, 5) : "",
    bookedBy: "",
    editedBy: "",
    passed: "",
    awbNo: row.awb_no ?? "",
    confirm: row.status === "CONFIRMED" ? "Yes" : "",
    cancel: row.status === "CANCELLED" ? "Yes" : "",
  };
}

export function uiFormToPickupFields(form: UiPickupForm): PickupFields {
  const vehicle = form.vehicleReq.trim();
  return {
    mobile_no: form.mobileNo.trim(),
    shipper_name: form.shipper.name.trim() || null,
    shipper_id: form.shipper.id || null,
    shipper_code: form.shipper.code.trim() || null,
    customer_id: form.customer.id || null,
    customer_code: form.customer.code.trim() || null,
    origin_destination_id: form.origin.id || null,
    origin_code: form.origin.code.trim() || null,
    branch_id: form.serviceCenterId || null,
    branch_code: form.serviceCenter.trim() || null,
    area_id: form.area.id || null,
    area_code: form.area.code.trim() || null,
    area_name: form.area.name.trim() || null,
    field_executive_id: form.fieldExecutive.id || null,
    field_executive_code: form.fieldExecutive.code.trim() || null,
    sales_executive_id: form.salesExecutive.id || null,
    sales_executive_code: form.salesExecutive.code.trim() || null,
    pickup_date: form.pickupDate,
    pickup_time: form.pickupTime.trim() || null,
    contact: form.contact.trim() || null,
    address1: form.address1.trim() || null,
    address2: form.address2.trim() || null,
    zip: form.zipCode.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    pay_option: form.payOption.trim() || null,
    consignee_details: form.consigneeDetails,
    vehicle_type: (VEHICLE_UI_TO_DB[vehicle] ?? (vehicle ? vehicle.toUpperCase() : null)) as
      "BICYCLE" | "BIKE" | "CAR" | "VAN" | "TRUCK" | "TEMPO" | null,
    special_instructions: form.specialInstructions.trim() || null,
    reason: form.reason.trim() || null,
    pickup_ready: form.pickupReady,
  };
}

export function uiRowToForm(row: UiPickupRow): UiPickupForm {
  return {
    customer: { ...row.customer },
    pickupDate: row.pickupDate,
    origin: { ...row.origin },
    mobileNo: row.mobileNo,
    shipper: { ...row.shipper },
    contact: row.contact,
    address1: row.address1,
    address2: row.address2,
    zipCode: row.zipCode,
    city: row.city,
    state: row.state,
    payOption: row.payOption,
    consigneeDetails: row.consigneeDetails,
    serviceCenter: row.serviceCenter,
    serviceCenterId: row.serviceCenterId,
    vehicleReq: row.vehicleReq,
    area: { ...row.area },
    fieldExecutive: { ...row.fieldExecutive },
    salesExecutive: { ...row.salesExecutive },
    specialInstructions: row.specialInstructions,
    reason: row.reason,
    pickupReady: row.pickupReady,
    pickupTime: row.pickupTime,
    bookedBy: row.bookedBy,
    editedBy: row.editedBy,
  };
}
