import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Search, MapPin, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FieldWrapper,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
  downloadCsv,
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { getShipmentTracking } from "@/lib/transactions/resources/tracking";
import { mapTrackingToAwbQuery } from "@/lib/transactions/trackingUiMap";
import { getCarrierAdapter } from "@/lib/integrations/adapter";
import {
  fetchShipmentCarrierMeta,
  normalizeVendorToCarrierCode,
} from "@/lib/integrations/carriers";

type LookupPair = { code: string; name: string };
type QueryTab = "shipping" | "additional" | "filter";

type ProgressLine = {
  userId: string;
  date: string;
  time: string;
  serviceCenter: string;
  statusDetails: string;
};

type CommentLine = {
  userId: string;
  date: string;
  time: string;
  comment: string;
  file: string;
};

type ShipmentLogLine = {
  userId: string;
  date: string;
  time: string;
  message: string;
};

type VolumetricLine = {
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

type ProformaLine = {
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

type InscanLine = {
  awbNo: string;
  vendorNo: string;
  weight: string;
  length: string;
  breadth: string;
  height: string;
  volWeight: string;
};

type ManifestLine = {
  awbNo: string;
  maniNo: string;
  maniDate: string;
  bag: string;
  weight: string;
  pcs: string;
};

type ManifestInscanLine = {
  awbNo: string;
  maniNo: string;
  location: string;
  recDate: string;
  inscanLocation: string;
  remark: string;
  recWeight: string;
};

type StatusLine = {
  user: string;
  date: string;
  time: string;
  status: string;
  remarks: string;
};

type AwbQueryRecord = {
  awbNo: string;
  lastAwbNo: string;
  podUser: string;
  userId: string;
  customerDetails: string;
  shipperDetails: string;
  consigneeDetails: string;
  podStatus: string;
  podStatusDate: string;
  podStatusTime: string;
  podReceiverName: string;
  podRemark: string;
  podReceiveDate: string;
  vendorName: string;
  deliveryVendor: string;
  forwardingAwb: string;
  deliveryAwb: string;
  returnAwbNo: string;
  flightNo: string;
  airlines: string;
  mastAwbNo: string;
  cdNo: string;
  obcName: string;
  shipmentDetails: Record<string, string>;
  progress: ProgressLine[];
  comments: CommentLine[];
  shipmentLog: ShipmentLogLine[];
  volumetric: VolumetricLine[];
  proforma: ProformaLine[];
  inscan: InscanLine[];
  manifest: ManifestLine[];
  manifestInscan: ManifestInscanLine[];
  statusDetails: StatusLine[];
  shipmentId?: string;
  rowVersion?: number;
  carrierProviderCode?: string;
  carrierBookingRef?: string;
  carrierTrackingNo?: string;
  carrierBookingStatus?: string;
  carrierLabelFileId?: string;
};

type FilterForm = {
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

type FilterResultRow = {
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

const QUERY_TABS: { value: QueryTab; label: string }[] = [
  { value: "shipping", label: "Shipping Info" },
  { value: "additional", label: "Additional Info" },
  { value: "filter", label: "Additional Filter" },
];

const PAYMENT_TYPES = ["Cash", "Cheque", "Credit", "To Pay"] as const;
const PRODUCT_OPTIONS = ["Domestic", "International", "Local", "Import"] as const;
const PRODUCT_TYPES = ["DOX", "SPX", "NDOX"] as const;
const CSB_TYPES = [
  "CSB 4",
  "CSB 5",
  "CSB 3",
  "COMMERCIAL",
  "ECM DOX",
  "ECM SPX",
  "CBE XII",
  "CBE XIII",
] as const;
const STATUS_OPTIONS = ["All", "Delivered", "UnDelivered", "Pending"] as const;

const SHIPMENT_DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "dispatchDate", label: "Dispatch Date" },
  { key: "origin", label: "Origin" },
  { key: "destination", label: "Destination" },
  { key: "productType", label: "Product Type" },
  { key: "product", label: "Product" },
  { key: "vendor", label: "Vendor" },
  { key: "service", label: "Service" },
  { key: "shipValue", label: "Ship Value" },
  { key: "pcs", label: "PCS" },
  { key: "weight", label: "Weight" },
  { key: "vWgt", label: "V.Wgt" },
  { key: "content", label: "Content" },
  { key: "instruction", label: "Instruction" },
  { key: "cod", label: "COD" },
  { key: "manifestNo", label: "Manifest No." },
  { key: "invoiceNo", label: "Invoice No." },
  { key: "payment", label: "Payment" },
  { key: "inscanWeight", label: "Inscan Weight" },
  { key: "inscanRemark", label: "Inscan Remark" },
  { key: "refNo", label: "Ref.No." },
  { key: "masterAwbNo", label: "MasterAWB No." },
  { key: "commercial", label: "Commercial" },
  { key: "oda", label: "ODA" },
  { key: "shipmentType", label: "Shipment Type" },
  { key: "pincodeType", label: "Pincode Type" },
  { key: "customerInvoice", label: "Customer Invoice" },
  { key: "csbType", label: "CSB Type" },
  { key: "drsNo", label: "DRS No" },
  { key: "vehicleNo", label: "Vehicle No" },
  { key: "remark", label: "Remark" },
  { key: "fieldExecutive", label: "Field Executive" },
];

const FILTER_RESULT_HEADERS = [
  "Master AWB No.",
  "AWB No.",
  "Booking Date",
  "Run No.",
  "Airline",
  "Shipper",
  "Consignee",
  "City",
  "Destination",
  "Pieces",
  "Charge Weight",
  "Total Amount",
  "Forwarder",
  "Delivery Date",
  "Payment Type",
  "Manifest Type",
] as const;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const emptyFilter = (): FilterForm => ({
  bookingFromDate: "",
  bookingToDate: "",
  statusFromDate: "",
  statusToDate: "",
  referenceNo: "",
  customer: emptyPair(),
  vendor: emptyPair(),
  origin: emptyPair(),
  destination: emptyPair(),
  zipCode: "",
  forwardingNo: "",
  product: "",
  deliveryVendor: emptyPair(),
  consignee: "",
  runNoTo: "",
  consigneeCity: "",
  csbType: "",
  onlyPart: false,
  vendorAlt: emptyPair(),
  paymentType: "",
  bagNo: "",
  deliveryService: emptyPair(),
  consigneePhone: "",
  weightFrom: "",
  onlyMasterAndActual: false,
  service: "",
  airline: "",
  status: "",
  shipper: "",
  runNoFrom: "",
  weightTo: "",
  isHold: false,
  productType: "",
  rto: false,
});

const buildSeedRecord = (awbNo: string): AwbQueryRecord => ({
  awbNo,
  lastAwbNo: "30403927",
  podUser: "SURYAA",
  userId: "SURYAA",
  customerDetails: "TPC ADDANKI\nCode: TPCADDA\nHYDERABAD, TELANGANA\nPhone: 9848012345",
  shipperDetails: "ELURI RAJESH\nPlot 12, Industrial Area\nHYDERABAD — 500032",
  consigneeDetails: "ELURI SIVARAMAKRISHNA\n42 Collins Street\nMELBOURNE, AUSTRALIA — 3000",
  podStatus: "In Transit",
  podStatusDate: "04/07/2026",
  podStatusTime: "1430",
  podReceiverName: "",
  podRemark: "",
  podReceiveDate: "",
  vendorName: "DTDC AUSTRALIA",
  deliveryVendor: "DTAU",
  forwardingAwb: `FWD${awbNo}`,
  deliveryAwb: `DLV${awbNo}`,
  returnAwbNo: "",
  flightNo: "QF-840",
  airlines: "QANTAS",
  mastAwbNo: "80738142580",
  cdNo: "CD-24002",
  obcName: "DTDC AUSTRALIA",
  shipmentDetails: {
    date: "04/07/2026",
    dispatchDate: "04/07/2026",
    origin: "HYD",
    destination: "AU",
    productType: "SPX",
    product: "International",
    vendor: "DTAU",
    service: "EXPRESS",
    shipValue: "7185.00",
    pcs: "1",
    weight: "36.000",
    vWgt: "36.000",
    content: "Documents",
    instruction: "Handle with care",
    cod: "0.00",
    manifestNo: "0044",
    invoiceNo: "INV-2026-441",
    payment: "Credit",
    inscanWeight: "36.000",
    inscanRemark: "",
    refNo: `REF${awbNo}`,
    masterAwbNo: "80738142580",
    commercial: "Yes",
    oda: "No",
    shipmentType: "Export",
    pincodeType: "Metro",
    customerInvoice: "INV-2026-441",
    csbType: "CSB 4",
    drsNo: "",
    vehicleNo: "",
    remark: "",
    fieldExecutive: "",
  },
  progress: [
    {
      userId: "SURYAA",
      date: "04/07/2026",
      time: "1015",
      serviceCenter: "HYD",
      statusDetails: "AWB Booked",
    },
    {
      userId: "SURYAA",
      date: "04/07/2026",
      time: "1130",
      serviceCenter: "HYD",
      statusDetails: "Shipment Picked Up",
    },
    {
      userId: "OPS01",
      date: "04/07/2026",
      time: "1430",
      serviceCenter: "HYD",
      statusDetails: "Departed From Facility",
    },
  ],
  comments: [
    { userId: "SURYAA", date: "04/07/2026", time: "1016", comment: "Booking confirmed", file: "" },
  ],
  shipmentLog: [
    { userId: "SURYAA", date: "04/07/2026", time: "1015", message: "AWB entry created" },
    { userId: "OPS01", date: "04/07/2026", time: "1430", message: "Manifest 0044 assigned" },
  ],
  volumetric: [
    {
      awbNo,
      agentAwbNo: "",
      actualWeight: "36.000",
      pieces: "1",
      length: "40",
      width: "30",
      height: "20",
      volumetricWeight: "36.000",
      chargeWeight: "36.000",
    },
  ],
  proforma: [
    {
      boxNo: "1",
      packageNo: "1",
      description: "Documents",
      hsnCode: "4911",
      quantity: "1",
      unit: "PCS",
      rate: "7185.00",
      amount: "7185.00",
      weight: "36.000",
    },
  ],
  inscan: [
    {
      awbNo,
      vendorNo: "DTAU",
      weight: "36.000",
      length: "40",
      breadth: "30",
      height: "20",
      volWeight: "36.000",
    },
  ],
  manifest: [
    { awbNo, maniNo: "0044", maniDate: "04/07/2026", bag: "1", weight: "36.000", pcs: "1" },
  ],
  manifestInscan: [
    {
      awbNo,
      maniNo: "0044",
      location: "HYD",
      recDate: "04/07/2026",
      inscanLocation: "HYD HUB",
      remark: "",
      recWeight: "36.000",
    },
  ],
  statusDetails: [
    { user: "SURYAA", date: "04/07/2026", time: "1015", status: "Booked", remarks: "AWB created" },
    {
      user: "OPS01",
      date: "04/07/2026",
      time: "1430",
      status: "In Transit",
      remarks: "Manifest assigned",
    },
  ],
});

const SEED_AWB_NUMBERS = [
  "30403918",
  "30403919",
  "30403920",
  "30403921",
  "30403922",
  "30403923",
  "30403924",
  "30403925",
  "30403926",
  "30403927",
];

const seedFilterRows = (): FilterResultRow[] =>
  SEED_AWB_NUMBERS.map((awbNo, index) => ({
    id: crypto.randomUUID(),
    masterAwbNo: "80738142580",
    awbNo,
    bookingDate: "04/07/2026",
    runNo: String(index + 1),
    airline: index % 2 === 0 ? "QF" : "AI",
    shipper: "ELURI RAJESH",
    consignee: "ELURI SIVARAMAKRISHNA",
    city: index % 2 === 0 ? "MELBOURNE" : "NEW YORK",
    destination: index % 2 === 0 ? "AU" : "US",
    pieces: "1",
    chargeWeight: "36.000",
    totalAmount: "7185.00",
    forwarder: "DTAU",
    deliveryDate: "",
    paymentType: "Credit",
    manifestType: "Outgoing",
  }));

export const Route = createFileRoute("/transaction/tracking/awb-query")({
  head: () => ({
    meta: [
      { title: "AWB Query — Transaction — Courier ERP" },
      { name: "description", content: "Search and view comprehensive AWB shipment information." },
    ],
  }),
  component: AwbQueryPage,
});

function AwbQueryPage() {
  const { isAuthenticated: authed } = useAuth();
  const [activeTab, setActiveTab] = useState<QueryTab>("shipping");
  const [awbInput, setAwbInput] = useState("");
  const [lastAwbNo, setLastAwbNo] = useState("");
  const [queryResult, setQueryResult] = useState<AwbQueryRecord | null>(null);
  const [filterForm, setFilterForm] = useState<FilterForm>(emptyFilter());
  const [filterResults, setFilterResults] = useState<FilterResultRow[]>([]);
  const [filterSearched, setFilterSearched] = useState(false);
  const [filterPage, setFilterPage] = useState(1);

  const patchFilter = (patch: Partial<FilterForm>) => setFilterForm((f) => ({ ...f, ...patch }));

  const runAwbQuery = async (awb?: string) => {
    const q = (awb ?? awbInput).trim();
    if (!q) return toast.error("AWB No. is required");

    if (!authed) {
      if (!SEED_AWB_NUMBERS.includes(q)) {
        setQueryResult(null);
        return toast.error(`No record found for AWB ${q}`);
      }
      const record = buildSeedRecord(q);
      setQueryResult(record);
      setLastAwbNo(q);
      setAwbInput(q);
      return toast.success(`Loaded AWB ${q} (demo)`);
    }

    try {
      const result = await getShipmentTracking(q);
      const mapped = mapTrackingToAwbQuery(result);
      if (!mapped) {
        setQueryResult(null);
        return toast.error(`No record found for AWB ${q}`);
      }
      let carrierMeta = {
        carrierProviderCode: mapped.carrierProviderCode,
        carrierBookingRef: mapped.carrierBookingRef,
        carrierTrackingNo: mapped.carrierTrackingNo,
        carrierBookingStatus: mapped.carrierBookingStatus,
        carrierLabelFileId: mapped.carrierLabelFileId,
        rowVersion: mapped.rowVersion,
      };
      if (mapped.shipmentId) {
        try {
          const meta = await fetchShipmentCarrierMeta(mapped.shipmentId);
          if (meta) {
            carrierMeta = {
              carrierProviderCode: meta.carrier_provider_code ?? undefined,
              carrierBookingRef: meta.carrier_booking_ref ?? undefined,
              carrierTrackingNo: meta.carrier_tracking_no ?? undefined,
              carrierBookingStatus: meta.carrier_booking_status ?? undefined,
              carrierLabelFileId: meta.carrier_label_file_id ?? undefined,
              rowVersion: meta.row_version,
            };
          }
        } catch {
          /* carrier columns optional if migration not applied yet */
        }
      }
      setQueryResult({
        awbNo: mapped.awbNo,
        lastAwbNo: mapped.lastAwbNo,
        podUser: mapped.podUser,
        userId: mapped.userId,
        customerDetails: mapped.customerDetails,
        shipperDetails: mapped.shipperDetails,
        consigneeDetails: mapped.consigneeDetails,
        podStatus: mapped.podStatus,
        podStatusDate: mapped.podStatusDate,
        podStatusTime: mapped.podStatusTime,
        podReceiverName: mapped.podReceiverName,
        podRemark: mapped.podRemark,
        podReceiveDate: mapped.podReceiveDate,
        vendorName: mapped.vendorName,
        deliveryVendor: mapped.deliveryVendor,
        forwardingAwb: mapped.forwardingAwb,
        deliveryAwb: mapped.deliveryAwb,
        returnAwbNo: mapped.returnAwbNo,
        flightNo: mapped.flightNo,
        airlines: mapped.airlines,
        mastAwbNo: mapped.mastAwbNo,
        cdNo: mapped.cdNo,
        obcName: mapped.obcName,
        shipmentDetails: mapped.shipmentDetails,
        progress: mapped.progress,
        comments: mapped.comments,
        shipmentLog: mapped.shipmentLog,
        volumetric: [],
        proforma: [],
        inscan: [],
        manifest: [],
        manifestInscan: [],
        statusDetails: mapped.statusDetails,
        shipmentId: mapped.shipmentId,
        ...carrierMeta,
      });
      setLastAwbNo(q);
      setAwbInput(q);
      toast.success(`Loaded AWB ${q}`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const handleRepeat = () => {
    if (!lastAwbNo) return toast.info("No previous AWB to repeat");
    void runAwbQuery(lastAwbNo);
  };

  const resolveQueryCarrier = () =>
    queryResult?.carrierProviderCode ||
    normalizeVendorToCarrierCode(queryResult?.vendorName) ||
    "FEDEX";

  const handleQueryCarrierTrack = async () => {
    if (!queryResult?.shipmentId) return toast.error("Load an AWB first");
    if (!authed) return toast.success("Tracking refreshed (demo)");
    try {
      const result = await getCarrierAdapter(resolveQueryCarrier()).track({
        shipmentId: queryResult.shipmentId,
        rowVersion: queryResult.rowVersion ?? 1,
      });
      if (result.status !== "SUCCESS") throw new Error(result.message);
      toast.success("Carrier tracking refreshed");
      await runAwbQuery(queryResult.awbNo);
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  const handleQueryCarrierLabel = async () => {
    if (!queryResult?.shipmentId) return toast.error("Load an AWB first");
    if (!authed) return toast.success("Label metadata ready (demo)");
    try {
      const result = await getCarrierAdapter(resolveQueryCarrier()).label({
        shipmentId: queryResult.shipmentId,
        rowVersion: queryResult.rowVersion ?? 1,
      });
      if (result.status !== "SUCCESS") throw new Error(result.message);
      toast.success(
        `Label metadata: ${result.data?.original_name ?? result.data?.file_id ?? "saved"}`,
      );
      await runAwbQuery(queryResult.awbNo);
    } catch (e) {
      toast.error(toErrorMessage(e));
    }
  };

  const handleFilterSearch = () => {
    let rows = seedFilterRows();
    const f = filterForm;
    if (f.bookingFromDate) {
      rows = rows.filter((r) => r.bookingDate >= formatDisplayDate(f.bookingFromDate));
    }
    if (f.bookingToDate) {
      rows = rows.filter((r) => r.bookingDate <= formatDisplayDate(f.bookingToDate));
    }
    if (f.customer.name.trim()) {
      const q = f.customer.name.toLowerCase();
      rows = rows.filter(
        (r) => r.shipper.toLowerCase().includes(q) || r.consignee.toLowerCase().includes(q),
      );
    }
    if (f.origin.code.trim()) rows = rows.filter((r) => r.destination.includes(f.origin.code));
    if (f.destination.code.trim())
      rows = rows.filter((r) => r.destination.includes(f.destination.code));
    if (f.paymentType) rows = rows.filter((r) => r.paymentType === f.paymentType);
    if (f.status && f.status !== "All") {
      rows = rows.filter((r) => (f.status === "Delivered" ? r.deliveryDate : !r.deliveryDate));
    }
    if (f.shipper.trim())
      rows = rows.filter((r) => r.shipper.toLowerCase().includes(f.shipper.toLowerCase()));
    if (f.consignee.trim())
      rows = rows.filter((r) => r.consignee.toLowerCase().includes(f.consignee.toLowerCase()));
    setFilterResults(rows);
    setFilterSearched(true);
    setFilterPage(1);
    toast.success(`Found ${rows.length} record(s)`);
  };

  const handleFilterReset = () => {
    setFilterForm(emptyFilter());
    setFilterResults([]);
    setFilterSearched(false);
    setFilterPage(1);
    toast.success("Filters reset");
  };

  const handleFilterExport = () => {
    if (filterResults.length === 0) return toast.error("No results to export");
    downloadCsv(
      "awb-query-filter.csv",
      [...FILTER_RESULT_HEADERS],
      filterResults.map((r) => [
        r.masterAwbNo,
        r.awbNo,
        r.bookingDate,
        r.runNo,
        r.airline,
        r.shipper,
        r.consignee,
        r.city,
        r.destination,
        r.pieces,
        r.chargeWeight,
        r.totalAmount,
        r.forwarder,
        r.deliveryDate,
        r.paymentType,
        r.manifestType,
      ]),
    );
    toast.success("Exported awb-query-filter.csv");
  };

  const filterTotalPages = Math.max(1, Math.ceil(filterResults.length / PAGE_SIZE));
  const filterCurrentPage = Math.min(filterPage, filterTotalPages);
  const filterPageRows = filterResults.slice(
    (filterCurrentPage - 1) * PAGE_SIZE,
    filterCurrentPage * PAGE_SIZE,
  );
  const filterStart = filterResults.length === 0 ? 0 : (filterCurrentPage - 1) * PAGE_SIZE + 1;
  const filterEnd = Math.min(filterCurrentPage * PAGE_SIZE, filterResults.length);

  const metaLabels = useMemo(
    () => ({
      lastAwbNo: queryResult?.lastAwbNo || lastAwbNo || "—",
      podUser: queryResult?.podUser || "SURYAA",
      userId: queryResult?.userId || "SURYAA",
    }),
    [queryResult, lastAwbNo],
  );

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Tracking / Delivery", "AWB Query"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">AWB Query</h1>
        <p className="text-sm text-muted-foreground">
          Search AWB records and view shipping, additional, and filter details.
          {authed ? " Connected to live backend." : " Demo mode — sign in for live tracking."}
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as QueryTab)}>
          <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="h-auto gap-1 bg-transparent p-0">
              {QUERY_TABS.map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-full px-4 py-1.5 data-[state=active]:bg-sidebar data-[state=active]:text-sidebar-foreground data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex min-w-0 flex-wrap items-end gap-3 lg:justify-end">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Last AWB No. :{" "}
                  <span className="font-medium text-foreground">{metaLabels.lastAwbNo}</span>
                </span>
                <span>
                  POD User :{" "}
                  <span className="font-medium text-foreground">{metaLabels.podUser}</span>
                </span>
                <span>
                  User ID : <span className="font-medium text-foreground">{metaLabels.userId}</span>
                </span>
              </div>
              <FieldWrapper label="AWB No." className="min-w-[10rem]">
                <div className="flex gap-1">
                  <Input
                    value={awbInput}
                    onChange={(e) => setAwbInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void runAwbQuery();
                      }
                    }}
                    className="border-destructive/60"
                  />
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    aria-label="Search AWB"
                    onClick={() => void runAwbQuery()}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </FieldWrapper>
            </div>
          </div>

          <TabsContent value="shipping" className="mt-0">
            <div className="space-y-4 p-4 md:p-6">
              {queryResult?.shipmentId ? (
                <FormSection title="Carrier tracking">
                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <ReadOnlyField
                      label="Provider"
                      value={queryResult.carrierProviderCode || resolveQueryCarrier()}
                    />
                    <ReadOnlyField
                      label="Booking status"
                      value={queryResult.carrierBookingStatus || "NONE"}
                    />
                    <ReadOnlyField label="Booking ref" value={queryResult.carrierBookingRef} />
                    <ReadOnlyField label="Tracking no" value={queryResult.carrierTrackingNo} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={queryResult.carrierBookingStatus !== "BOOKED"}
                      onClick={() => void handleQueryCarrierTrack()}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Refresh tracking
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={queryResult.carrierBookingStatus !== "BOOKED"}
                      onClick={() => void handleQueryCarrierLabel()}
                    >
                      Download label
                    </Button>
                  </div>
                </FormSection>
              ) : null}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
                <DetailPanel title="Customer Details" text={queryResult?.customerDetails ?? ""} />
                <FormSection title="POD Details">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <ReadOnlyField label="Status" value={queryResult?.podStatus} />
                    <ReadOnlyField label="Status Date" value={queryResult?.podStatusDate} />
                    <ReadOnlyField label="Status Time" value={queryResult?.podStatusTime} />
                    <ReadOnlyField label="Receiver Name" value={queryResult?.podReceiverName} />
                    <ReadOnlyField label="Remark" value={queryResult?.podRemark} />
                    <ReadOnlyField label="POD Receive Date" value={queryResult?.podReceiveDate} />
                  </div>
                </FormSection>
                <FormSection title="Forwarding Details">
                  <div className="space-y-2">
                    <ReadOnlyField label="Vendor Name" value={queryResult?.vendorName} />
                    <ReadOnlyField label="Delivery Vendor" value={queryResult?.deliveryVendor} />
                    <ReadOnlyField label="Forwarding AWB" value={queryResult?.forwardingAwb} />
                    <ReadOnlyField label="Delivery AWB" value={queryResult?.deliveryAwb} />
                    <ReadOnlyField label="Return AWB No." value={queryResult?.returnAwbNo} />
                  </div>
                </FormSection>
                <div className="flex flex-col gap-2 xl:min-w-[10rem]">
                  <Button
                    className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={() =>
                      toast.info("Pickup location map will be enabled with backend wiring")
                    }
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Pickup Location
                  </Button>
                  <Button
                    className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={() =>
                      toast.info("Delivery location map will be enabled with backend wiring")
                    }
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Delivery Location
                  </Button>
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                    onClick={() => toast.success("AWB query confirmed")}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Ok
                  </Button>
                  <Button variant="secondary" onClick={handleRepeat}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Repeat
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <DetailPanel title="Shipper Details" text={queryResult?.shipperDetails ?? ""} />
                <DetailPanel title="Consignee Details" text={queryResult?.consigneeDetails ?? ""} />
              </div>

              <QueryTable
                title="Progress"
                headers={["User Id", "Date", "Time", "Service Center", "Status Details"]}
                rows={
                  queryResult?.progress.map((line) => [
                    line.userId,
                    line.date,
                    line.time,
                    line.serviceCenter,
                    line.statusDetails,
                  ]) ?? []
                }
              />

              <QueryTable
                title="Comment"
                headers={["User Id", "Date", "Time", "Comment", "File", "Action"]}
                rows={
                  queryResult?.comments.map((line) => [
                    line.userId,
                    line.date,
                    line.time,
                    line.comment,
                    line.file,
                    "",
                  ]) ?? []
                }
                actionCol
              />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <FormSection title="OBC Details">
                  <div className="space-y-2">
                    <ReadOnlyField label="Flight No" value={queryResult?.flightNo} />
                    <ReadOnlyField label="Airlines" value={queryResult?.airlines} />
                    <ReadOnlyField label="Mast AWB No" value={queryResult?.mastAwbNo} />
                    <ReadOnlyField label="CD No" value={queryResult?.cdNo} />
                    <ReadOnlyField label="OBC Name" value={queryResult?.obcName} />
                  </div>
                </FormSection>
                <QueryTable
                  title="Shipment Log"
                  headers={["User Id", "Date", "Time", "Message"]}
                  rows={
                    queryResult?.shipmentLog.map((line) => [
                      line.userId,
                      line.date,
                      line.time,
                      line.message,
                    ]) ?? []
                  }
                />
              </div>

              <FormSection title="Shipment Details">
                <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                  {SHIPMENT_DETAIL_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex gap-2 text-sm">
                      <span className="min-w-[7.5rem] font-medium text-foreground">{label} :</span>
                      <span className="text-muted-foreground">
                        {queryResult?.shipmentDetails[key] || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </FormSection>
            </div>
          </TabsContent>

          <TabsContent value="additional" className="mt-0">
            <div className="grid grid-cols-1 gap-4 p-4 md:p-6 xl:grid-cols-2">
              <QueryTable
                title="Volumetric Details"
                headers={[
                  "AWB No",
                  "Agent AWB No",
                  "Actual Weight",
                  "Pieces",
                  "Length",
                  "Width",
                  "Height",
                  "Volumetric Weight",
                  "Charge Weight",
                ]}
                rows={
                  queryResult?.volumetric.map((l) => [
                    l.awbNo,
                    l.agentAwbNo,
                    l.actualWeight,
                    l.pieces,
                    l.length,
                    l.width,
                    l.height,
                    l.volumetricWeight,
                    l.chargeWeight,
                  ]) ?? []
                }
                compact
              />
              <QueryTable
                title="Performa Details"
                headers={[
                  "Box No.",
                  "Package",
                  "Description",
                  "HSN Code",
                  "Quantity",
                  "Unit",
                  "Rate",
                  "Amount",
                  "Weight",
                ]}
                rows={
                  queryResult?.proforma.map((l) => [
                    l.boxNo,
                    l.packageNo,
                    l.description,
                    l.hsnCode,
                    l.quantity,
                    l.unit,
                    l.rate,
                    l.amount,
                    l.weight,
                  ]) ?? []
                }
                compact
              />
              <QueryTable
                title="Inscan"
                headers={["AWB No", "Vendor No", "Weight", "L", "B", "H", "Vol Weight"]}
                rows={
                  queryResult?.inscan.map((l) => [
                    l.awbNo,
                    l.vendorNo,
                    l.weight,
                    l.length,
                    l.breadth,
                    l.height,
                    l.volWeight,
                  ]) ?? []
                }
                compact
              />
              <QueryTable
                title="Manifest"
                headers={["AWB No", "Mani No", "Mani Date", "Bag", "Weight", "Pcs"]}
                rows={
                  queryResult?.manifest.map((l) => [
                    l.awbNo,
                    l.maniNo,
                    l.maniDate,
                    l.bag,
                    l.weight,
                    l.pcs,
                  ]) ?? []
                }
                compact
              />
              <QueryTable
                title="Manifest Inscan"
                headers={[
                  "AWB No",
                  "Mani No",
                  "Location",
                  "Rec. Date",
                  "Inscan location",
                  "Remark",
                  "Rec. weight",
                ]}
                rows={
                  queryResult?.manifestInscan.map((l) => [
                    l.awbNo,
                    l.maniNo,
                    l.location,
                    l.recDate,
                    l.inscanLocation,
                    l.remark,
                    l.recWeight,
                  ]) ?? []
                }
                compact
              />
              <QueryTable
                title="Status Details"
                headers={["User", "Date", "Time", "Status", "Remarks"]}
                rows={
                  queryResult?.statusDetails.map((l) => [
                    l.user,
                    l.date,
                    l.time,
                    l.status,
                    l.remarks,
                  ]) ?? []
                }
                compact
              />
            </div>
          </TabsContent>

          <TabsContent value="filter" className="mt-0">
            <div className="space-y-4 p-4 md:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FieldWrapper label="Booking From Date">
                  <Input
                    type="date"
                    value={filterForm.bookingFromDate}
                    onChange={(e) => patchFilter({ bookingFromDate: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Booking To Date">
                  <Input
                    type="date"
                    value={filterForm.bookingToDate}
                    onChange={(e) => patchFilter({ bookingToDate: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Status From Date">
                  <Input
                    type="date"
                    value={filterForm.statusFromDate}
                    onChange={(e) => patchFilter({ statusFromDate: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Status To Date">
                  <Input
                    type="date"
                    value={filterForm.statusToDate}
                    onChange={(e) => patchFilter({ statusToDate: e.target.value })}
                  />
                </FieldWrapper>

                <FieldWrapper label="Reference No">
                  <Input
                    value={filterForm.referenceNo}
                    onChange={(e) => patchFilter({ referenceNo: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Customer">
                  <LookupPairInput
                    lookup="customer"
                    value={filterForm.customer}
                    onChange={(customer) => patchFilter({ customer })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Vendor">
                  <LookupPairInput
                    lookup="vendor"
                    value={filterForm.vendor}
                    onChange={(vendor) => patchFilter({ vendor })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Service">
                  <Input
                    value={filterForm.service}
                    onChange={(e) => patchFilter({ service: e.target.value })}
                  />
                </FieldWrapper>

                <FieldWrapper label="Origin">
                  <LookupPairInput
                    lookup="destination"
                    value={filterForm.origin}
                    onChange={(origin) => patchFilter({ origin })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Destination">
                  <LookupPairInput
                    lookup="destination"
                    value={filterForm.destination}
                    onChange={(destination) => patchFilter({ destination })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Payment Type">
                  <Select
                    value={filterForm.paymentType}
                    onValueChange={(paymentType) => patchFilter({ paymentType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Payment Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Airline">
                  <Input
                    value={filterForm.airline}
                    onChange={(e) => patchFilter({ airline: e.target.value })}
                  />
                </FieldWrapper>

                <FieldWrapper label="Zip Code">
                  <Input
                    value={filterForm.zipCode}
                    onChange={(e) => patchFilter({ zipCode: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Forwarding No">
                  <Input
                    value={filterForm.forwardingNo}
                    onChange={(e) => patchFilter({ forwardingNo: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Bag No">
                  <Input
                    value={filterForm.bagNo}
                    onChange={(e) => patchFilter({ bagNo: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Status">
                  <Select
                    value={filterForm.status}
                    onValueChange={(status) => patchFilter({ status })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>

                <FieldWrapper label="Product">
                  <Select
                    value={filterForm.product}
                    onValueChange={(product) => patchFilter({ product })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Product" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_OPTIONS.map((product) => (
                        <SelectItem key={product} value={product}>
                          {product}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Delivery Vendor">
                  <LookupPairInput
                    lookup="vendor"
                    value={filterForm.deliveryVendor}
                    onChange={(deliveryVendor) => patchFilter({ deliveryVendor })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Delivery Service">
                  <LookupPairInput
                    lookup="vendor"
                    value={filterForm.deliveryService}
                    onChange={(deliveryService) => patchFilter({ deliveryService })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Shipper">
                  <Input
                    value={filterForm.shipper}
                    onChange={(e) => patchFilter({ shipper: e.target.value })}
                  />
                </FieldWrapper>

                <FieldWrapper label="Consignee">
                  <Input
                    value={filterForm.consignee}
                    onChange={(e) => patchFilter({ consignee: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Consignee City">
                  <Input
                    value={filterForm.consigneeCity}
                    onChange={(e) => patchFilter({ consigneeCity: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Consignee Phone No.">
                  <Input
                    value={filterForm.consigneePhone}
                    onChange={(e) => patchFilter({ consigneePhone: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Run No From">
                  <Input
                    value={filterForm.runNoFrom}
                    onChange={(e) => patchFilter({ runNoFrom: e.target.value })}
                  />
                </FieldWrapper>

                <FieldWrapper label="Run No To">
                  <Input
                    value={filterForm.runNoTo}
                    onChange={(e) => patchFilter({ runNoTo: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="CSB Type">
                  <Select
                    value={filterForm.csbType}
                    onValueChange={(csbType) => patchFilter({ csbType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select CSB Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CSB_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Weight From">
                  <Input
                    value={filterForm.weightFrom}
                    onChange={(e) => patchFilter({ weightFrom: e.target.value })}
                    inputMode="decimal"
                  />
                </FieldWrapper>
                <FieldWrapper label="Weight To">
                  <Input
                    value={filterForm.weightTo}
                    onChange={(e) => patchFilter({ weightTo: e.target.value })}
                    inputMode="decimal"
                  />
                </FieldWrapper>

                <FieldWrapper label="Product Type">
                  <Select
                    value={filterForm.productType}
                    onValueChange={(productType) => patchFilter({ productType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Product Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={filterForm.onlyPart}
                    onCheckedChange={(v) => patchFilter({ onlyPart: v === true })}
                  />
                  Only Part
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={filterForm.onlyMasterAndActual}
                    onCheckedChange={(v) => patchFilter({ onlyMasterAndActual: v === true })}
                  />
                  Only Master And Actual
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={filterForm.isHold}
                    onCheckedChange={(v) => patchFilter({ isHold: v === true })}
                  />
                  Is Hold
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={filterForm.rto}
                    onCheckedChange={(v) => patchFilter({ rto: v === true })}
                  />
                  RTO
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={handleFilterSearch}
                  className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                >
                  Search
                </Button>
                <Button onClick={handleFilterExport} variant="secondary">
                  Export
                </Button>
                <Button variant="destructive" onClick={handleFilterReset}>
                  Reset
                </Button>
              </div>

              <FormSection title="Additional Filter">
                <p className="mb-3 text-sm text-muted-foreground">
                  Total Count: {filterSearched ? filterResults.length : "—"}
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[1400px] caption-bottom text-sm">
                    <TableHeader>
                      <TableRow className="bg-sidebar hover:bg-sidebar">
                        {FILTER_RESULT_HEADERS.map((head) => (
                          <TableHead
                            key={head}
                            className="whitespace-nowrap text-sidebar-foreground"
                          >
                            {head}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!filterSearched || filterPageRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={FILTER_RESULT_HEADERS.length}
                            className="h-24 text-center text-muted-foreground"
                          >
                            {filterSearched ? "No matching records" : "Run search to view results"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filterPageRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>{row.masterAwbNo}</TableCell>
                            <TableCell>
                              <button
                                type="button"
                                className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                                onClick={() => {
                                  setAwbInput(row.awbNo);
                                  runAwbQuery(row.awbNo);
                                  setActiveTab("shipping");
                                }}
                              >
                                {row.awbNo}
                              </button>
                            </TableCell>
                            <TableCell>{row.bookingDate}</TableCell>
                            <TableCell>{row.runNo}</TableCell>
                            <TableCell>{row.airline}</TableCell>
                            <TableCell>{row.shipper}</TableCell>
                            <TableCell>{row.consignee}</TableCell>
                            <TableCell>{row.city}</TableCell>
                            <TableCell>{row.destination}</TableCell>
                            <TableCell>{row.pieces}</TableCell>
                            <TableCell>{row.chargeWeight}</TableCell>
                            <TableCell>{row.totalAmount}</TableCell>
                            <TableCell>{row.forwarder}</TableCell>
                            <TableCell>{row.deliveryDate || "—"}</TableCell>
                            <TableCell>{row.paymentType}</TableCell>
                            <TableCell>{row.manifestType}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </table>
                </div>
                {filterSearched && filterResults.length > 0 ? (
                  <TablePager
                    startIdx={filterStart}
                    endIdx={filterEnd}
                    total={filterResults.length}
                    currentPage={filterCurrentPage}
                    totalPages={filterTotalPages}
                    setPage={setFilterPage}
                  />
                ) : null}
              </FormSection>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative rounded-md border p-4 pt-6">
      <span className="absolute -top-2.5 left-3 rounded-full bg-sidebar px-3 py-0.5 text-sm font-medium text-sidebar-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function DetailPanel({ title, text }: { title: string; text: string }) {
  return (
    <FormSection title={title}>
      <pre className="min-h-[6rem] whitespace-pre-wrap font-sans text-sm text-muted-foreground">
        {text || "—"}
      </pre>
    </FormSection>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="min-w-[7rem] font-medium text-foreground">{label} :</span>
      <span className="text-muted-foreground">{value || "—"}</span>
    </div>
  );
}

function QueryTable({
  title,
  headers,
  rows,
  compact,
  actionCol,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  compact?: boolean;
  actionCol?: boolean;
}) {
  return (
    <FormSection title={title}>
      <div className="overflow-x-auto rounded-md border">
        <table className={`w-full caption-bottom text-sm ${compact ? "min-w-[640px]" : ""}`}>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {headers.map((head) => (
                <TableHead key={head} className="whitespace-nowrap">
                  {head}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={headers.length}
                  className="h-16 text-center text-muted-foreground"
                >
                  No data available
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={index}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className="whitespace-nowrap">
                      {actionCol && cellIndex === row.length - 1 ? "—" : cell || "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>
    </FormSection>
  );
}

function LookupPairInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-24"
          placeholder="Code"
        />
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
