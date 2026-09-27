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
import { DataIoToolbar } from "@/components/data-io-toolbar";
import {
  FieldWrapper,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { getShipmentTracking } from "@/lib/transactions/resources/tracking";
import {
  searchAwbShipments,
  fetchAwbSubTables,
  lookupAwbLabels,
  type SubTablesResult,
} from "@/lib/transactions/resources/awbQuery";
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
  { key: "airline", label: "Airline" },
  { key: "inscanWeight", label: "Inscan Weight" },
  { key: "club", label: "Club." },
  { key: "hold", label: "Hold" },
  { key: "inscanRemark", label: "Inscan Remark" },
  { key: "refNo", label: "Ref.No." },
  { key: "masterAwbNo", label: "MasterAWB No." },
  { key: "eAwbNo", label: "eAWB No." },
  { key: "drsVehicle", label: "DRS Vehicle" },
  { key: "drsDriver", label: "DRS Driver" },
  { key: "manifestVehicle", label: "Manifest Vehicle" },
  { key: "manifestDriver", label: "Manifest Driver" },
  { key: "assignTo", label: "Assign To" },
  { key: "commercial", label: "Commercial" },
  { key: "oda", label: "ODA" },
  { key: "codType", label: "COD Type" },
  { key: "shipmentType", label: "Shipment Type" },
  { key: "pincodeType", label: "Pincode Type" },
  { key: "customerInvoice", label: "Customer Invoice" },
  { key: "fieldExecutive", label: "Field Executive" },
  { key: "csbType", label: "CSB Type" },
  { key: "drsNo", label: "DRS No" },
  { key: "vehicleNo", label: "Vehicle No" },
  { key: "prsNo", label: "PRS No" },
  { key: "pickupFieldExecutive", label: "Pickup Field Executive" },
  { key: "pickupNo", label: "Pickup No" },
  { key: "remark", label: "Remark" },
];

const FILTER_EXPORT_COLUMNS = [
  { key: "masterAwbNo", header: "Master AWB No." },
  { key: "awbNo", header: "AWB No." },
  { key: "bookingDate", header: "Booking Date" },
  { key: "runNo", header: "Run No." },
  { key: "airline", header: "Airline" },
  { key: "shipper", header: "Shipper" },
  { key: "consignee", header: "Consignee" },
  { key: "city", header: "City" },
  { key: "destination", header: "Destination" },
  { key: "pieces", header: "Pieces" },
  { key: "chargeWeight", header: "Charge Weight" },
  { key: "totalAmount", header: "Total Amount" },
  { key: "forwarder", header: "Forwarder" },
  { key: "deliveryDate", header: "Delivery Date" },
  { key: "paymentType", header: "Payment Type" },
  { key: "manifestType", header: "Manifest Type" },
] as const;

const FILTER_RESULT_HEADERS = FILTER_EXPORT_COLUMNS.map((c) => c.header);

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

