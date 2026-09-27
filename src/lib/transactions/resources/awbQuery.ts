import { supabase } from "@/integrations/supabase/client";

export type LookupPair = { code: string; name: string };

export type FilterForm = {
  bookingFromDate: string;
  bookingToDate: string;
  statusFromDate: string;
  statusToDate: string;
  referenceNo: string;
  customer: LookupPair;
  vendor: LookupPair;
  origin: LookupPair;
  destination: LookupPair;
  zipCode: string;
  forwardingNo: string;
  product: string;
  deliveryVendor: LookupPair;
  consignee: string;
  runNoTo: string;
  consigneeCity: string;
  csbType: string;
  onlyPart: boolean;
  vendorAlt: LookupPair;
  paymentType: string;
  bagNo: string;
  deliveryService: LookupPair;
  consigneePhone: string;
  weightFrom: string;
  onlyMasterAndActual: boolean;
  service: string;
  airline: string;
  status: string;
  shipper: string;
  runNoFrom: string;
  weightTo: string;
  isHold: boolean;
  productType: string;
  rto: boolean;
};

export type FilterResultRow = {
  id: string;
  masterAwbNo: string;
  awbNo: string;
  bookingDate: string;
  runNo: string;
  airline: string;
  shipper: string;
  consignee: string;
  city: string;
  destination: string;
  pieces: string;
  chargeWeight: string;
  totalAmount: string;
  forwarder: string;
  deliveryDate: string;
  paymentType: string;
  manifestType: string;
};

export type SearchAwbShipmentsResult = {
  rows: FilterResultRow[];
  totalCount: number;
  error?: string;
};

export type VolumetricLine = {
  awbNo: string;
  agentAwbNo: string;
  actualWeight: string;
  pieces: string;
  length: string;
  width: string;
  height: string;
  volumetricWeight: string;
  chargeWeight: string;
};

export type InscanLine = {
  awbNo: string;
  vendorNo: string;
  weight: string;
  length: string;
  breadth: string;
  height: string;
  volWeight: string;
};

export type ManifestLine = {
  awbNo: string;
  maniNo: string;
  maniDate: string;
  bag: string;
  weight: string;
  pcs: string;
};

export type ManifestInscanLine = {
  awbNo: string;
  maniNo: string;
  location: string;
  recDate: string;
  inscanLocation: string;
  remark: string;
  recWeight: string;
};

export type QueryProformaLine = {
  boxNo: string;
  packageNo: string;
  description: string;
  hsnCode: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: string;
  weight: string;
};

export type SubTablesResult = {
  volumetric: VolumetricLine[];
  inscan: InscanLine[];
  manifest: ManifestLine[];
  manifestInscan: ManifestInscanLine[];
  proforma: QueryProformaLine[];
  vendorName: string;
  deliveryVendor: string;
  mastAwbNo: string;
  productType: string;
  csbType: string;
  inscanWeight: string;
  inscanRemark: string;
  customerDetails: string;
  podUser: string;
  podStatusTime: string;
  cdNo: string;
  obcName: string;
  dispatchDate: string;
  details: Record<string, string>;
};

const EMPTY_SUB_TABLES: SubTablesResult = {
  volumetric: [],
  inscan: [],
  manifest: [],
  manifestInscan: [],
  proforma: [],
  vendorName: "",
  deliveryVendor: "",
  mastAwbNo: "",
  productType: "",
  csbType: "",
  inscanWeight: "",
  inscanRemark: "",
  customerDetails: "",
  podUser: "",
  podStatusTime: "",
  cdNo: "",
  obcName: "",
  dispatchDate: "",
  details: {},
};

const PENDING_STATUSES = [
  "BOOKED",
  "PICKUP_INSCANNED",
  "BAGGED",
  "MANIFESTED",
  "MANIFEST_INSCANNED",
  "IN_TRANSIT",
  "RECEIVED_AT_HUB",
  "ON_DRS",
  "MISROUTED",
  "OUT_FOR_DELIVERY",
  "DELIVERY_ATTEMPTED",
  "DELIVERED_PENDING_POD",
];

function likePattern(value: string): string {
  return `%${value.trim().replace(/[%_,()"]/g, "")}%`;
}

