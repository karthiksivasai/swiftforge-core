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

export type SubTablesResult = {
  volumetric: VolumetricLine[];
  inscan: InscanLine[];
  manifest: ManifestLine[];
  manifestInscan: ManifestInscanLine[];
};

/**
 * Execute real database filter query against Supabase shipments table.
 */
export async function searchAwbShipments(
  filter: FilterForm,
  limit = 200,
): Promise<SearchAwbShipmentsResult> {
  try {
    let query = supabase
      .from("shipments")
      .select("*", { count: "exact" })
      .is("deleted_at", null);

    // 1. Date Range Filters
    if (filter.bookingFromDate) {
      query = query.gte("booking_date", filter.bookingFromDate);
    }
    if (filter.bookingToDate) {
      query = query.lte("booking_date", filter.bookingToDate);
    }
    if (filter.statusFromDate) {
      query = query.gte("updated_at", `${filter.statusFromDate}T00:00:00Z`);
    }
    if (filter.statusToDate) {
      query = query.lte("updated_at", `${filter.statusToDate}T23:59:59Z`);
    }

    // 2. Identities & Codes
    if (filter.referenceNo.trim()) {
      query = query.ilike("reference_no", `%${filter.referenceNo.trim()}%`);
    }
    const customerCode = filter.customer.code.trim() || filter.customer.name.trim();
    if (customerCode) {
      query = query.or(`customer_code.ilike.%${customerCode}%,customer_name.ilike.%${customerCode}%`);
    }
    const vendorCode = filter.vendor.code.trim() || filter.vendor.name.trim();
    if (vendorCode) {
      query = query.or(`vendor_code.ilike.%${vendorCode}%,vendor_name.ilike.%${vendorCode}%`);
    }
    const originCode = filter.origin.code.trim() || filter.origin.name.trim();
    if (originCode) {
      query = query.or(`origin_code.ilike.%${originCode}%,origin_name.ilike.%${originCode}%`);
    }
    const destCode = filter.destination.code.trim() || filter.destination.name.trim();
    if (destCode) {
      query = query.or(`destination_code.ilike.%${destCode}%,destination_name.ilike.%${destCode}%`);
    }
    const delVendorCode = filter.deliveryVendor.code.trim() || filter.deliveryVendor.name.trim();
    if (delVendorCode) {
      query = query.or(`delivery_vendor_code.ilike.%${delVendorCode}%,delivery_vendor_name.ilike.%${delVendorCode}%`);
    }
    if (filter.zipCode.trim()) {
      query = query.ilike("consignee_pincode", `%${filter.zipCode.trim()}%`);
    }
    if (filter.forwardingNo.trim()) {
      query = query.ilike("forwarding_no", `%${filter.forwardingNo.trim()}%`);
    }
    if (filter.bagNo.trim()) {
      query = query.ilike("bag_no", `%${filter.bagNo.trim()}%`);
    }

    // 3. Text Filters
    if (filter.shipper.trim()) {
      query = query.ilike("shipper_name", `%${filter.shipper.trim()}%`);
    }
    if (filter.consignee.trim()) {
      query = query.ilike("consignee_name", `%${filter.consignee.trim()}%`);
    }
    if (filter.consigneeCity.trim()) {
      query = query.ilike("consignee_city", `%${filter.consigneeCity.trim()}%`);
    }
    if (filter.consigneePhone.trim()) {
      query = query.ilike("consignee_phone", `%${filter.consigneePhone.trim()}%`);
    }
    if (filter.airline.trim()) {
      query = query.or(`airline_code.ilike.%${filter.airline.trim()}%,airline_name.ilike.%${filter.airline.trim()}%`);
    }
    if (filter.service.trim()) {
      query = query.ilike("service", `%${filter.service.trim()}%`);
    }

    // 4. Enums & Types
    if (filter.paymentType) {
      query = query.eq("payment_type", filter.paymentType);
    }
    if (filter.product) {
      query = query.eq("product", filter.product);
    }
    if (filter.productType) {
      query = query.eq("product_type", filter.productType);
    }
    if (filter.csbType) {
      query = query.eq("csb_type", filter.csbType);
    }
    if (filter.status && filter.status !== "All") {
      if (filter.status === "Delivered") {
        query = query.eq("current_status", "DELIVERED");
      } else if (filter.status === "UnDelivered") {
        query = query.neq("current_status", "DELIVERED");
      } else if (filter.status === "Pending") {
        query = query.in("current_status", ["BOOKED", "IN_TRANSIT", "OUT_FOR_DELIVERY"]);
      } else {
        query = query.eq("current_status", filter.status);
      }
    }

    // 5. Ranges
    if (filter.weightFrom && !Number.isNaN(Number(filter.weightFrom))) {
      query = query.gte("charge_weight", Number(filter.weightFrom));
    }
    if (filter.weightTo && !Number.isNaN(Number(filter.weightTo))) {
      query = query.lte("charge_weight", Number(filter.weightTo));
    }

    // 6. Checkbox Flags
    if (filter.isHold) {
      query = query.eq("is_hold", true);
    }
    if (filter.rto) {
      query = query.eq("current_status", "RTO");
    }

    const { data, error, count } = await query
      .order("booking_date", { ascending: false })
      .limit(limit);

    if (error) {
      return { rows: [], totalCount: 0, error: error.message };
    }

    const rows: FilterResultRow[] = (data || []).map((item) => ({
      id: item.id,
      masterAwbNo: item.master_awb_no || "—",
      awbNo: item.awb_no || "—",
      bookingDate: item.booking_date || "—",
      runNo: item.run_no || item.manifest_no || "—",
      airline: item.airline_code || "—",
      shipper: item.shipper_name || "—",
      consignee: item.consignee_name || "—",
      city: item.consignee_city || "—",
      destination: item.destination_code || "—",
      pieces: String(item.pieces ?? 1),
      chargeWeight: String(item.charge_weight ?? "0.000"),
      totalAmount: String(item.total_amount ?? item.amount ?? "0.00"),
      forwarder: item.delivery_vendor_code || item.vendor_code || "—",
      deliveryDate: item.delivery_date || "",
      paymentType: item.payment_type || "Credit",
      manifestType: item.manifest_type || "Outgoing",
    }));

    return {
      rows,
      totalCount: count ?? rows.length,
    };
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
  if (!clean) return [];

  try {
    const { data: vData } = await supabase
      .from("shipment_volumetrics")
      .select("*")
      .or(`awb_no.eq.${clean}${shipmentId ? `,shipment_id.eq.${shipmentId}` : ""}`);

    if (vData && vData.length > 0) {
      return vData.map((item) => ({
        awbNo: item.awb_no || clean,
        agentAwbNo: item.agent_awb_no || "",
        actualWeight: String(item.actual_weight ?? "0.000"),
        pieces: String(item.pieces ?? "1"),
        length: String(item.length ?? "0"),
        width: String(item.width ?? "0"),
        height: String(item.height ?? "0"),
        volumetricWeight: String(item.volumetric_weight ?? "0.000"),
        chargeWeight: String(item.charge_weight ?? "0.000"),
      }));
    }
  } catch {
    /* Fallback */
  }

  try {
    const { data: sData } = await supabase
      .from("shipments")
      .select("awb_no, actual_weight, charge_weight, pieces, length, width, height, volumetric_weight")
      .eq("awb_no", clean)
      .maybeSingle();

    if (sData && (sData.volumetric_weight || sData.length)) {
      return [
        {
          awbNo: sData.awb_no || clean,
          agentAwbNo: "",
          actualWeight: String(sData.actual_weight ?? "0.000"),
          pieces: String(sData.pieces ?? "1"),
          length: String(sData.length ?? "0"),
          width: String(sData.width ?? "0"),
          height: String(sData.height ?? "0"),
          volumetricWeight: String(sData.volumetric_weight ?? "0.000"),
          chargeWeight: String(sData.charge_weight ?? "0.000"),
        },
      ];
    }
  } catch {
    /* Fallback */
  }

  return [];
}

/**
 * Fetch Inscan Details sub-table for a given AWB.
 */
export async function getInscanDetails(awbNo: string, _shipmentId?: string): Promise<InscanLine[]> {
  const clean = awbNo.trim();
  if (!clean) return [];

  try {
    const { data: sData } = await supabase
      .from("shipments")
      .select("awb_no, vendor_code, actual_weight, length, width, height, volumetric_weight")
      .eq("awb_no", clean)
      .maybeSingle();

    if (sData) {
      return [
        {
          awbNo: sData.awb_no || clean,
          vendorNo: sData.vendor_code || "—",
          weight: String(sData.actual_weight ?? "0.000"),
          length: String(sData.length ?? "0"),
          breadth: String(sData.width ?? "0"),
          height: String(sData.height ?? "0"),
          volWeight: String(sData.volumetric_weight ?? "0.000"),
        },
      ];
    }
  } catch {
    /* Fallback */
  }

  return [];
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
        let manifestNo = String(line.manifest_id);
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
          bag: line.bag_no || "1",
          weight: String(line.charge_weight ?? "0.000"),
          pcs: String(line.pieces ?? "1"),
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
export async function getManifestInscanDetails(awbNo: string, _shipmentId?: string): Promise<ManifestInscanLine[]> {
  const clean = awbNo.trim();
  if (!clean) return [];

  const results: ManifestInscanLine[] = [];

  try {
    const { data: events } = await supabase
      .from("tracking_events")
      .select("id, awb_no, event_name, location, remarks, created_at")
      .eq("awb_no", clean)
      .ilike("event_name", "%inscan%");

    if (events && events.length > 0) {
      for (const ev of events) {
        results.push({
          awbNo: ev.awb_no || clean,
          maniNo: "—",
          location: ev.location || "HYD",
          recDate: ev.created_at ? ev.created_at.split("T")[0] : "",
          inscanLocation: ev.location || "HYD HUB",
          remark: ev.remarks || "",
          recWeight: "0.000",
        });
      }
    }
  } catch {
    /* Fallback */
  }

  return results;
}

/**
 * Safely fetch all 4 sub-tables using Promise.allSettled.
 */
export async function fetchAwbSubTables(awbNo: string, shipmentId?: string): Promise<SubTablesResult> {
  const clean = awbNo.trim();
  if (!clean) {
    return { volumetric: [], inscan: [], manifest: [], manifestInscan: [] };
  }

  const [vRes, iRes, mRes, miRes] = await Promise.allSettled([
    getVolumetricDetails(clean, shipmentId),
    getInscanDetails(clean, shipmentId),
    getManifestDetails(clean, shipmentId),
    getManifestInscanDetails(clean, shipmentId),
  ]);

  return {
    volumetric: vRes.status === "fulfilled" ? vRes.value : [],
    inscan: iRes.status === "fulfilled" ? iRes.value : [],
    manifest: mRes.status === "fulfilled" ? mRes.value : [],
    manifestInscan: miRes.status === "fulfilled" ? miRes.value : [],
  };
}
