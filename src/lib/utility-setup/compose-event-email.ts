/**
 * Builds the booking / delivery / forwarding email body from print toggles.
 * The database function app.compose_event_email_body mirrors this layout.
 */

export type EventEmailModule = "BOOKING" | "DELIVERY" | "FORWARDING" | "WEIGHT_ALERT";

type FieldSpec = {
  flag: string;
  label: string;
  keys: string[];
};

const BOOKING_FIELDS: FieldSpec[] = [
  { flag: "printShipper", label: "Shipper", keys: ["Shipper_Name", "shipper", "shipper_name"] },
  { flag: "printBookingTime", label: "Booking Time", keys: ["BookTime", "booking_time", "book_time"] },
  { flag: "printDoxSpx", label: "DOX/SPX", keys: ["pieces_unit", "dox_spx", "shipment_type"] },
  {
    flag: "printWeight",
    label: "Weight",
    keys: ["Act_Weight", "Chrg_Weight", "weight", "actual_weight", "charge_weight"],
  },
  { flag: "printProductName", label: "Product Name", keys: ["Prod_Name", "Prod_Code", "product", "product_name"] },
  { flag: "printVolWeight", label: "Vol Weight", keys: ["Vol_Weight", "Vol_WeightM", "vol_weight"] },
  { flag: "printTotalAmount", label: "Total Amount", keys: ["Grand_Total", "Total", "total", "total_amount"] },
  {
    flag: "printVendorAwbNo",
    label: "Vendor AWB No.",
    keys: ["Agent_AWBno", "Agent_AWBNo1", "vendor_awb", "forwarding_awb"],
  },
  { flag: "printSender", label: "Sender", keys: ["sender", "Sender"] },
  { flag: "printOrigin", label: "Origin", keys: ["OrgCode", "Origin_Name", "origin"] },
  { flag: "printCustomer", label: "Customer", keys: ["Customer_Code", "Customer_Name", "customer"] },
  { flag: "printContent", label: "Content", keys: ["Content", "content"] },
];

const DELIVERY_FIELDS: FieldSpec[] = [
  { flag: "printRefNo", label: "Ref No.", keys: ["Ref_No", "reference_no", "ref_no"] },
  { flag: "printDoxSpx", label: "DOX/SPX", keys: ["pieces_unit", "dox_spx", "shipment_type"] },
  { flag: "printPcs", label: "Pcs", keys: ["Pcs", "pieces", "pcs"] },
  { flag: "printWeight", label: "Weight", keys: ["Act_Weight", "weight", "actual_weight"] },
  { flag: "printSender", label: "Sender", keys: ["sender", "Sender", "Shipper_Name"] },
];

const FORWARDING_FIELDS: FieldSpec[] = [
  { flag: "printDoxSpx", label: "DOX/SPX", keys: ["pieces_unit", "dox_spx", "shipment_type"] },
  { flag: "printPcs", label: "Pcs", keys: ["Pcs", "pieces", "pcs"] },
  { flag: "printWeight", label: "Weight", keys: ["Act_Weight", "weight", "actual_weight"] },
  { flag: "printVendorName", label: "Vendor Name", keys: ["Vendor_Name", "Vendor_Code", "vendor", "vendor_name"] },
];

const WEIGHT_ALERT_FIELDS: FieldSpec[] = [
  { flag: "printSender", label: "Sender", keys: ["sender", "Sender", "Shipper_Name"] },
  { flag: "printOrigin", label: "Origin", keys: ["OrgCode", "Origin_Name", "origin"] },
  { flag: "printConsignee", label: "Consignee", keys: ["Consignee_Name", "consignee"] },
  {
    flag: "printVendorAwbNo",
    label: "Vendor AWB No",
    keys: ["Agent_AWBno", "Agent_AWBNo1", "vendor_awb"],
  },
  { flag: "printVendorName", label: "Vendor Name", keys: ["Vendor_Name", "Vendor_Code", "vendor"] },
  { flag: "printPcs", label: "PCS", keys: ["Pcs", "pieces", "pcs"] },
];

const FIELDS: Record<EventEmailModule, FieldSpec[]> = {
  BOOKING: BOOKING_FIELDS,
  DELIVERY: DELIVERY_FIELDS,
  FORWARDING: FORWARDING_FIELDS,
  WEIGHT_ALERT: WEIGHT_ALERT_FIELDS,
};

export function eventEmailModule(hint: string | null | undefined): EventEmailModule | null {
  switch ((hint ?? "").trim().toUpperCase()) {
    case "BOOKING":
    case "EMAIL ON BOOKING":
      return "BOOKING";
    case "DELIVERY":
    case "POD":
    case "EMAIL ON DELIVERY":
      return "DELIVERY";
    case "FORWARDING":
    case "EMAIL ON FORWARDING":
      return "FORWARDING";
    case "WEIGHT_ALERT":
    case "ESTATEMENT WEIGHT ALERT":
      return "WEIGHT_ALERT";
    default:
      return null;
  }
}

function flagOn(flags: Record<string, unknown>, key: string): boolean {
  const value = flags[key];
  return value === true || value === "true" || value === "t" || value === "1" || value === "yes";
}

function firstValue(variables: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = variables[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function composeEventEmailBody(input: {
  module: EventEmailModule;
  flags: Record<string, unknown>;
  variables: Record<string, unknown>;
  dear?: string | null;
  body?: string | null;
}): string {
  const lines: string[] = [];
  const dear = (input.dear ?? "").trim();
  const body = (input.body ?? "").trim();
  if (dear) lines.push(dear, "");
  if (body) lines.push(body, "");

  for (const field of FIELDS[input.module]) {
    if (!flagOn(input.flags, field.flag)) continue;
    const value = firstValue(input.variables, field.keys);
    if (!value) continue;
    let label = field.label;
    if (input.module === "BOOKING" && field.flag === "printWeight") {
      const heading = String(input.flags.weightHeading ?? "").trim();
      if (heading) label = heading;
    }
    lines.push(`${label}: ${value}`);
  }

  return lines.join("\n").trim();
}

/** How many customers a percentage save evaluates before returning. */
export const CREDIT_REEVAL_BATCH_SIZE = 200;

export function creditReevalPages(customerCount: number, batchSize = CREDIT_REEVAL_BATCH_SIZE): number {
  if (customerCount <= 0) return 0;
  return Math.ceil(customerCount / batchSize);
}