function orIlike(columns: string[], value: string): string {
  const pattern = likePattern(value);
  return columns.map((column) => `${column}.ilike."${pattern}"`).join(",");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function showText(value: unknown): string {
  return textOf(value) || "—";
}

function showNumber(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function partyName(party: unknown): string {
  const record = asRecord(party);
  if (!record) return "";
  return textOf(record.company_name) || textOf(record.contact_name) || textOf(record.name);
}

function partyCity(party: unknown): string {
  const record = asRecord(party);
  return record ? textOf(record.city) : "";
}

function dateOnly(value: unknown): string {
  const text = textOf(value);
  if (!text) return "";
  return text.slice(0, 10);
}

function displayDate(value: unknown): string {
  const raw = dateOnly(value);
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
}

function clockDigits(value: unknown): string {
  const match = textOf(value).match(/(\d{2}):(\d{2})/);
  if (!match) return "";
  return `${match[1]}${match[2]}`;
}

export async function lookupAwbLabels(ids: {
  userIds: string[];
  branchIds: string[];
  fileIds: string[];
}): Promise<{ users: Record<string, string>; branches: Record<string, string>; files: Record<string, string> }> {
  const users: Record<string, string> = {};
  const branches: Record<string, string> = {};
  const files: Record<string, string> = {};
  const userIds = [...new Set(ids.userIds.map(textOf).filter(Boolean))];
  const branchIds = [...new Set(ids.branchIds.map(textOf).filter(Boolean))];
  const fileIds = [...new Set(ids.fileIds.map(textOf).filter(Boolean))];

  if (userIds.length > 0) {
    const [byAuth, byId] = await Promise.all([
      supabase.from("users").select("id, auth_user_id, username, full_name").in("auth_user_id", userIds),
      supabase.from("users").select("id, auth_user_id, username, full_name").in("id", userIds),
    ]);
    for (const row of [...(byAuth.data ?? []), ...(byId.data ?? [])] as Array<{
      id?: string | null;
      auth_user_id?: string | null;
      username?: string | null;
      full_name?: string | null;
    }>) {
      const label = textOf(row.full_name) || textOf(row.username);
      if (!label) continue;
      if (row.id) users[String(row.id)] = label;
      if (row.auth_user_id) users[String(row.auth_user_id)] = label;
    }
  }

  if (branchIds.length > 0) {
    const { data } = await supabase.from("branches").select("id, code").in("id", branchIds);
    for (const row of (data ?? []) as Array<{ id: string; code?: string | null }>) {
      const code = textOf(row.code);
      if (code) branches[String(row.id)] = code;
    }
  }

  if (fileIds.length > 0) {
    const { data } = await supabase.from("files").select("id, original_name").in("id", fileIds);
    for (const row of (data ?? []) as Array<{ id: string; original_name?: string | null }>) {
      const name = textOf(row.original_name);
      if (name) files[String(row.id)] = name;
    }
  }

  return { users, branches, files };
}

function payloadText(payload: unknown, keys: string[]): string {
  const record = asRecord(payload);
  if (!record) return "";
  for (const key of keys) {
    const value = textOf(record[key]);
    if (value) return value;
  }
  return "";
}

function proformaFromExtras(extras: unknown): QueryProformaLine[] {
  const proforma = asRecord(asRecord(extras)?.proforma);
  const lines = Array.isArray(proforma?.lines) ? proforma.lines : [];
  return lines.map((line) => {
    const row = asRecord(line) ?? {};
    return {
      boxNo: textOf(row.boxNo),
      packageNo: textOf(row.packageNo),
      description: textOf(row.description),
      hsnCode: textOf(row.hsCode || row.hsnCode),
      quantity: textOf(row.quantity),
      unit: textOf(row.unit),
      rate: textOf(row.rate),
      amount: textOf(row.amount),
      weight: textOf(row.weight),
    };
  });
}

async function idsMatching(
  table: "customers" | "vendors" | "destinations" | "products",
  term: string,
): Promise<string[] | null> {
  const text = term.trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .or(orIlike(["code", "name"], text))
    .is("deleted_at", null)
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String((row as { id: string }).id));
}

async function productIdsForLabel(label: string): Promise<string[]> {
  const { data: types, error: typeError } = await supabase
    .from("product_types")
    .select("id")
    .or(orIlike(["code", "name"], label))
    .is("deleted_at", null)
    .limit(50);
  if (typeError) throw new Error(typeError.message);
  const typeIds = (types ?? []).map((row) => String((row as { id: string }).id));

  const { data: named, error: namedError } = await supabase
    .from("products")
    .select("id")
    .or(orIlike(["code", "name"], label))
    .is("deleted_at", null)
    .limit(100);
  if (namedError) throw new Error(namedError.message);

  const ids = new Set((named ?? []).map((row) => String((row as { id: string }).id)));
  if (typeIds.length > 0) {
    const { data: typed, error: typedError } = await supabase
      .from("products")
      .select("id")
      .in("product_type_id", typeIds)
      .is("deleted_at", null)
      .limit(200);
    if (typedError) throw new Error(typedError.message);
    for (const row of typed ?? []) ids.add(String((row as { id: string }).id));
  }
  return [...ids];
}

async function awbsForManifestNumbers(from: string, to: string): Promise<string[] | null> {
  if (!from && !to) return null;
  let manifestQuery = supabase.from("manifests").select("id").is("deleted_at", null);
  if (from) manifestQuery = manifestQuery.gte("manifest_no", from);
  if (to) manifestQuery = manifestQuery.lte("manifest_no", to);
  const { data, error } = await manifestQuery.limit(200);
  if (error) throw new Error(error.message);
  const manifestIds = (data ?? []).map((row) => String((row as { id: string }).id));
  if (manifestIds.length === 0) return [];
  const { data: lines, error: lineError } = await supabase
    .from("manifest_lines")
    .select("awb_no")
    .in("manifest_id", manifestIds)
    .is("deleted_at", null)
    .limit(1000);
  if (lineError) throw new Error(lineError.message);
  return [
    ...new Set(
      (lines ?? [])
        .map((row) => textOf((row as { awb_no?: string }).awb_no))
        .filter(Boolean),
    ),
  ];
}

async function awbsForBag(bagNo: string): Promise<string[] | null> {
  const text = bagNo.trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from("manifest_lines")
    .select("awb_no")
    .ilike("bag_no", likePattern(text))
    .is("deleted_at", null)
    .limit(1000);
  if (error) throw new Error(error.message);
  return [
    ...new Set(
      (data ?? [])
        .map((row) => textOf((row as { awb_no?: string }).awb_no))
        .filter(Boolean),
    ),
  ];
}

function intersectAwbs(current: string[] | null, next: string[] | null): string[] | null {
  if (next == null) return current;
  if (current == null) return next;
  const allowed = new Set(next);
  return current.filter((awb) => allowed.has(awb));
}

async function resolveShipmentId(awbNo: string, shipmentId?: string): Promise<string | null> {
  if (shipmentId) return shipmentId;
  const { data, error } = await supabase
    .from("shipments")
    .select("id")
    .eq("awb_no", awbNo)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return String((data as { id: string }).id);
}

async function vendorLabels(ids: string[]): Promise<Map<string, { code: string; name: string }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const labels = new Map<string, { code: string; name: string }>();
  if (unique.length === 0) return labels;
  const { data, error } = await supabase
    .from("vendors")
    .select("id, code, name")
    .in("id", unique);
  if (error || !data) return labels;
  for (const row of data as Array<{ id: string; code?: string | null; name?: string | null }>) {
    labels.set(String(row.id), { code: textOf(row.code), name: textOf(row.name) });
  }
  return labels;
}