const emptySubTables = (): SubTablesResult => ({
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
});

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
  const [filterTotal, setFilterTotal] = useState(0);
  const [filterPage, setFilterPage] = useState(1);

  const patchFilter = (patch: Partial<FilterForm>) => setFilterForm((f) => ({ ...f, ...patch }));

  const runAwbQuery = async (awb?: string, options?: { quiet?: boolean }) => {
    const q = (awb ?? awbInput).trim();
    if (!q) return toast.error("AWB No. is required");

    if (!authed) {
      setQueryResult(null);
      return toast.error("Sign in to query an AWB");
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
      let subTables = emptySubTables();
      try {
        subTables = await fetchAwbSubTables(mapped.awbNo, mapped.shipmentId);
      } catch (subErr) {
        console.warn("Failed to load some sub-tables:", subErr);
      }
      const shipmentDetails = { ...mapped.shipmentDetails };
      for (const [key, value] of Object.entries(subTables.details)) {
        if (value) shipmentDetails[key] = value;
      }
      const labels = await lookupAwbLabels({
        userIds: [
          ...mapped.progress.map((line) => line.userId),
          ...mapped.comments.map((line) => line.userId),
          ...mapped.shipmentLog.map((line) => line.userId),
          ...mapped.statusDetails.map((line) => line.user),
        ],
        branchIds: mapped.progress.map((line) => line.branchId),
        fileIds: mapped.comments.map((line) => line.file),
      });
      const staffName = (id: string) => labels.users[id] || "";
      const progress = mapped.progress.map((line) => ({
        userId: staffName(line.userId),
        date: line.date,
        time: line.time,
        serviceCenter: line.serviceCenter || labels.branches[line.branchId] || "",
        statusDetails: line.statusDetails,
      }));
      const comments = mapped.comments.map((line) => ({
        ...line,
        userId: staffName(line.userId),
        file: labels.files[line.file] || "",
      }));
      const shipmentLog = mapped.shipmentLog.map((line) => ({
        ...line,
        userId: staffName(line.userId),
      }));
      const statusDetails = mapped.statusDetails.map((line) => ({
        ...line,
        user: staffName(line.user),
      }));

      setQueryResult({
        awbNo: mapped.awbNo,
        lastAwbNo: mapped.lastAwbNo,
        podUser: subTables.podUser || mapped.podUser,
        userId: mapped.userId,
        customerDetails: subTables.customerDetails || mapped.customerDetails,
        shipperDetails: mapped.shipperDetails,
        consigneeDetails: mapped.consigneeDetails,
        podStatus: mapped.podStatus,
        podStatusDate: mapped.podStatusDate,
        podStatusTime: mapped.podStatusTime || subTables.podStatusTime,
        podReceiverName: mapped.podReceiverName,
        podRemark: mapped.podRemark,
        podReceiveDate: mapped.podReceiveDate,
        vendorName: subTables.vendorName || mapped.vendorName,
        deliveryVendor: subTables.deliveryVendor || mapped.deliveryVendor,
        forwardingAwb: mapped.forwardingAwb,
        deliveryAwb: mapped.deliveryAwb,
        returnAwbNo: mapped.returnAwbNo,
        flightNo: mapped.flightNo,
        airlines: mapped.airlines,
        mastAwbNo: subTables.mastAwbNo || mapped.mastAwbNo,
        cdNo: subTables.cdNo || mapped.cdNo,
        obcName: subTables.obcName || mapped.obcName,
        shipmentDetails,
        progress,
        comments,
        shipmentLog,
        volumetric: subTables.volumetric,
        proforma: subTables.proforma,
        inscan: subTables.inscan,
        manifest: subTables.manifest,
        manifestInscan: subTables.manifestInscan,
        statusDetails,
        shipmentId: mapped.shipmentId,
        ...carrierMeta,
      });
      setLastAwbNo(q);
      setAwbInput(q);
      if (!options?.quiet) toast.success(`Loaded AWB ${q}`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const handleRepeat = () => {
    if (!lastAwbNo) return toast.info("No previous AWB to repeat");
    void runAwbQuery(lastAwbNo);
  };

  const handleOk = () => {
    if (!queryResult?.awbNo) return toast.error("Load an AWB first");
    void runAwbQuery(queryResult.awbNo, { quiet: true });
  };

  const openStoredLocation = (label: string, details: string) => {
    const query = details
      .split("\n")
      .map((line) => line.replace(/^PIN:\s*/i, "").trim())
      .filter(Boolean)
      .join(", ");
    if (!query) return toast.error(`No ${label} address is stored on this AWB`);
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const resolveQueryCarrier = () =>
    queryResult?.carrierProviderCode ||
    normalizeVendorToCarrierCode(queryResult?.vendorName) ||
    null;

  const handleQueryCarrierTrack = async () => {
    if (!queryResult?.shipmentId) return toast.error("Load an AWB first");
    if (!authed) return toast.error("Sign in to query an AWB");
    const carrier = resolveQueryCarrier();
    if (!carrier) return toast.error("No carrier is stored on this AWB");
    try {
      const result = await getCarrierAdapter(carrier).track({
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
    if (!authed) return toast.error("Sign in to query an AWB");
    const carrier = resolveQueryCarrier();
    if (!carrier) return toast.error("No carrier is stored on this AWB");
    try {
      const result = await getCarrierAdapter(carrier).label({
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

  const [filterSearching, setFilterSearching] = useState(false);

  const handleFilterSearch = async () => {
    if (filterSearching) return;

    setFilterSearching(true);
    try {
      const pageSize = 500;
      const rows: FilterResultRow[] = [];
      let total = 0;
      let offset = 0;
      for (;;) {
        const outcome = await searchAwbShipments(filterForm, pageSize, offset);
        if (outcome.error) {
          toast.error(outcome.error);
          return;
        }
        total = outcome.totalCount;
        rows.push(...outcome.rows);
        offset += outcome.rows.length;
        if (outcome.rows.length === 0 || rows.length >= total || rows.length >= 10000) break;
      }
      setFilterResults(rows);
      setFilterTotal(total);
      setFilterSearched(true);
      setFilterPage(1);
      toast.success(
        total > rows.length
          ? `Showing ${rows.length} of ${total} record(s)`
          : `Found ${total} record(s)`,
      );
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setFilterSearching(false);
    }
  };

  const handleFilterReset = () => {
    setFilterForm(emptyFilter());
    setFilterResults([]);
    setFilterTotal(0);
    setFilterSearched(false);
    setFilterPage(1);
    toast.success("Filters reset");
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
      podUser: queryResult?.podUser || "—",
      userId: queryResult?.userId || "—",
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
          {authed ? " Connected to live backend." : ""}
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
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(14rem,0.85fr)_minmax(20rem,1.25fr)_minmax(20rem,1.25fr)_auto]">
                <DetailPanel title="Customer Details" text={queryResult?.customerDetails ?? ""} />
                <FormSection title="POD Details">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <QueryInput label="Status" value={queryResult?.podStatus} />
                    <QueryInput label="Status Date" value={queryResult?.podStatusDate} />
                    <QueryInput label="Status Time" value={queryResult?.podStatusTime} />
                    <QueryInput label="Receiver Name" value={queryResult?.podReceiverName} />
                    <QueryInput label="Remark" value={queryResult?.podRemark} />
                    <QueryInput label="POD Receive Date" value={queryResult?.podReceiveDate} />
                  </div>
                </FormSection>
                <FormSection title="Forwarding Details">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <QueryInput label="Vendor Name" value={queryResult?.vendorName} />
                    <QueryInput label="Delivery Vendor" value={queryResult?.deliveryVendor} />
                    <QueryInput label="Forwarding AWB" value={queryResult?.forwardingAwb} />
                    <QueryInput label="Delivery AWB" value={queryResult?.deliveryAwb} />
                    <QueryInput label="Return AWB No." value={queryResult?.returnAwbNo} />
                  </div>
                </FormSection>
                <div className="flex flex-col gap-2 xl:min-w-[10rem]">
                  <Button
                    className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={() => openStoredLocation("pickup", queryResult?.shipperDetails ?? "")}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Pickup Location
                  </Button>
                  <Button
                    className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={() =>
                      openStoredLocation("delivery", queryResult?.consigneeDetails ?? "")
                    }
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Delivery Location
                  </Button>
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                    onClick={handleOk}
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
                <DataIoToolbar
                  export={{
                    filename: "awb-query-filter",
                    title: "AWB Query Filter Results",
                    columns: FILTER_EXPORT_COLUMNS,
                    getRows: () =>
                      filterResults.map((r) => ({
                        masterAwbNo: r.masterAwbNo,
                        awbNo: r.awbNo,
                        bookingDate: r.bookingDate,
                        runNo: r.runNo,
                        airline: r.airline,
                        shipper: r.shipper,
                        consignee: r.consignee,
                        city: r.city,
                        destination: r.destination,
                        pieces: r.pieces,
                        chargeWeight: r.chargeWeight,
                        totalAmount: r.totalAmount,
                        forwarder: r.forwarder,
                        deliveryDate: r.deliveryDate,
                        paymentType: r.paymentType,
                        manifestType: r.manifestType,
                      })),
                  }}
                  disabled={filterResults.length === 0}
                />
                <Button variant="destructive" onClick={handleFilterReset}>
                  Reset
                </Button>
              </div>

              <FormSection title="Additional Filter">
                <p className="mb-3 text-sm text-muted-foreground">
                  Total Count: {filterSearched ? filterTotal : "—"}
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

function QueryInput({ label, value }: { label: string; value?: string }) {
  return (
    <FieldWrapper label={label} borderLabel>
      <Input value={value ?? ""} readOnly />
    </FieldWrapper>
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