/**
 * Execute real database filter query against Supabase shipments table.
 */
export async function searchAwbShipments(
  filter: FilterForm,
  limit = 200,
  offset = 0,
): Promise<SearchAwbShipmentsResult> {
  const empty = { rows: [] as FilterResultRow[], totalCount: 0 };
  try {
    const customerIds = await idsMatching(
      "customers",
      filter.customer.code.trim() || filter.customer.name.trim(),
    );
    const originIds = await idsMatching(
      "destinations",
      filter.origin.code.trim() || filter.origin.name.trim(),
    );
    const destinationIds = await idsMatching(
      "destinations",
      filter.destination.code.trim() || filter.destination.name.trim(),
    );
    const deliveryVendorIds = await idsMatching(
      "vendors",
      filter.deliveryVendor.code.trim() || filter.deliveryVendor.name.trim(),
    );
    const vendorIds = await idsMatching(
      "vendors",
      filter.vendor.code.trim() || filter.vendor.name.trim(),
    );
    const vendorAltIds = await idsMatching(
      "vendors",
      filter.vendorAlt.code.trim() || filter.vendorAlt.name.trim(),
    );
    let vendorFilter = vendorIds;
    if (vendorAltIds) {
      vendorFilter = vendorFilter
        ? vendorFilter.filter((id) => vendorAltIds.includes(id))
        : vendorAltIds;
    }

    let productIds: string[] | null = null;
    if (filter.product.trim()) {
      productIds = await productIdsForLabel(filter.product.trim());
    }
    if (filter.productType.trim() && filter.productType !== "DOX" && filter.productType !== "NDOX") {
      const typed = await productIdsForLabel(filter.productType.trim());
      productIds = productIds ? productIds.filter((id) => typed.includes(id)) : typed;
    }

    let awbFilter = await awbsForManifestNumbers(filter.runNoFrom.trim(), filter.runNoTo.trim());
    awbFilter = intersectAwbs(awbFilter, await awbsForBag(filter.bagNo));

    let partIds: string[] | null = null;
    if (filter.onlyPart) {
      const { data, error } = await supabase
        .from("shipment_pieces")
        .select("shipment_id")
        .not("child_awb", "is", null)
        .neq("child_awb", "")
        .is("deleted_at", null)
        .limit(500);
      if (error) throw new Error(error.message);
      partIds = [
        ...new Set(
          (data ?? [])
            .map((row) => textOf((row as { shipment_id?: string }).shipment_id))
            .filter(Boolean),
        ),
      ];
    }

    const noMatch =
      (customerIds && customerIds.length === 0) ||
      (originIds && originIds.length === 0) ||
      (destinationIds && destinationIds.length === 0) ||
      (deliveryVendorIds && deliveryVendorIds.length === 0) ||
      (vendorFilter && vendorFilter.length === 0) ||
      (productIds && productIds.length === 0) ||
      (awbFilter && awbFilter.length === 0) ||
      (partIds && partIds.length === 0);
    if (noMatch) return empty;

    let query = supabase
      .from("shipments")
      .select(
        "id, awb_no, book_date, airline, shipper, consignee, pieces, charge_weight, customer_charges_total, shipment_value, payment_type, forwarding_awb, delivered_at, wizard_extras, destination_id, delivery_vendor_id",
        { count: "exact" },
      )
      .is("deleted_at", null);

    if (filter.bookingFromDate) query = query.gte("book_date", filter.bookingFromDate);
    if (filter.bookingToDate) query = query.lte("book_date", filter.bookingToDate);
    if (filter.statusFromDate) query = query.gte("status_at", `${filter.statusFromDate}T00:00:00Z`);
    if (filter.statusToDate) query = query.lte("status_at", `${filter.statusToDate}T23:59:59Z`);
    if (filter.referenceNo.trim()) {
      query = query.ilike("reference_no", likePattern(filter.referenceNo));
    }
    if (customerIds) query = query.in("customer_id", customerIds);
    if (originIds) query = query.in("origin_destination_id", originIds);
    if (destinationIds) query = query.in("destination_id", destinationIds);
    if (deliveryVendorIds) query = query.in("delivery_vendor_id", deliveryVendorIds);
    if (vendorFilter) query = query.in("vendor_id", vendorFilter);
    if (productIds) query = query.in("product_id", productIds);
    if (awbFilter) query = query.in("awb_no", awbFilter.slice(0, 300));
    if (partIds) query = query.in("id", partIds.slice(0, 300));
    if (filter.zipCode.trim()) {
      query = query.or(orIlike(["consignee->>pincode"], filter.zipCode));
    }
    if (filter.forwardingNo.trim()) {
      query = query.ilike("forwarding_awb", likePattern(filter.forwardingNo));
    }
    if (filter.shipper.trim()) {
      query = query.or(orIlike(["shipper->>company_name", "shipper->>contact_name"], filter.shipper));
    }
    if (filter.consignee.trim()) {
      query = query.or(
        orIlike(["consignee->>company_name", "consignee->>contact_name"], filter.consignee),
      );
    }
    if (filter.consigneeCity.trim()) {
      query = query.ilike("consignee->>city", likePattern(filter.consigneeCity));
    }
    if (filter.consigneePhone.trim()) {
      query = query.or(
        orIlike(["consignee->>telephone", "consignee->>mobile"], filter.consigneePhone),
      );
    }
    if (filter.airline.trim()) query = query.ilike("airline", likePattern(filter.airline));
    if (filter.service.trim()) query = query.ilike("service", likePattern(filter.service));
    const deliveryService = filter.deliveryService.code.trim() || filter.deliveryService.name.trim();
    if (deliveryService) query = query.ilike("delivery_service", likePattern(deliveryService));
    if (filter.paymentType) query = query.eq("payment_type", filter.paymentType);
    if (filter.productType === "DOX" || filter.productType === "NDOX") {
      query = query.eq("pieces_unit", filter.productType);
    }
    if (filter.csbType.trim()) {
      query = query.eq("wizard_extras->proforma->>csbType", filter.csbType.trim());
    }
    if (filter.status && filter.status !== "All") {
      if (filter.status === "Delivered") query = query.eq("current_status", "DELIVERED");
      else if (filter.status === "UnDelivered") {
        query = query.in("current_status", ["UNDELIVERED", "UNDELIVERED_RECEIVED"]);
      } else if (filter.status === "Pending") query = query.in("current_status", PENDING_STATUSES);
      else query = query.eq("current_status", filter.status);
    }
    if (filter.weightFrom && !Number.isNaN(Number(filter.weightFrom))) {
      query = query.gte("charge_weight", Number(filter.weightFrom));
    }
    if (filter.weightTo && !Number.isNaN(Number(filter.weightTo))) {
      query = query.lte("charge_weight", Number(filter.weightTo));
    }
    if (filter.isHold) query = query.eq("is_hold", true);
    if (filter.rto) query = query.in("current_status", ["RTO_INITIATED", "RTO_DELIVERED"]);
    if (filter.onlyMasterAndActual) {
      query = query.neq("wizard_extras->>masterAwbNo", "").gt("actual_weight", 0);
    }

    const from = Math.max(0, offset);
    const to = from + Math.max(1, limit) - 1;
    const { data, error, count } = await query.order("book_date", { ascending: false }).range(from, to);
    if (error) return { rows: [], totalCount: 0, error: error.message };

    type ShipmentHit = {
      id: string;
      awb_no?: string | null;
      book_date?: string | null;
      airline?: string | null;
      shipper?: unknown;
      consignee?: unknown;
      pieces?: number | null;
      charge_weight?: number | string | null;
      customer_charges_total?: number | string | null;
      shipment_value?: number | string | null;
      payment_type?: string | null;
      forwarding_awb?: string | null;
      delivered_at?: string | null;
      wizard_extras?: unknown;
      destination_id?: string | null;
      delivery_vendor_id?: string | null;
    };
    const hits = (data ?? []) as ShipmentHit[];
    const destinationLookup = new Map<string, string>();
    const destIds = [...new Set(hits.map((row) => textOf(row.destination_id)).filter(Boolean))];
    if (destIds.length > 0) {
      const { data: destinations } = await supabase
        .from("destinations")
        .select("id, code")
        .in("id", destIds);
      for (const row of (destinations ?? []) as Array<{ id: string; code?: string | null }>) {
        destinationLookup.set(String(row.id), textOf(row.code));
      }
    }
    const vendors = await vendorLabels(hits.map((row) => textOf(row.delivery_vendor_id)));

    const awbs = hits.map((row) => textOf(row.awb_no)).filter(Boolean);
    const manifestByAwb = new Map<string, { runNo: string; kind: string }>();
    if (awbs.length > 0) {
      const { data: lines } = await supabase
        .from("manifest_lines")
        .select("awb_no, manifest_id")
        .in("awb_no", awbs)
        .is("deleted_at", null);
      const lineRows = (lines ?? []) as Array<{ awb_no?: string | null; manifest_id?: string | null }>;
      const manifestIds = [...new Set(lineRows.map((row) => textOf(row.manifest_id)).filter(Boolean))];
      const manifests = new Map<string, { no: string; kind: string }>();
      if (manifestIds.length > 0) {
        const { data: headers } = await supabase
          .from("manifests")
          .select("id, manifest_no, manifest_kind")
          .in("id", manifestIds);
        for (const row of (headers ?? []) as Array<{
          id: string;
          manifest_no?: string | null;
          manifest_kind?: string | null;
        }>) {
          manifests.set(String(row.id), {
            no: textOf(row.manifest_no),
            kind: textOf(row.manifest_kind),
          });
        }
      }
      for (const line of lineRows) {
        const awb = textOf(line.awb_no);
        const header = manifests.get(textOf(line.manifest_id));
        if (!awb || !header || manifestByAwb.has(awb)) continue;
        manifestByAwb.set(awb, { runNo: header.no, kind: header.kind });
      }
    }

    const rows: FilterResultRow[] = hits.map((item) => {
      const extras = asRecord(item.wizard_extras);
      const awb = textOf(item.awb_no);
      const manifest = manifestByAwb.get(awb);
      const vendor = vendors.get(textOf(item.delivery_vendor_id));
      const amount = item.customer_charges_total ?? item.shipment_value;
      return {
        id: String(item.id),
        masterAwbNo: showText(extras?.masterAwbNo),
        awbNo: showText(awb),
        bookingDate: showText(dateOnly(item.book_date)),
        runNo: showText(manifest?.runNo),
        airline: showText(item.airline),
        shipper: showText(partyName(item.shipper)),
        consignee: showText(partyName(item.consignee)),
        city: showText(partyCity(item.consignee)),
        destination: showText(destinationLookup.get(textOf(item.destination_id))),
        pieces: showNumber(item.pieces),
        chargeWeight: showNumber(item.charge_weight),
        totalAmount: showNumber(amount),
        forwarder: showText(vendor?.code),
        deliveryDate: dateOnly(item.delivered_at),
        paymentType: showText(item.payment_type),
        manifestType: showText(manifest?.kind),
      };
    });

    return { rows, totalCount: count ?? rows.length };
  } catch (err) {
    return {
      rows: [],
      totalCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch Volumetric Details sub-table for a given AWB.
 */
export async function getVolumetricDetails(awbNo: string, shipmentId?: string): Promise<VolumetricLine[]> {
  const clean = awbNo.trim();
  if (!clean && !shipmentId) return [];

  try {
    const id = await resolveShipmentId(clean, shipmentId);
    if (!id) return [];
    const { data, error } = await supabase
      .from("shipment_pieces")
      .select("child_awb, actual_weight_per_pc, pieces, length, breadth, height, vol_weight, charge_weight")
      .eq("shipment_id", id)
      .is("deleted_at", null)
      .order("seq");
    if (!error && data && data.length > 0) {
      return (data as Array<Record<string, unknown>>).map((item) => ({
        awbNo: clean,
        agentAwbNo: textOf(item.child_awb),
        actualWeight: showNumber(item.actual_weight_per_pc),
        pieces: showNumber(item.pieces),
        length: showNumber(item.length),
        width: showNumber(item.breadth),
        height: showNumber(item.height),
        volumetricWeight: showNumber(item.vol_weight),
        chargeWeight: showNumber(item.charge_weight),
      }));
    }

    const { data: header } = await supabase
      .from("shipments")
      .select("awb_no, actual_weight, pieces, vol_weight, charge_weight")
      .eq("id", id)
      .maybeSingle();
    const shipment = header as {
      awb_no?: string | null;
      actual_weight?: number | null;
      pieces?: number | null;
      vol_weight?: number | null;
      charge_weight?: number | null;
    } | null;
    if (!shipment) return [];
    const hasWeight =
      shipment.actual_weight != null || shipment.vol_weight != null || shipment.charge_weight != null;
    if (!hasWeight) return [];
    return [
      {
        awbNo: textOf(shipment.awb_no) || clean,
        agentAwbNo: "",
        actualWeight: showNumber(shipment.actual_weight),
        pieces: showNumber(shipment.pieces),
        length: "",
        width: "",
        height: "",
        volumetricWeight: showNumber(shipment.vol_weight),
        chargeWeight: showNumber(shipment.charge_weight),
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Fetch Inscan Details sub-table for a given AWB.
 */
export async function getInscanDetails(awbNo: string, shipmentId?: string): Promise<InscanLine[]> {
  const clean = awbNo.trim();
  if (!clean && !shipmentId) return [];

  try {
    let query = supabase
      .from("shipments")
      .select("awb_no, vendor_id, inscan_weight, inscan_length, inscan_breadth, inscan_height, inscan_vol_weight")
      .is("deleted_at", null);
    query = shipmentId ? query.eq("id", shipmentId) : query.eq("awb_no", clean);
    const { data, error } = await query.maybeSingle();
    if (error || !data) return [];
    const row = data as {
      awb_no?: string | null;
      vendor_id?: string | null;
      inscan_weight?: number | null;
      inscan_length?: number | null;
      inscan_breadth?: number | null;
      inscan_height?: number | null;
      inscan_vol_weight?: number | null;
    };
    const hasInscan =
      row.inscan_weight != null ||
      row.inscan_length != null ||
      row.inscan_breadth != null ||
      row.inscan_height != null ||
      row.inscan_vol_weight != null;
    if (!hasInscan) return [];
    const vendors = await vendorLabels([textOf(row.vendor_id)]);
    const vendor = vendors.get(textOf(row.vendor_id));
    return [
      {
        awbNo: textOf(row.awb_no) || clean,
        vendorNo: vendor?.code || "",
        weight: showNumber(row.inscan_weight),
        length: showNumber(row.inscan_length),
        breadth: showNumber(row.inscan_breadth),
        height: showNumber(row.inscan_height),
        volWeight: showNumber(row.inscan_vol_weight),
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Fetch Manifest Details sub-table for a given AWB.
 */
export async function getManifestDetails(awbNo: string, _shipmentId?: string): Promise<ManifestLine[]> {
  const clean = awbNo.trim();
  if (!clean) return [];

  const results: ManifestLine[] = [];

  try {
    const { data: mLines } = await supabase
      .from("manifest_lines")
      .select("seq, manifest_id, awb_no, bag_no, charge_weight, pieces, book_date")
      .eq("awb_no", clean);

    if (mLines && mLines.length > 0) {
      for (const line of mLines) {
        let manifestNo = "—";
        let manifestDate = line.book_date || "";

        if (line.manifest_id) {
          const { data: mHeader } = await supabase
            .from("manifests")
            .select("manifest_no, manifest_date")
            .eq("id", line.manifest_id)
            .maybeSingle();

          if (mHeader) {
            manifestNo = mHeader.manifest_no;
            manifestDate = mHeader.manifest_date || manifestDate;
          }
        }

        results.push({
          awbNo: line.awb_no || clean,
          maniNo: manifestNo,
          maniDate: manifestDate,
          bag: line.bag_no || "",
          weight: showNumber(line.charge_weight),
          pcs: showNumber(line.pieces),
        });
      }
    }
  } catch {
    /* Fallback */
  }

  return results;
}

/**
 * Fetch Manifest Inscan Details sub-table for a given AWB.
 */
export async function getManifestInscanDetails(
  awbNo: string,
  shipmentId?: string,
): Promise<ManifestInscanLine[]> {
  const clean = awbNo.trim();
  if (!clean && !shipmentId) return [];

  try {
    const id = await resolveShipmentId(clean, shipmentId);
    let scanQuery = supabase
      .from("manifest_scan_events")
      .select("awb_no, event_text, payload, created_at, manifest_id")
      .is("deleted_at", null);
    scanQuery = id ? scanQuery.eq("shipment_id", id) : scanQuery.eq("awb_no", clean);
    const { data: scans, error } = await scanQuery;
    if (!error && scans && scans.length > 0) {
      const scanRows = scans as Array<{
        awb_no?: string | null;
        event_text?: string | null;
        payload?: unknown;
        created_at?: string | null;
        manifest_id?: string | null;
      }>;
      const manifestIds = [...new Set(scanRows.map((row) => textOf(row.manifest_id)).filter(Boolean))];
      const manifestNos = new Map<string, string>();
      if (manifestIds.length > 0) {
        const { data: headers } = await supabase
          .from("manifests")
          .select("id, manifest_no")
          .in("id", manifestIds);
        for (const row of (headers ?? []) as Array<{ id: string; manifest_no?: string | null }>) {
          manifestNos.set(String(row.id), textOf(row.manifest_no));
        }
      }
      return scanRows.map((ev) => ({
        awbNo: textOf(ev.awb_no) || clean,
        maniNo: manifestNos.get(textOf(ev.manifest_id)) || "—",
        location: payloadText(ev.payload, ["service_center_code", "location"]),
        recDate: dateOnly(ev.created_at),
        inscanLocation: payloadText(ev.payload, ["inscan_location", "location"]),
        remark: textOf(ev.event_text),
        recWeight: payloadText(ev.payload, ["inscan_weight", "weight"]),
      }));
    }

    if (!id) return [];
    const { data: events, error: eventError } = await supabase
      .from("tracking_events")
      .select("status_text, remark, event_date, payload")
      .eq("shipment_id", id)
      .ilike("status_text", "%inscan%")
      .is("deleted_at", null);
    if (eventError || !events) return [];
    return (events as Array<{
      status_text?: string | null;
      remark?: string | null;
      event_date?: string | null;
      payload?: unknown;
    }>).map((ev) => ({
      awbNo: clean,
      maniNo: "—",
      location: payloadText(ev.payload, ["service_center_code", "location"]),
      recDate: dateOnly(ev.event_date),
      inscanLocation: payloadText(ev.payload, ["inscan_location", "location"]),
      remark: textOf(ev.remark) || textOf(ev.status_text),
      recWeight: payloadText(ev.payload, ["inscan_weight", "weight"]),
    }));
  } catch {
    return [];
  }
}

/**
 * Safely fetch all 4 sub-tables using Promise.allSettled.
 */
async function loadStoredAwbFields(awbNo: string, shipmentId?: string): Promise<SubTablesResult> {
  let query = supabase
    .from("shipments")
    .select(
      "id, customer_id, origin_destination_id, destination_id, product_id, vendor_id, delivery_vendor_id, field_executive_id, pickup_id, pod_user_id, book_date, pieces_unit, airline, service, payment_type, content, instruction, pieces, actual_weight, vol_weight, shipment_value, reference_no, is_commercial, is_oda, is_hold, consignee, wizard_extras, delivered_at",
    )
    .is("deleted_at", null);
  query = shipmentId ? query.eq("id", shipmentId) : query.eq("awb_no", awbNo);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return { ...EMPTY_SUB_TABLES };
  const row = data as Record<string, unknown>;
  const shipmentIdValue = textOf(row.id);

  let inscanWeight: number | null = null;
  let inscanRemark = "";
  let inscanQuery = supabase
    .from("shipments")
    .select("inscan_weight, inscan_remark")
    .is("deleted_at", null);
  inscanQuery = shipmentIdValue ? inscanQuery.eq("id", shipmentIdValue) : inscanQuery.eq("awb_no", awbNo);
  const { data: inscanRow } = await inscanQuery.maybeSingle();
  if (inscanRow) {
    const measured = inscanRow as { inscan_weight?: number | null; inscan_remark?: string | null };
    inscanWeight = measured.inscan_weight ?? null;
    inscanRemark = textOf(measured.inscan_remark);
  }

  const vendors = await vendorLabels([textOf(row.vendor_id), textOf(row.delivery_vendor_id)]);
  const vendor = vendors.get(textOf(row.vendor_id));
  const delivery = vendors.get(textOf(row.delivery_vendor_id));
  const extras = asRecord(row.wizard_extras);
  const proforma = asRecord(extras?.proforma);

  const customerId = textOf(row.customer_id);
  const originId = textOf(row.origin_destination_id);
  const destinationId = textOf(row.destination_id);
  const productId = textOf(row.product_id);
  const fieldExecutiveId = textOf(row.field_executive_id);
  const pickupId = textOf(row.pickup_id);

  const [customerRes, destinationRes, productRes, executiveRes, pickupRes, manifestLineRes, drsLineRes, podUserRes] =
    await Promise.all([
      customerId
        ? supabase.from("customers").select("code, name").eq("id", customerId).maybeSingle()
        : Promise.resolve({ data: null }),
      originId || destinationId
        ? supabase
            .from("destinations")
            .select("id, code")
            .in("id", [...new Set([originId, destinationId].filter(Boolean))])
        : Promise.resolve({ data: [] }),
      productId
        ? supabase.from("products").select("code, name, product_type_id").eq("id", productId).maybeSingle()
        : Promise.resolve({ data: null }),
      fieldExecutiveId
        ? supabase.from("field_executives").select("code, name").eq("id", fieldExecutiveId).maybeSingle()
        : Promise.resolve({ data: null }),
      pickupId
        ? supabase
            .from("pickups")
            .select("pickup_no, field_executive_id")
            .eq("id", pickupId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      shipmentIdValue
        ? supabase
            .from("manifest_lines")
            .select("manifest_id")
            .eq("shipment_id", shipmentIdValue)
            .is("deleted_at", null)
            .limit(1)
        : Promise.resolve({ data: [] }),
      shipmentIdValue
        ? supabase
            .from("drs_lines")
            .select("drs_id, eway_bill_no")
            .eq("shipment_id", shipmentIdValue)
            .is("deleted_at", null)
            .limit(1)
        : Promise.resolve({ data: [] }),
      textOf(row.pod_user_id)
        ? lookupAwbLabels({ userIds: [textOf(row.pod_user_id)], branchIds: [], fileIds: [] })
        : Promise.resolve({ users: {}, branches: {}, files: {} }),
    ]);

  const customer = customerRes.data as { code?: string | null; name?: string | null } | null;
  const destinationRows = (destinationRes.data ?? []) as Array<{ id: string; code?: string | null }>;
  const destinationCode = new Map(destinationRows.map((item) => [String(item.id), textOf(item.code)]));
  const product = productRes.data as {
    code?: string | null;
    name?: string | null;
    product_type_id?: string | null;
  } | null;
  let productTypeName = "";
  if (product?.product_type_id) {
    const { data: productType } = await supabase
      .from("product_types")
      .select("name")
      .eq("id", product.product_type_id)
      .maybeSingle();
    productTypeName = textOf((productType as { name?: string | null } | null)?.name);
  }
  const executive = executiveRes.data as { code?: string | null; name?: string | null } | null;
  const pickup = pickupRes.data as { pickup_no?: number | string | null; field_executive_id?: string | null } | null;
  let pickupExecutive = "";
  if (pickup?.field_executive_id && textOf(pickup.field_executive_id) !== fieldExecutiveId) {
    const { data: pickupFe } = await supabase
      .from("field_executives")
      .select("name")
      .eq("id", pickup.field_executive_id)
      .maybeSingle();
    pickupExecutive = textOf((pickupFe as { name?: string | null } | null)?.name);
  } else {
    pickupExecutive = textOf(executive?.name);
  }

  const manifestId = textOf(
    ((manifestLineRes.data ?? []) as Array<{ manifest_id?: string | null }>)[0]?.manifest_id,
  );
  let manifestNo = "";
  let manifestDate = "";
  let cdNo = "";
  let obcName = "";
  let manifestMaster = "";
  if (manifestId) {
    const { data: manifest } = await supabase
      .from("manifests")
      .select("manifest_no, manifest_date, cd_no, obc_name, master_awb_no")
      .eq("id", manifestId)
      .maybeSingle();
    const header = manifest as {
      manifest_no?: string | null;
      manifest_date?: string | null;
      cd_no?: string | null;
      obc_name?: string | null;
      master_awb_no?: string | null;
    } | null;
    manifestNo = textOf(header?.manifest_no);
    manifestDate = displayDate(header?.manifest_date);
    cdNo = textOf(header?.cd_no);
    obcName = textOf(header?.obc_name);
    manifestMaster = textOf(header?.master_awb_no);
  }

  const drsLine = ((drsLineRes.data ?? []) as Array<{ drs_id?: string | null; eway_bill_no?: string | null }>)[0];
  let drsNo = "";
  let drsVehicle = "";
  let drsDriver = "";
  if (drsLine?.drs_id) {
    const { data: drs } = await supabase
      .from("drs")
      .select("drs_no, vehicle_no, delivery_executive_id")
      .eq("id", drsLine.drs_id)
      .maybeSingle();
    const header = drs as {
      drs_no?: string | null;
      vehicle_no?: string | null;
      delivery_executive_id?: string | null;
    } | null;
    drsNo = textOf(header?.drs_no);
    drsVehicle = textOf(header?.vehicle_no);
    if (header?.delivery_executive_id) {
      const { data: driver } = await supabase
        .from("field_executives")
        .select("name")
        .eq("id", header.delivery_executive_id)
        .maybeSingle();
      drsDriver = textOf((driver as { name?: string | null } | null)?.name);
    }
  }

  const shipper = asRecord(row.shipper);
  const consignee = asRecord(row.consignee);
  const pin = textOf(consignee?.pincode);
  let pincodeType = "";
  if (pin) {
    const { data: pincode } = await supabase
      .from("pincodes")
      .select("is_oda")
      .eq("pin_code", pin)
      .is("deleted_at", null)
      .limit(1);
    const pinRow = ((pincode ?? []) as Array<{ is_oda?: boolean | null }>)[0];
    if (pinRow?.is_oda) pincodeType = "ODA";
  }

  const yesNo = (value: unknown) => (value === true ? "Yes" : value === false ? "No" : "");
  const details: Record<string, string> = {
    date: displayDate(row.book_date),
    dispatchDate: manifestDate,
    origin: destinationCode.get(originId) || textOf(shipper?.origin_code),
    destination: destinationCode.get(destinationId) || textOf(consignee?.origin_code),
    productType: textOf(row.pieces_unit),
    product: textOf(product?.name) || textOf(product?.code),
    vendor: vendor?.name || vendor?.code || "",
    service: textOf(row.service),
    shipValue: row.shipment_value == null ? "" : String(row.shipment_value),
    pcs: row.pieces == null ? "" : String(row.pieces),
    weight: row.actual_weight == null ? "" : String(row.actual_weight),
    vWgt: row.vol_weight == null ? "" : String(row.vol_weight),
    content: textOf(row.content),
    instruction: textOf(row.instruction),
    payment: textOf(row.payment_type),
    airline: textOf(row.airline),
    inscanWeight: inscanWeight == null ? "" : String(inscanWeight),
    hold: yesNo(row.is_hold),
    inscanRemark,
    refNo: textOf(row.reference_no),
    masterAwbNo: textOf(extras?.masterAwbNo) || manifestMaster,
    commercial: yesNo(row.is_commercial),
    oda: yesNo(row.is_oda),
    shipmentType: productTypeName,
    pincodeType,
    invoiceNo: textOf(proforma?.invoiceNo),
    customerInvoice: textOf(proforma?.invoiceNo),
    fieldExecutive: textOf(executive?.name) || textOf(executive?.code),
    csbType: textOf(proforma?.csbType),
    drsNo,
    drsVehicle,
    drsDriver,
    vehicleNo: drsVehicle,
    pickupNo: pickup?.pickup_no == null ? "" : String(pickup.pickup_no),
    pickupFieldExecutive: pickupExecutive,
    manifestNo,
  };

  return {
    ...EMPTY_SUB_TABLES,
    proforma: proformaFromExtras(row.wizard_extras),
    vendorName: vendor?.name || vendor?.code || "",
    deliveryVendor: delivery?.code || "",
    mastAwbNo: textOf(extras?.masterAwbNo) || manifestMaster,
    productType: textOf(row.pieces_unit),
    csbType: textOf(proforma?.csbType),
    inscanWeight: inscanWeight == null ? "" : String(inscanWeight),
    inscanRemark,
    customerDetails: [textOf(customer?.code), textOf(customer?.name)].filter(Boolean).join("\n"),
    podUser: podUserRes.users[textOf(row.pod_user_id)] || "",
    podStatusTime: clockDigits(row.delivered_at),
    cdNo,
    obcName,
    dispatchDate: manifestDate,
    details,
  };
}

export async function fetchAwbSubTables(awbNo: string, shipmentId?: string): Promise<SubTablesResult> {
  const clean = awbNo.trim();
  if (!clean && !shipmentId) return { ...EMPTY_SUB_TABLES };

  const [vRes, iRes, mRes, miRes, storedRes] = await Promise.allSettled([
    getVolumetricDetails(clean, shipmentId),
    getInscanDetails(clean, shipmentId),
    getManifestDetails(clean, shipmentId),
    getManifestInscanDetails(clean, shipmentId),
    loadStoredAwbFields(clean, shipmentId),
  ]);
  const stored = storedRes.status === "fulfilled" ? storedRes.value : { ...EMPTY_SUB_TABLES };

  return {
    ...stored,
    volumetric: vRes.status === "fulfilled" ? vRes.value : [],
    inscan: iRes.status === "fulfilled" ? iRes.value : [],
    manifest: mRes.status === "fulfilled" ? mRes.value : [],
    manifestInscan: miRes.status === "fulfilled" ? miRes.value : [],
  };
}
