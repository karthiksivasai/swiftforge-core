import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Filter,
  RefreshCw,
  Plus,
  Search,
  Trash2,
  ChevronDown,
  Upload,
  Settings,
  Info,
  List,
  Copy,
  Cloud,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import {
  FieldWrapper,
  IconButton,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
} from "@/components/master-table-kit";
import { SearchableLookupPair } from "@/components/masters/searchable-lookup-pair";
import { PartyContactLookup } from "@/components/transactions/party-contact-lookup";
import { VendorServiceLookup } from "@/components/transactions/vendor-service-lookup";
import type { LookupKey } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { rememberPartiesAfterAwbSave } from "@/lib/transactions/resources/partyContacts";
import {
  clientProfileToAwbHydrate,
  loadClientProfile,
  type ClientProfile,
} from "@/lib/transactions/resources/clientProfile";
import { listVendorServices } from "@/lib/transactions/resources/vendorServices";
import {
  AWB_DRAFT_AUTOSAVE_MS,
  AWB_DRAFT_VERSION,
  clearAwbDraft,
  draftUserKey,
  formatDraftSavedAt,
  isAwbDraftWorthKeeping,
  loadAwbDraft,
  persistAwbDraft,
  readLocalAwbDraft,
  type AwbEntryDraftPayload,
} from "@/lib/transactions/awbDraftStorage";
import {
  cancelShipment,
  confirmBooking,
  fetchShipmentChildren,
  findShipmentBySearch,
  getShipmentById,
  listShipments,
  saveShipment,
} from "@/lib/transactions/resources/shipments";
import {
  buildAwbLabelHtml,
  ensureAwbLabelDocument,
  ensureBookedShipmentDocuments,
  formToAwbLabelInput,
  shipmentNeedsSystemDocuments,
} from "@/lib/transactions/awbLabelGenerator";
import {
  buildInvoiceHtml,
  ensureInvoiceDocument,
  formToInvoiceInput,
} from "@/lib/transactions/invoiceGenerator";
import {
  getShipmentDocument,
  type ShipmentDocumentItem,
} from "@/lib/transactions/shipmentDocuments";
import {
  calculateShipmentRating,
  getRatingBreakdown,
  recalculateShipmentRating,
} from "@/lib/transactions/resources/rating";
import {
  ratingSnapshotToChargeLines,
  ratingToSummary,
  type RatingSummary,
} from "@/lib/transactions/ratingUiMap";
import {
  dbShipmentToFormPatch,
  dbShipmentToListRow,
  uiFormToShipmentPayload,
} from "@/lib/transactions/shipmentUiMap";
import { getCarrierAdapter } from "@/lib/integrations/adapter";
import { normalizeVendorToCarrierCode, SUPPORTED_CARRIER_CODES } from "@/lib/integrations/carriers";
import {
  getVendorShippingContext,
  maskMobile,
  startVendorBooking,
  type VendorApiStatus,
} from "@/lib/integrations/vendor-shipping";
import {
  VendorActivityTimeline,
  VendorBookingStatusStrip,
  VendorOtpDialog,
  retryVendorBooking,
  verifyVendorOtp,
  type VendorShippingMeta,
} from "@/components/transactions/vendor-shipping-panel";
import {
  ShipmentBookedBanner,
  ShipmentDocumentQuickLinks,
  ShipmentDocumentsCard,
} from "@/components/transactions/shipment-documents-card";

type LookupPair = { id?: string; code: string; name: string };

type PartyDetails = {
  origin: LookupPair;
  companyName: LookupPair;
  contactName: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  state: string;
  telephone: string;
  mobileNo: string;
  email: string;
  country: string;
  iecNo: string;
  documentType: string;
  documentNo: string;
};

type PiecesLine = {
  id: string;
  childAwb: string;
  actualWeightPerPc: string;
  pieces: string;
  length: string;
  breadth: string;
  height: string;
  volWeight: string;
  chargeWeight: string;
};

type ChargeLine = {
  id: string;
  description: string;
  rate: string;
  amount: string;
  fuelApply: string;
  fuelAmt: string;
  taxApply: string;
  taxOnFuel: string;
  igst: string;
  sgst: string;
  cgst: string;
  total: string;
  chargesType: string;
};

type ProformaLine = {
  id: string;
  boxNo: string;
  packages: string;
  description: string;
  hsCode: string;
  quantity: string;
  weight: string;
  unit: string;
  rate: string;
  amount: string;
  igstPercent: string;
  igstAmount: string;
};

type ProformaData = {
  csbType: string;
  termOfInvoice: string;
  gstInvoice: boolean;
  invoiceNo: string;
  invoiceDate: string;
  departmentNo: string;
  exportReason: string;
  format: string;
  currency: string;
  lines: ProformaLine[];
};

type VendorChargeLine = {
  id: string;
  description: string;
  rate: string;
  amount: string;
  fuelApply: string;
  fuelAmt: string;
  taxApply: string;
  taxOnFuel: string;
  igst: string;
  sgst: string;
  cgst: string;
  total: string;
  chargesType: string;
};

type ForwardingData = {
  deliveryAwb: string;
  forwardingAwb: string;
  deliveryProduct: LookupPair;
  deliveryVendor: LookupPair;
  deliveryService: LookupPair;
  vendorWeight: string;
  vendorAmount: string;
  vendorInvoice: string;
  vendorChargeLines: VendorChargeLine[];
};

type KycDocument = {
  id: string;
  fileName: string;
  entryType: string;
  entryDate: string;
};

type KycData = {
  documents: KycDocument[];
};

type AwbFullForm = {
  awbNo: string;
  bookDate: string;
  bookTime: string;
  referenceNo: string;
  clientName: LookupPair;
  awbUserId: string;
  podUserId: string;
  manifestNo: string;
  manifestDate: string;
  invoiceNo: string;
  debitNoteNo: string;
  creditNoteNo: string;
  flightNo: string;
  shipper: PartyDetails;
  consignee: PartyDetails;
  product: LookupPair;
  vendor: LookupPair;
  airline: string;
  service: LookupPair;
  shipmentValue: string;
  shipmentCurrency: string;
  pieces: string;
  piecesUnit: string;
  actualWeight: string;
  weightUnit: string;
  volWeight: string;
  chargeWeight: string;
  commercial: boolean;
  oda: boolean;
  medicalCharges: boolean;
  customerChargesTotal: string;
  vendorChargesTotal: string;
  piecesLines: PiecesLine[];
  chargeLines: ChargeLine[];
  paymentType: string;
  content: string;
  instruction: string;
  fieldExecutive: LookupPair;
  cashReceiptNo: string;
  amountReceived: string;
  balanceAmount: string;
  cashReceiptDate: string;
  lock: boolean;
  forwardingNo: string;
  deliveryNo: string;
  pickupId?: string;
  proforma: ProformaData;
  forwarding: ForwardingData;
  kyc: KycData;
};

type AwbRow = AwbFullForm & {
  id: string;
  rowVersion?: number;
  status?: string;
  pickupId?: string;
  carrierProviderCode?: string;
  carrierBookingRef?: string;
  carrierTrackingNo?: string;
  carrierBookingStatus?: string;
  carrierLabelFileId?: string;
};

type SearchField = "awbNo" | "forwardingNo" | "deliveryNo" | "referenceNo";

type ColFilterKey =
  | "awbNo"
  | "bookDate"
  | "shipperName"
  | "customerCode"
  | "customerName"
  | "consigneeName"
  | "destination"
  | "product"
  | "vendor"
  | "actualWeight"
  | "chargeWeight"
  | "pieces"
  | "deliveryVendor";

type PiecesDraft = {
  measurementUnit: string;
  actualWeightPerPc: string;
  noOfPieces: string;
  length: string;
  width: string;
  height: string;
  division: string;
  volWeight: string;
  chargeWeight: string;
};

type ChargeDraft = {
  description: string;
  itemAmount: string;
  itemFuel: string;
  taxOnFuel: string;
  tax: string;
  itemTotal: string;
};

type ProformaDraft = {
  boxNo: string;
  packages: string;
  description: string;
  hsnCode: string;
  quantity: string;
  weight: string;
  unit: string;
  rate: string;
  amount: string;
  igstPercent: string;
};

type VendorChargeDraft = {
  description: string;
  amount: string;
  fuel: string;
  fuelAmt: string;
  taxOnFuel: string;
  taxOnFuelAmt: string;
  tax: string;
  taxAmt: string;
  total: string;
};

const SEARCH_FIELDS: { value: SearchField; label: string }[] = [
  { value: "awbNo", label: "AWB No" },
  { value: "forwardingNo", label: "Forwarding No" },
  { value: "deliveryNo", label: "Delivery No" },
  { value: "referenceNo", label: "Reference No" },
];

const PAYMENT_TYPES = ["Cash", "Cheque", "Credit", "To Pay"] as const;
const DOCUMENT_TYPES = [
  "Aadhaar Number",
  "GSTIN (Normal)",
  "GSTIN",
  "PAN Number",
  "Passport Number",
  "Driving License",
  "IEC Certificate",
  "Voter ID",
  "TAN Number",
  "Other",
] as const;
const CURRENCIES = ["INR", "USD", "AUD", "GBP", "EUR"] as const;
const PIECE_UNITS = ["DOX", "NDOX", "ENV"] as const;
const WEIGHT_UNITS = ["Kgs", "Lbs"] as const;
const MEASUREMENT_UNITS = ["Centimeter", "Inch"] as const;
const CHARGE_DESCRIPTIONS = [
  "Freight",
  "Fuel Surcharge",
  "ODA Charges",
  "Medical Charges",
  "Other Charges",
] as const;
const YES_NO = ["Yes", "No"] as const;

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

const TERM_OF_INVOICE = [
  "Cost and Freight(CFR)",
  "Cost, Insurance and Freight(CIF)",
  "Carriage and Insurance Paid(CIP)",
  "Carriage Paid To(CPT)",
  "Delivered At Frontier(DAF)",
  "Delivered at Place(DAP)",
  "Delivered at Terminal(DAT)",
  "Delivery Duty Paid(DDP)",
  "Delivery Duty Unpaid(DDU)",
  "Delivered Ex Quay(DEQ)",
  "Delivered Ex Ship(DES)",
  "Ex Works(EXW)",
  "Free Along Side(FAS)",
  "Free Carrier(FCA)",
  "Free On Board(FOB)",
  "Unknown(UNK)",
] as const;

const EXPORT_REASONS = [
  "Bonafide Gift",
  "BUYER (IF OTHER THAN CONSIGNEE)",
  "FREE SAMPLE OF NO COMMERICAL VALUE",
  "FREE TRADE SAMPLE",
  "PERSONAL",
  "Personal not for resale",
  "SALE",
  "Samples not for sale",
  "UNSOLICITED GIFT - NOT FOR SALE",
] as const;

const PROFORMA_FORMATS = ["B2B", "B2C", "C2C"] as const;

const PROFORMA_CURRENCIES = [
  "INR",
  "USD",
  "AUD",
  "GBP",
  "EUR",
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "FJD",
  "FKP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HRK",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "UYU",
  "UZS",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XCD",
  "XOF",
  "XPF",
  "YER",
  "ZAR",
  "ZMW",
  "ZWL",
] as const;

const BOX_NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
const PROFORMA_UNITS = ["PCS", "KGS", "NOS", "SET", "PAIR"] as const;

const VENDOR_CHARGE_DESCRIPTIONS = [
  "COVID CHARGE VENDOR",
  "DEMAND SURCHARGE VENDOR",
  "FREIGHT",
  "GOGREEN VENDOR",
  "MEDICAL CHARGES VENDOR",
] as const;

const KYC_TYPES = [
  "Aadhaar Number",
  "Driving License",
  "GSTIN (Normal)",
  "IEC CERTIFICATE",
  "PAN Number",
  "Passport Number",
  "TAN Number",
  "Voter Id",
  "Performa Invoice",
  "Document",
] as const;

const AWB_TABS = ["awb", "proforma", "forwarding", "kyc"] as const;
type AwbTab = (typeof AWB_TABS)[number];

const AWB_FORM_SETUP_COLUMNS = [
  [
    { key: "customerRepeat", label: "Customer Repeat" },
    { key: "dateRepeat", label: "Date Repeat" },
    { key: "contentRepeat", label: "Content Repeat" },
    { key: "awbNoPlus1", label: "AWB No Plus 1" },
  ],
  [
    { key: "productRepeat", label: "Product Repeat" },
    { key: "consigneeNameRepeat", label: "Consignee Name Repeat" },
    { key: "instructionRepeat", label: "Instruction Repeat" },
    { key: "allowConsigneeNameBlank", label: "Allow consignee Name Blank" },
  ],
  [
    { key: "vendorRepeat", label: "Vendor Repeat" },
    { key: "airlineRepeat", label: "Airline Repeat" },
    { key: "airlineNotRequired", label: "Airline Not Required" },
    { key: "serviceRepeat", label: "Service Repeat" },
  ],
  [
    { key: "destinationRepeat", label: "Destination Repeat" },
    { key: "shipperDetailsRepeat", label: "Shipper Details Repeat" },
    { key: "consigneeNotRequired", label: "Consignee Not Required" },
    { key: "allowPaymentTypeOverride", label: "Allow Payment Type Override" },
  ],
] as const;

type AwbFormSetupKey = (typeof AWB_FORM_SETUP_COLUMNS)[number][number]["key"];
type AwbFormSetupSettings = Record<AwbFormSetupKey, boolean>;

const defaultAwbFormSetup = (): AwbFormSetupSettings => ({
  customerRepeat: false,
  dateRepeat: false,
  contentRepeat: false,
  awbNoPlus1: false,
  productRepeat: false,
  consigneeNameRepeat: false,
  instructionRepeat: false,
  allowConsigneeNameBlank: false,
  vendorRepeat: false,
  airlineRepeat: false,
  airlineNotRequired: true,
  serviceRepeat: false,
  destinationRepeat: false,
  shipperDetailsRepeat: false,
  consigneeNotRequired: false,
  allowPaymentTypeOverride: true,
});

const ENTRY_TYPES = ["Duplicate Entry"] as const;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

/** Default shipper origin for new AWB entries (CourierWala / HYD hub). */
const DEFAULT_SHIPPER_ORIGIN: LookupPair = { code: "HYD", name: "Hyderabad" };

/** Ensure selected Service belongs to Vendor via Service Mapping (live). */
async function validateVendorServicePair(form: {
  vendor: LookupPair;
  service: LookupPair;
}): Promise<string | null> {
  const hasVendor = Boolean(form.vendor.id || form.vendor.code.trim() || form.vendor.name.trim());
  if (!hasVendor) return null;
  const serviceKey = (form.service.code.trim() || form.service.name.trim()).toLowerCase();
  if (!serviceKey) return "Service is required when Vendor is selected";
  try {
    const hits = await listVendorServices({
      vendorId: form.vendor.id || null,
      vendorCode: form.vendor.code.trim() || form.vendor.name.trim() || null,
      q: null,
      limit: 200,
    });
    if (hits.length === 0) {
      return "No services are configured for this vendor.";
    }
    const ok = hits.some(
      (h) =>
        h.code.toLowerCase() === serviceKey ||
        h.name.toLowerCase() === serviceKey ||
        (h.service_type ?? "").toLowerCase() === serviceKey ||
        h.service.toLowerCase() === serviceKey,
    );
    if (!ok) {
      return `Service "${form.service.code || form.service.name}" is not mapped to the selected Vendor`;
    }
    return null;
  } catch (e) {
    return toErrorMessage(e, "Could not validate Vendor / Service mapping");
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const nowBookTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const emptyParty = (): PartyDetails => ({
  origin: emptyPair(),
  companyName: emptyPair(),
  contactName: "",
  address1: "",
  address2: "",
  pincode: "",
  city: "",
  state: "",
  telephone: "",
  mobileNo: "",
  email: "",
  country: "India",
  iecNo: "",
  documentType: "",
  documentNo: "",
});

const emptyPiecesDraft = (): PiecesDraft => ({
  measurementUnit: "Centimeter",
  actualWeightPerPc: "",
  noOfPieces: "1",
  length: "",
  width: "",
  height: "",
  division: "5000",
  volWeight: "0",
  chargeWeight: "0",
});

const emptyChargeDraft = (): ChargeDraft => ({
  description: "",
  itemAmount: "",
  itemFuel: "No",
  taxOnFuel: "No",
  tax: "No",
  itemTotal: "0",
});

const emptyProforma = (): ProformaData => ({
  csbType: "CSB 4",
  termOfInvoice: "",
  gstInvoice: false,
  invoiceNo: "",
  invoiceDate: "",
  departmentNo: "",
  exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
  format: "",
  currency: "INR",
  lines: [],
});

const emptyProformaDraft = (): ProformaDraft => ({
  boxNo: "1",
  packages: "",
  description: "",
  hsnCode: "",
  quantity: "",
  weight: "",
  unit: "PCS",
  rate: "",
  amount: "",
  igstPercent: "0",
});

const emptyForwarding = (): ForwardingData => ({
  deliveryAwb: "",
  forwardingAwb: "",
  deliveryProduct: emptyPair(),
  deliveryVendor: emptyPair(),
  deliveryService: emptyPair(),
  vendorWeight: "0",
  vendorAmount: "0.00",
  vendorInvoice: "",
  vendorChargeLines: [],
});

const emptyKyc = (): KycData => ({ documents: [] });

const emptyVendorChargeDraft = (): VendorChargeDraft => ({
  description: "",
  amount: "",
  fuel: "No",
  fuelAmt: "0.00",
  taxOnFuel: "No",
  taxOnFuelAmt: "0.00",
  tax: "No",
  taxAmt: "0.00",
  total: "0.00",
});

const emptyForm = (): AwbFullForm => ({
  awbNo: "",
  bookDate: todayIso(),
  bookTime: nowBookTime(),
  referenceNo: "",
  clientName: emptyPair(),
  awbUserId: "SURYAA",
  podUserId: "",
  manifestNo: "0",
  manifestDate: "",
  invoiceNo: "",
  debitNoteNo: "0",
  creditNoteNo: "0",
  flightNo: "",
  shipper: { ...emptyParty(), origin: { ...DEFAULT_SHIPPER_ORIGIN } },
  consignee: emptyParty(),
  product: emptyPair(),
  vendor: emptyPair(),
  airline: "",
  service: emptyPair(),
  shipmentValue: "",
  shipmentCurrency: "INR",
  pieces: "1",
  piecesUnit: "DOX",
  actualWeight: "0.1",
  weightUnit: "Kgs",
  volWeight: "0",
  chargeWeight: "0",
  commercial: false,
  oda: false,
  medicalCharges: false,
  customerChargesTotal: "0",
  vendorChargesTotal: "0",
  piecesLines: [],
  chargeLines: [],
  paymentType: "",
  content: "",
  instruction: "",
  fieldExecutive: emptyPair(),
  cashReceiptNo: "",
  amountReceived: "",
  balanceAmount: "",
  cashReceiptDate: "",
  lock: false,
  forwardingNo: "",
  deliveryNo: "",
  proforma: emptyProforma(),
  forwarding: emptyForwarding(),
  kyc: emptyKyc(),
});

const calcVolWeight = (draft: PiecesDraft) => {
  const l = Number.parseFloat(draft.length) || 0;
  const w = Number.parseFloat(draft.width) || 0;
  const h = Number.parseFloat(draft.height) || 0;
  const pcs = Number.parseFloat(draft.noOfPieces) || 0;
  const div = Number.parseFloat(draft.division) || 5000;
  if (!l || !w || !h || !pcs || !div) return "0";
  return ((l * w * h * pcs) / div).toFixed(2);
};

const calcChargeWeight = (draft: PiecesDraft) => {
  const vol = Number.parseFloat(calcVolWeight(draft)) || 0;
  const act =
    (Number.parseFloat(draft.actualWeightPerPc) || 0) * (Number.parseFloat(draft.noOfPieces) || 0);
  return Math.max(vol, act).toFixed(2);
};

const formatListWeightDisplay = (value: string): string => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(3) : value || "";
};

const listFromRow = (r: AwbRow) => ({
  awbNo: r.awbNo,
  bookDate: formatDisplayDate(r.bookDate),
  shipperName: r.shipper.companyName.name || r.shipper.contactName,
  customerCode: r.clientName.code,
  customerName: r.clientName.name,
  consigneeName: r.consignee.companyName.name || r.consignee.contactName,
  destination: r.consignee.origin.name || r.consignee.origin.code,
  product: r.product.code,
  vendor: r.vendor.code,
  actualWeight: formatListWeightDisplay(r.actualWeight),
  chargeWeight: formatListWeightDisplay(r.chargeWeight),
  pieces: r.pieces,
  deliveryVendor: r.deliveryNo || r.forwarding?.deliveryVendor?.code || "",
});

const seedFromSummary = (s: {
  awbNo: string;
  bookDate: string;
  shipperName: string;
  customerCode: string;
  customerName: string;
  consigneeName: string;
  destination: string;
  product: string;
  vendor: string;
  actualWeight: string;
  chargeWeight: string;
  pieces: string;
  deliveryVendor: string;
  forwardingNo: string;
  deliveryNo: string;
  referenceNo: string;
}): AwbFullForm => ({
  ...emptyForm(),
  awbNo: s.awbNo,
  bookDate: s.bookDate,
  referenceNo: s.referenceNo,
  clientName: { code: s.customerCode, name: s.customerName },
  shipper: {
    ...emptyParty(),
    origin: { code: "HYD", name: "HYD" },
    companyName: { code: "", name: s.shipperName },
    contactName: s.shipperName,
  },
  consignee: {
    ...emptyParty(),
    origin: { code: "", name: s.destination },
    companyName: { code: "", name: s.consigneeName },
    contactName: s.consigneeName,
  },
  product: { code: s.product, name: s.product },
  vendor: { code: s.vendor, name: s.vendor },
  pieces: s.pieces,
  actualWeight: s.actualWeight,
  chargeWeight: s.chargeWeight,
  forwardingNo: s.forwardingNo,
  deliveryNo: s.deliveryNo,
  forwarding: {
    ...emptyForwarding(),
    deliveryAwb: s.deliveryNo,
    forwardingAwb: s.forwardingNo,
    deliveryProduct: { code: s.product, name: s.product },
    deliveryVendor: { code: s.deliveryVendor, name: s.deliveryVendor },
  },
  kyc: emptyKyc(),
});

const SEED_SUMMARIES = [
  {
    awbNo: "30403918",
    bookDate: "2026-07-04",
    shipperName: "ELURI RAJESH",
    customerCode: "TPCADDA",
    customerName: "TPC ADDANKI",
    consigneeName: "ELURI SIVARAMAKRISHNA",
    destination: "AUSTRALIA",
    product: "SPX",
    vendor: "DTAU",
    actualWeight: "36.000",
    chargeWeight: "36.000",
    pieces: "1",
    deliveryVendor: "1228523166",
    forwardingNo: "FWD30403918",
    deliveryNo: "1228523166",
    referenceNo: "REF30403918",
  },
  {
    awbNo: "30403919",
    bookDate: "2026-07-04",
    shipperName: "KONERU VENKATA",
    customerCode: "UDAYEXP",
    customerName: "FEDEX INTERNATIONAL COURIER",
    consigneeName: "JOHN SMITH",
    destination: "USA",
    product: "SPX",
    vendor: "UPS",
    actualWeight: "26.800",
    chargeWeight: "26.800",
    pieces: "2",
    deliveryVendor: "CW8932",
    forwardingNo: "FWD30403919",
    deliveryNo: "CW8932",
    referenceNo: "REF30403919",
  },
  {
    awbNo: "30403920",
    bookDate: "2026-07-04",
    shipperName: "MADDIPATLA SRINIVAS",
    customerCode: "HYDEXP",
    customerName: "HYDERABAD EXPORTS",
    consigneeName: "DAVID WILSON",
    destination: "AUSTRALIA",
    product: "SPX",
    vendor: "DHE",
    actualWeight: "18.500",
    chargeWeight: "18.500",
    pieces: "1",
    deliveryVendor: "1779469271",
    forwardingNo: "FWD30403920",
    deliveryNo: "1779469271",
    referenceNo: "REF30403920",
  },
  {
    awbNo: "30403921",
    bookDate: "2026-07-04",
    shipperName: "GUNDA RAJESH",
    customerCode: "METRO01",
    customerName: "METRO LOGISTICS",
    consigneeName: "ANNE MARTIN",
    destination: "USA",
    product: "SPX",
    vendor: "DHL1",
    actualWeight: "42.300",
    chargeWeight: "42.300",
    pieces: "3",
    deliveryVendor: "788982753426",
    forwardingNo: "FWD30403921",
    deliveryNo: "788982753426",
    referenceNo: "REF30403921",
  },
  {
    awbNo: "30403922",
    bookDate: "2026-07-04",
    shipperName: "PULI RAMESH",
    customerCode: "SUNRISE",
    customerName: "SUNRISE COURIER CLIENT",
    consigneeName: "MICHAEL BROWN",
    destination: "AUSTRALIA",
    product: "SPX",
    vendor: "DTAU",
    actualWeight: "15.200",
    chargeWeight: "15.200",
    pieces: "1",
    deliveryVendor: "",
    forwardingNo: "FWD30403922",
    deliveryNo: "",
    referenceNo: "REF30403922",
  },
  {
    awbNo: "30403923",
    bookDate: "2026-07-04",
    shipperName: "BANDARU LAKSHMI",
    customerCode: "AIHAN01",
    customerName: "AIHAN ENTERPRISES",
    consigneeName: "SARAH JOHNSON",
    destination: "USA",
    product: "SPX",
    vendor: "UPS",
    actualWeight: "31.000",
    chargeWeight: "31.000",
    pieces: "1",
    deliveryVendor: "1Z999AA10123456784",
    forwardingNo: "FWD30403923",
    deliveryNo: "1Z999AA10123456784",
    referenceNo: "REF30403923",
  },
  {
    awbNo: "30403924",
    bookDate: "2026-07-04",
    shipperName: "CHINTALAPATI RAO",
    customerCode: "GLOBAL1",
    customerName: "GLOBAL TRADERS PVT LTD",
    consigneeName: "ROBERT TAYLOR",
    destination: "AUSTRALIA",
    product: "SPX",
    vendor: "DHE",
    actualWeight: "22.700",
    chargeWeight: "22.700",
    pieces: "2",
    deliveryVendor: "CW9104",
    forwardingNo: "FWD30403924",
    deliveryNo: "CW9104",
    referenceNo: "REF30403924",
  },
  {
    awbNo: "30403925",
    bookDate: "2026-07-04",
    shipperName: "NALLAMILLI PRASAD",
    customerCode: "TPCADDA",
    customerName: "TPC ADDANKI",
    consigneeName: "LINDA DAVIS",
    destination: "USA",
    product: "SPX",
    vendor: "DHL1",
    actualWeight: "19.400",
    chargeWeight: "19.400",
    pieces: "1",
    deliveryVendor: "4551203891",
    forwardingNo: "FWD30403925",
    deliveryNo: "4551203891",
    referenceNo: "REF30403925",
  },
  {
    awbNo: "30403926",
    bookDate: "2026-07-04",
    shipperName: "KATTA VENKATESWARLU",
    customerCode: "UDAYEXP",
    customerName: "FEDEX INTERNATIONAL COURIER",
    consigneeName: "JAMES ANDERSON",
    destination: "AUSTRALIA",
    product: "SPX",
    vendor: "DTAU",
    actualWeight: "28.600",
    chargeWeight: "28.600",
    pieces: "1",
    deliveryVendor: "3990011223",
    forwardingNo: "FWD30403926",
    deliveryNo: "3990011223",
    referenceNo: "REF30403926",
  },
  {
    awbNo: "30403927",
    bookDate: "2026-07-04",
    shipperName: "DASARI KRISHNA",
    customerCode: "HYDEXP",
    customerName: "HYDERABAD EXPORTS",
    consigneeName: "PATRICIA WHITE",
    destination: "USA",
    product: "SPX",
    vendor: "UPS",
    actualWeight: "33.100",
    chargeWeight: "33.100",
    pieces: "4",
    deliveryVendor: "8822100455",
    forwardingNo: "FWD30403927",
    deliveryNo: "8822100455",
    referenceNo: "REF30403927",
  },
];

const seedRows = (): AwbRow[] =>
  SEED_SUMMARIES.map((s) => ({ id: crypto.randomUUID(), ...seedFromSummary(s) }));

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  awbNo: "",
  bookDate: "",
  shipperName: "",
  customerCode: "",
  customerName: "",
  consigneeName: "",
  destination: "",
  product: "",
  vendor: "",
  actualWeight: "",
  chargeWeight: "",
  pieces: "",
  deliveryVendor: "",
});

const awbCol = {
  awbNo:
    "sticky left-0 z-20 min-w-[112px] whitespace-nowrap bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]",
  awbNoHead:
    "sticky left-0 z-30 min-w-[112px] whitespace-nowrap bg-sidebar shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]",
  awbNoFilter:
    "sticky left-0 z-30 min-w-[112px] whitespace-nowrap bg-muted shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]",
  bookDate: "min-w-[112px] whitespace-nowrap",
  shipperName: "min-w-[160px] whitespace-nowrap",
  customerCode: "min-w-[132px] whitespace-nowrap",
  customerName: "min-w-[200px] whitespace-nowrap",
  consigneeName: "min-w-[200px] whitespace-nowrap",
  destination: "min-w-[128px] whitespace-nowrap",
  product: "min-w-[88px] whitespace-nowrap",
  vendor: "min-w-[88px] whitespace-nowrap",
  actualWeight: "min-w-[112px] whitespace-nowrap",
  chargeWeight: "min-w-[112px] whitespace-nowrap",
  pieces: "min-w-[80px] whitespace-nowrap",
  deliveryVendor: "min-w-[140px] whitespace-nowrap",
  action:
    "sticky right-0 z-30 min-w-[72px] whitespace-nowrap bg-sidebar text-center shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.18)]",
  actionFilter:
    "sticky right-0 z-30 min-w-[72px] whitespace-nowrap bg-muted text-center shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]",
  actionCell:
    "sticky right-0 z-20 min-w-[72px] whitespace-nowrap bg-background text-center shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.12)]",
  filter: "h-8 w-full min-w-0",
} as const;

export const Route = createFileRoute("/transaction/awb-entry")({
  head: () => ({
    meta: [
      { title: "AWB Entry — Transaction — Courier ERP" },
      { name: "description", content: "View and manage air waybill entries." },
    ],
  }),
  component: AwbEntryPage,
});

function AwbEntryPage() {
  const { isAuthenticated: authed, profile } = useAuth();
  const queryClient = useQueryClient();
  const userKey = draftUserKey(profile?.id, profile?.auth_user_id);
  const [demoRows, setDemoRows] = useState<AwbRow[]>(seedRows);
  const [colFilters, setColFilters] = useState(emptyColFilters());
  const [page, setPage] = useState(1);
  const [searchField, setSearchField] = useState<SearchField>("awbNo");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState<{ field: SearchField; query: string } | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AwbRow | null>(null);
  const [form, setForm] = useState<AwbFullForm>(emptyForm());
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AwbRow | null>(null);
  const [activeTab, setActiveTab] = useState("awb");
  const [piecesOpen, setPiecesOpen] = useState(true);
  const [chargesOpen, setChargesOpen] = useState(true);
  const [piecesDraft, setPiecesDraft] = useState<PiecesDraft>(emptyPiecesDraft);
  const [chargeDraft, setChargeDraft] = useState<ChargeDraft>(emptyChargeDraft);
  const [proformaDraft, setProformaDraft] = useState<ProformaDraft>(emptyProformaDraft);
  const [proformaUnits, setProformaUnits] = useState<string[]>([...PROFORMA_UNITS]);
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [newUnitInput, setNewUnitInput] = useState("");
  const [vendorChargesOpen, setVendorChargesOpen] = useState(true);
  const [vendorChargeDraft, setVendorChargeDraft] =
    useState<VendorChargeDraft>(emptyVendorChargeDraft);
  const [kycDocType, setKycDocType] = useState<string>(KYC_TYPES[0]);
  const [kycSearchField, setKycSearchField] = useState<SearchField>("awbNo");
  const [kycSearchInput, setKycSearchInput] = useState("");
  const kycFileRef = useRef<HTMLInputElement | null>(null);
  const [formSetupOpen, setFormSetupOpen] = useState(false);
  const [formSetupSettings, setFormSetupSettings] =
    useState<AwbFormSetupSettings>(defaultAwbFormSetup);
  const [formSetupDraft, setFormSetupDraft] = useState<AwbFormSetupSettings>(defaultAwbFormSetup);
  const [formToolbarSearch, setFormToolbarSearch] = useState("");
  const [lastSavedForm, setLastSavedForm] = useState<AwbFullForm | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<string>(ENTRY_TYPES[0]);
  const [masterAwb, setMasterAwb] = useState("");
  const [saving, setSaving] = useState(false);
  const [bookingErrors, setBookingErrors] = useState<string[]>([]);
  const [cancelShipmentTarget, setCancelShipmentTarget] = useState<AwbRow | null>(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [loadedClientProfile, setLoadedClientProfile] = useState<ClientProfile | null>(null);
  const clientLoadSeqRef = useRef(0);
  const [vendorBookingBusy, setVendorBookingBusy] = useState(false);
  const [vendorOtpOpen, setVendorOtpOpen] = useState(false);
  const [vendorOtpError, setVendorOtpError] = useState<string | null>(null);
  const [vendorOtpMobile, setVendorOtpMobile] = useState<string | null>(null);
  const [vendorSandboxOtp, setVendorSandboxOtp] = useState<string | null>(null);
  const [vendorMeta, setVendorMeta] = useState<VendorShippingMeta>({});
  const [vendorPanelKey, setVendorPanelKey] = useState(0);

  type DraftUiStatus = "idle" | "saving" | "saved" | "error";
  const [draftUiStatus, setDraftUiStatus] = useState<DraftUiStatus>("idle");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [restoreDraft, setRestoreDraft] = useState<AwbEntryDraftPayload | null>(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [leaveSource, setLeaveSource] = useState<"nav" | "close">("nav");
  const allowLeaveRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const lastDraftSnapshotRef = useRef<string>("");

  const formStatus = editing?.status ?? (showForm && !editing ? "DRAFT" : undefined);
  const isReadOnly = Boolean(formStatus && formStatus !== "DRAFT");
  const canBook = Boolean(formStatus === "DRAFT" || (!editing && showForm));
  const canCancelShipment = Boolean(editing && (formStatus === "DRAFT" || formStatus === "BOOKED"));
  const hasUnfinishedDraft =
    showForm && !isReadOnly && isAwbDraftWorthKeeping(form);

  const navBlocker = useBlocker({
    shouldBlockFn: () => {
      if (allowLeaveRef.current) {
        allowLeaveRef.current = false;
        return false;
      }
      return showForm && !isReadOnly && isAwbDraftWorthKeeping(form);
    },
    enableBeforeUnload: hasUnfinishedDraft,
    withResolver: true,
  });

  const liveQuery = useQuery({
    queryKey: ["shipments", "list", appliedSearch?.field, appliedSearch?.query],
    queryFn: () =>
      listShipments({
        pageSize: 500,
        search: appliedSearch?.query,
        searchField:
          appliedSearch?.field === "forwardingNo"
            ? "forwarding_awb"
            : appliedSearch?.field === "deliveryNo"
              ? "delivery_awb"
              : appliedSearch?.field === "referenceNo"
                ? "reference_no"
                : "awb_no",
      }),
    enabled: authed,
  });

  useEffect(() => {
    if (!liveQuery.isError) return;
    toast.error(toErrorMessage(liveQuery.error, "Failed to load AWB list"));
  }, [liveQuery.isError, liveQuery.error]);

  const rows: AwbRow[] = authed
    ? (liveQuery.data?.rows ?? []).map((r) => {
        const list = dbShipmentToListRow(r);
        return {
          ...emptyForm(),
          id: list.id,
          rowVersion: list.rowVersion,
          status: list.status,
          awbNo: list.awbNo,
          bookDate: list.bookDate,
          bookTime: list.bookTime,
          referenceNo: list.referenceNo,
          clientName: { code: list.customerCode, name: list.customerName },
          shipper: { ...emptyParty(), companyName: { code: "", name: list.shipperName } },
          consignee: {
            ...emptyParty(),
            companyName: { code: "", name: list.consigneeName },
            origin: { code: "", name: list.destination },
          },
          product: { code: list.product, name: list.product },
          vendor: { code: list.vendor, name: list.vendor },
          pieces: list.pieces,
          actualWeight: list.actualWeight,
          chargeWeight: list.chargeWeight,
          forwardingNo: list.forwardingNo,
          deliveryNo: list.deliveryNo,
          forwarding: {
            ...emptyForwarding(),
            deliveryAwb: list.deliveryNo,
            forwardingAwb: list.forwardingNo,
            deliveryVendor: {
              code: list.deliveryVendor,
              name: list.deliveryVendor,
            },
          },
          carrierProviderCode: list.carrierProviderCode,
          carrierBookingRef: list.carrierBookingRef,
          carrierTrackingNo: list.carrierTrackingNo,
          carrierBookingStatus: list.carrierBookingStatus,
          carrierLabelFileId: list.carrierLabelFileId,
        };
      })
    : demoRows;

  const refreshLive = async () => {
    await queryClient.invalidateQueries({ queryKey: ["shipments"] });
    await queryClient.refetchQueries({ queryKey: ["shipments"] });
  };

  const normalizeProforma = (raw: unknown): ProformaData => {
    const base = emptyProforma();
    if (!raw || typeof raw !== "object") return base;
    const p = raw as Record<string, unknown>;
    const linesRaw = Array.isArray(p.lines) ? p.lines : [];
    return {
      csbType: String(p.csbType ?? base.csbType),
      termOfInvoice: String(p.termOfInvoice ?? base.termOfInvoice),
      gstInvoice: p.gstInvoice === true,
      invoiceNo: String(p.invoiceNo ?? base.invoiceNo),
      invoiceDate: String(p.invoiceDate ?? base.invoiceDate),
      departmentNo: String(p.departmentNo ?? base.departmentNo),
      exportReason: String(p.exportReason ?? base.exportReason),
      format: String(p.format ?? base.format),
      currency: String(p.currency ?? base.currency),
      lines: linesRaw.map((line, i) => {
        const l = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
        return {
          id: String(l.id ?? `pf-${i}`),
          boxNo: String(l.boxNo ?? "1"),
          packages: String(l.packages ?? ""),
          description: String(l.description ?? ""),
          hsCode: String(l.hsCode ?? l.hsnCode ?? ""),
          quantity: String(l.quantity ?? ""),
          weight: String(l.weight ?? ""),
          unit: String(l.unit ?? "PCS"),
          rate: String(l.rate ?? ""),
          amount: String(l.amount ?? ""),
          igstPercent: String(l.igstPercent ?? "0"),
          igstAmount: String(l.igstAmount ?? "0"),
        };
      }),
    };
  };

  const normalizeForm = (data: AwbFullForm): AwbFullForm => {
    const forwarding = data.forwarding ?? emptyForwarding();
    const bookTimeDigits = String(data.bookTime ?? "")
      .replace(/\D/g, "")
      .slice(0, 4);
    return {
      ...data,
      bookTime: bookTimeDigits || data.bookTime,
      proforma: normalizeProforma(data.proforma),
      forwarding: {
        ...emptyForwarding(),
        ...forwarding,
        deliveryAwb: forwarding.deliveryAwb || data.deliveryNo,
        forwardingAwb: forwarding.forwardingAwb || data.forwardingNo,
      },
      kyc: data.kyc ?? emptyKyc(),
    };
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const display = listFromRow(r);
      if (appliedSearch?.query.trim()) {
        const val = String(r[appliedSearch.field]).toLowerCase();
        if (!val.includes(appliedSearch.query.trim().toLowerCase())) return false;
      }
      for (const key of Object.keys(colFilters) as ColFilterKey[]) {
        const val = colFilters[key].trim().toLowerCase();
        if (val && !display[key].toLowerCase().includes(val)) return false;
      }
      return true;
    });
  }, [rows, colFilters, appliedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const chargeSummary = useMemo(() => {
    if (ratingSummary) return ratingSummary;
    const subTotal = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.amount) || 0), 0);
    const totalFuel = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.fuelAmt) || 0), 0);
    const igst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.igst) || 0), 0);
    const cgst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.cgst) || 0), 0);
    const sgst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.sgst) || 0), 0);
    const total = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.total) || 0), 0);
    return {
      freight: "0.00",
      fuel: totalFuel.toFixed(2),
      tax: (igst + cgst + sgst).toFixed(2),
      otherCharges: subTotal.toFixed(2),
      vendorCost: "0.00",
      total: total.toFixed(2),
      contractCharges: "0",
      subTotal: subTotal.toFixed(2),
      totalFuel: totalFuel.toFixed(2),
      igst: igst.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      totalAmount: total.toFixed(2),
    };
  }, [form.chargeLines, ratingSummary]);

  const applyServerRating = (breakdown: Parameters<typeof ratingToSummary>[0]) => {
    const summary = ratingToSummary(breakdown);
    const lines = ratingSnapshotToChargeLines(breakdown);
    setRatingSummary(summary);
    setForm((f) => ({
      ...f,
      chargeLines: lines,
      customerChargesTotal: summary.subTotal,
      vendorChargesTotal: summary.vendorCost,
    }));
  };

  const proformaSummary = useMemo(() => {
    const lines = form.proforma.lines;
    const quantity = lines.reduce((s, l) => s + (Number.parseFloat(l.quantity) || 0), 0);
    const weight = lines.reduce((s, l) => s + (Number.parseFloat(l.weight) || 0), 0);
    const amount = lines.reduce((s, l) => s + (Number.parseFloat(l.amount) || 0), 0);
    return {
      totalRecord: lines.length,
      quantity: quantity.toFixed(0),
      weight: weight.toFixed(2),
      amount: amount.toFixed(2),
    };
  }, [form.proforma.lines]);

  const vendorChargeSummary = useMemo(() => {
    const lines = form.forwarding.vendorChargeLines;
    const subTotal = lines.reduce((s, l) => s + (Number.parseFloat(l.amount) || 0), 0);
    const totalFuel = lines.reduce((s, l) => s + (Number.parseFloat(l.fuelAmt) || 0), 0);
    const igst = lines.reduce((s, l) => s + (Number.parseFloat(l.igst) || 0), 0);
    const cgst = lines.reduce((s, l) => s + (Number.parseFloat(l.cgst) || 0), 0);
    const sgst = lines.reduce((s, l) => s + (Number.parseFloat(l.sgst) || 0), 0);
    const total = lines.reduce((s, l) => s + (Number.parseFloat(l.total) || 0), 0);
    return {
      contractCharges: "0.00",
      otherCharges: subTotal.toFixed(2),
      subTotal: subTotal.toFixed(2),
      totalFuel: totalFuel.toFixed(2),
      igst: igst.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      totalAmount: total.toFixed(2),
    };
  }, [form.forwarding.vendorChargeLines]);

  const filteredKycDocs = useMemo(() => {
    const q = kycSearchInput.trim().toLowerCase();
    if (!q) return form.kyc.documents;
    return form.kyc.documents.filter((d) =>
      [d.fileName, d.entryType, d.entryDate, String(d.id)].some((v) => v.toLowerCase().includes(q)),
    );
  }, [form.kyc.documents, kycSearchInput]);

  const tabIndex = AWB_TABS.indexOf(activeTab as AwbTab);
  const goPrevTab = () => {
    if (tabIndex > 0) setActiveTab(AWB_TABS[tabIndex - 1]);
  };
  const goNextTab = () => {
    if (tabIndex < AWB_TABS.length - 1) setActiveTab(AWB_TABS[tabIndex + 1]);
  };

  const patchProforma = (patch: Partial<ProformaData>) => {
    setForm((f) => ({ ...f, proforma: { ...f.proforma, ...patch } }));
  };

  const patchForwarding = (patch: Partial<ForwardingData>) => {
    setForm((f) => ({ ...f, forwarding: { ...f.forwarding, ...patch } }));
  };

  const openFormSetup = () => {
    setFormSetupDraft({ ...formSetupSettings });
    setFormSetupOpen(true);
  };

  const closeFormSetup = () => {
    setFormSetupOpen(false);
    setFormSetupDraft({ ...formSetupSettings });
  };

  const handleFormSetupSave = () => {
    setFormSetupSettings({ ...formSetupDraft });
    setFormSetupOpen(false);
    toast.success("Form setup saved");
  };

  const applyFormSetupRepeats = (base: AwbFullForm): AwbFullForm => {
    if (!lastSavedForm) return base;
    const s = formSetupSettings;
    const prev = lastSavedForm;
    let next: AwbFullForm = { ...base };

    if (s.customerRepeat) next = { ...next, clientName: { ...prev.clientName } };
    if (s.dateRepeat) next = { ...next, bookDate: prev.bookDate };
    if (s.contentRepeat) next = { ...next, content: prev.content };
    if (s.productRepeat) next = { ...next, product: { ...prev.product } };
    if (s.vendorRepeat) next = { ...next, vendor: { ...prev.vendor } };
    if (s.airlineRepeat) next = { ...next, airline: prev.airline };
    if (s.serviceRepeat) next = { ...next, service: { ...prev.service } };
    if (s.instructionRepeat) next = { ...next, instruction: prev.instruction };
    if (s.shipperDetailsRepeat) next = { ...next, shipper: { ...prev.shipper } };
    if (s.destinationRepeat || s.consigneeNameRepeat) {
      next = {
        ...next,
        consignee: {
          ...next.consignee,
          ...(s.destinationRepeat ? { origin: { ...prev.consignee.origin } } : {}),
          ...(s.consigneeNameRepeat
            ? {
                companyName: { ...prev.consignee.companyName },
                contactName: prev.consignee.contactName,
              }
            : {}),
        },
      };
    }
    if (s.awbNoPlus1 && prev.awbNo.trim()) {
      const num = Number.parseInt(prev.awbNo, 10);
      if (!Number.isNaN(num)) next = { ...next, awbNo: String(num + 1) };
    }
    return next;
  };

  const handleFormToolbarSearch = async () => {
    const q = formToolbarSearch.trim();
    if (!q) return;
    if (authed) {
      try {
        setSaving(true);
        const found = await findShipmentBySearch({ query: q, field: "awb_no" });
        if (!found) {
          toast.error("No AWB entry found");
          return;
        }
        await openEdit({
          ...emptyForm(),
          id: found.id,
          rowVersion: found.row_version,
          status: found.current_status ?? "DRAFT",
          awbNo: found.awb_no ?? q,
        } as AwbRow);
        toast.success(`Opened AWB ${found.awb_no ?? q}`);
      } catch (e) {
        toast.error(toErrorMessage(e, "Search failed"));
      } finally {
        setSaving(false);
      }
      return;
    }
    const match = rows.find((r) => r.awbNo.toLowerCase().includes(q.toLowerCase()));
    if (match) openEdit(match);
    else toast.error("No AWB entry found");
  };

  const openEntry = () => {
    setEntryType(ENTRY_TYPES[0]);
    setMasterAwb("");
    setEntryOpen(true);
  };

  const closeEntry = () => {
    setEntryOpen(false);
    setMasterAwb("");
  };

  const handleEntrySearch = () => {
    const key = masterAwb.trim();
    if (!key) return toast.error("Master AWB is required");

    const match = rows.find((r) => r.awbNo === key);
    if (!match) return toast.error("Master AWB not found");

    if (entryType === "Duplicate Entry") {
      const { id: _id, awbNo: _awb, ...rest } = match;
      let next = normalizeForm({ ...rest, awbNo: "" });
      if (formSetupSettings.awbNoPlus1) {
        const num = Number.parseInt(key, 10);
        if (!Number.isNaN(num)) next = { ...next, awbNo: String(num + 1) };
      }
      setEditing(null);
      setForm(next);
      setActiveTab("awb");
      toast.success(`Duplicated from AWB ${key}`);
    }

    closeEntry();
  };

  const buildCurrentDraft = (): AwbEntryDraftPayload => ({
    version: AWB_DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    userKey,
    form,
    editing: editing
      ? { id: editing.id, rowVersion: editing.rowVersion, status: editing.status }
      : null,
    activeTab,
    piecesDraft,
    chargeDraft,
    proformaDraft,
    vendorChargeDraft,
  });

  const applyDraftPayload = (draft: AwbEntryDraftPayload) => {
    skipNextAutosaveRef.current = true;
    const restoredForm = normalizeForm({
      ...emptyForm(),
      ...(draft.form as Partial<AwbFullForm>),
    } as AwbFullForm);
    setForm(restoredForm);
    if (draft.editing?.id) {
      setEditing({
        ...restoredForm,
        id: draft.editing.id,
        rowVersion: draft.editing.rowVersion,
        status: draft.editing.status ?? "DRAFT",
      } as AwbRow);
    } else {
      setEditing(null);
    }
    setActiveTab(draft.activeTab || "awb");
    setPiecesDraft((draft.piecesDraft as PiecesDraft) ?? emptyPiecesDraft());
    setChargeDraft((draft.chargeDraft as ChargeDraft) ?? emptyChargeDraft());
    setProformaDraft((draft.proformaDraft as ProformaDraft) ?? emptyProformaDraft());
    setVendorChargeDraft(
      (draft.vendorChargeDraft as VendorChargeDraft) ?? emptyVendorChargeDraft(),
    );
    setRatingSummary(null);
    setBookingErrors([]);
    setKycSearchInput("");
    lastDraftSnapshotRef.current = JSON.stringify({
      form: draft.form,
      editing: draft.editing,
      activeTab: draft.activeTab,
      piecesDraft: draft.piecesDraft,
      chargeDraft: draft.chargeDraft,
      proformaDraft: draft.proformaDraft,
      vendorChargeDraft: draft.vendorChargeDraft,
    });
    setDraftSavedAt(draft.savedAt);
    setDraftUiStatus("saved");
    setShowForm(true);
  };

  const clearDraftState = async () => {
    await clearAwbDraft({ userKey, syncRemote: authed });
    lastDraftSnapshotRef.current = "";
    setDraftUiStatus("idle");
    setDraftSavedAt(null);
  };

  useEffect(() => {
    if (draftHydratedRef.current) return;
    let cancelled = false;
    void (async () => {
      const draft = await loadAwbDraft({ userKey, syncRemote: authed });
      if (cancelled) return;
      draftHydratedRef.current = true;
      if (draft) setRestoreDraft(draft);
    })();
    return () => {
      cancelled = true;
    };
  }, [userKey, authed]);

  useEffect(() => {
    if (!showForm || isReadOnly) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (!isAwbDraftWorthKeeping(form)) return;

    setDraftUiStatus("saving");
    const timer = window.setTimeout(() => {
      const draft = buildCurrentDraft();
      const snapshot = JSON.stringify({
        form: draft.form,
        editing: draft.editing,
        activeTab: draft.activeTab,
        piecesDraft: draft.piecesDraft,
        chargeDraft: draft.chargeDraft,
        proformaDraft: draft.proformaDraft,
        vendorChargeDraft: draft.vendorChargeDraft,
      });
      if (snapshot === lastDraftSnapshotRef.current) {
        setDraftUiStatus(draftSavedAt ? "saved" : "idle");
        return;
      }
      void persistAwbDraft({ draft, syncRemote: authed })
        .then(() => {
          lastDraftSnapshotRef.current = snapshot;
          setDraftSavedAt(draft.savedAt);
          setDraftUiStatus("saved");
        })
        .catch(() => setDraftUiStatus("error"));
    }, AWB_DRAFT_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on form chrome + payload only
  }, [
    form,
    piecesDraft,
    chargeDraft,
    proformaDraft,
    vendorChargeDraft,
    activeTab,
    editing?.id,
    editing?.rowVersion,
    showForm,
    isReadOnly,
    userKey,
    authed,
  ]);

  useEffect(() => {
    if (navBlocker.status === "blocked") {
      setLeaveSource("nav");
      setLeavePromptOpen(true);
    }
  }, [navBlocker.status]);

  const openAdd = () => {
    const existing = restoreDraft ?? readLocalAwbDraft(userKey);
    if (existing && isAwbDraftWorthKeeping(existing.form)) {
      setRestoreDraft(existing);
      return;
    }
    setEditing(null);
    setForm(applyFormSetupRepeats(emptyForm()));
    setRatingSummary(null);
    setPiecesDraft(emptyPiecesDraft());
    setChargeDraft(emptyChargeDraft());
    setProformaDraft(emptyProformaDraft());
    setVendorChargeDraft(emptyVendorChargeDraft());
    setKycSearchInput("");
    setBookingErrors([]);
    setActiveTab("awb");
    setDraftUiStatus("idle");
    setDraftSavedAt(null);
    setLoadedClientProfile(null);
    setClientLoading(false);
    setVendorMeta({});
    setVendorOtpOpen(false);
    setVendorOtpError(null);
    setVendorBookingBusy(false);
    setShowForm(true);
  };

  const openEdit = async (row: AwbRow) => {
    setRestoreDraft(null);
    setLoadedClientProfile(null);
    setClientLoading(false);
    setVendorMeta({});
    setVendorOtpOpen(false);
    setVendorOtpError(null);
    setVendorSandboxOtp(null);
    if (authed) {
      try {
        // Always reload full shipment so older AWBs get complete wizard_extras/proforma.
        const full = await getShipmentById(row.id);
        if (!full) {
          toast.error("Shipment not found");
          return;
        }
        const children = await fetchShipmentChildren(row.id);
        const patch = dbShipmentToFormPatch(full, children);
        const {
          id: _id,
          rowVersion,
          status,
          carrierProviderCode,
          carrierBookingRef,
          carrierTrackingNo,
          carrierBookingStatus,
          carrierLabelFileId,
          ...rest
        } = patch;
        const formForDocs = normalizeForm({ ...emptyForm(), ...rest } as AwbFullForm);
        setEditing({
          ...emptyForm(),
          ...rest,
          id: row.id,
          rowVersion,
          status,
          carrierProviderCode,
          carrierBookingRef,
          carrierTrackingNo,
          carrierBookingStatus,
          carrierLabelFileId,
        } as AwbRow);
        setForm(formForDocs);
        setRatingSummary(null);
        try {
          const breakdown = await getRatingBreakdown(row.id);
          if (
            breakdown.rating_version ||
            (breakdown.snapshot?.length ?? 0) > 0 ||
            breakdown.total > 0
          ) {
            applyServerRating(breakdown);
          }
        } catch {
          /* draft without rating yet */
        }
        setPiecesDraft(emptyPiecesDraft());
        setChargeDraft(emptyChargeDraft());
        setProformaDraft(emptyProformaDraft());
        setVendorChargeDraft(emptyVendorChargeDraft());
        setKycSearchInput("");
        setBookingErrors([]);
        setActiveTab("awb");
        setShowForm(true);
        try {
          const ctx = await getVendorShippingContext(row.id);
          if (ctx.shippingApiEnabled || ctx.shipment.vendor_api_status) {
            setVendorMeta({
              status: String(ctx.shipment.vendor_api_status ?? "NONE") as VendorApiStatus,
              vendorAwb: (ctx.shipment.vendor_api_awb as string) ?? null,
              trackingNumber: (ctx.shipment.vendor_tracking_number as string) ?? null,
              bookingId: (ctx.shipment.vendor_booking_id as string) ?? null,
              provider: (ctx.shipment.vendor_provider as string) ?? ctx.integration?.provider_code,
              serviceCode: (ctx.shipment.vendor_service_code as string) ?? null,
              otpVerified: ctx.shipment.vendor_otp_verified === true,
              bookedAt: (ctx.shipment.vendor_api_booked_at as string) ?? null,
              syncStatus: (ctx.shipment.vendor_sync_status as string) ?? null,
              lastError: (ctx.shipment.vendor_api_last_error as string) ?? null,
            });
          }
        } catch {
          /* vendor shipping optional */
        }
        const shipmentStatus = status ?? full.current_status;
        if (shipmentNeedsSystemDocuments(shipmentStatus)) {
          try {
            await ensureBookedShipmentDocuments({
              shipmentId: row.id,
              form: formForDocs,
              vendor:
                (full.vendor_provider as string | null) ||
                full.vendors?.code ||
                formForDocs.vendor.code ||
                null,
            });
          } catch (docErr) {
            toast.warning(
              toErrorMessage(
                docErr,
                "Could not prepare AWB Label / Invoice — click the links to retry",
              ),
            );
          }
        }
        setVendorPanelKey((k) => k + 1);
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      return;
    }
    setEditing(row);
    const { id: _id, rowVersion: _rv, status: _st, ...rest } = row;
    setForm(normalizeForm(rest));
    setPiecesDraft(emptyPiecesDraft());
    setChargeDraft(emptyChargeDraft());
    setProformaDraft(emptyProformaDraft());
    setVendorChargeDraft(emptyVendorChargeDraft());
    setKycSearchInput("");
    setBookingErrors([]);
    setActiveTab("awb");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    setRatingSummary(null);
    setBookingErrors([]);
    setActiveTab("awb");
    setPiecesDraft(emptyPiecesDraft());
    setChargeDraft(emptyChargeDraft());
    setProformaDraft(emptyProformaDraft());
    setVendorChargeDraft(emptyVendorChargeDraft());
    setLoadedClientProfile(null);
    setClientLoading(false);
    setVendorMeta({});
    setVendorOtpOpen(false);
    setVendorOtpError(null);
    setVendorBookingBusy(false);
  };

  const requestCloseForm = () => {
    if (isReadOnly || !isAwbDraftWorthKeeping(form)) {
      allowLeaveRef.current = true;
      closeForm();
      return;
    }
    setLeaveSource("close");
    setLeavePromptOpen(true);
  };

  const finishLeavePrompt = async (mode: "continue" | "save" | "discard") => {
    if (mode === "continue") {
      setLeavePromptOpen(false);
      if (leaveSource === "nav") navBlocker.reset?.();
      return;
    }

    if (mode === "save") {
      const draft = buildCurrentDraft();
      if (isAwbDraftWorthKeeping(draft.form)) {
        await persistAwbDraft({ draft, syncRemote: authed });
        setDraftSavedAt(draft.savedAt);
        setDraftUiStatus("saved");
      }
    } else {
      await clearDraftState();
    }

    setLeavePromptOpen(false);
    allowLeaveRef.current = true;
    if (leaveSource === "nav") {
      navBlocker.proceed?.();
    } else {
      closeForm();
    }
  };

  const handleRestoreContinue = () => {
    if (!restoreDraft) return;
    applyDraftPayload(restoreDraft);
    setRestoreDraft(null);
  };

  const handleRestoreStartNew = async () => {
    await clearDraftState();
    setRestoreDraft(null);
  };

  const handleSave = async () => {
    if (isReadOnly) return toast.error("BOOKED and CANCELLED shipments cannot be edited");
    if (!authed && !form.awbNo.trim()) return toast.error("AWB No is required");
    if (!form.clientName.code.trim() && !form.clientName.name.trim())
      return toast.error("Client Name is required");
    if (
      !formSetupSettings.consigneeNotRequired &&
      !form.consignee.origin.name.trim() &&
      !form.consignee.origin.code.trim()
    ) {
      return toast.error("Destination is required");
    }
    if (
      !formSetupSettings.allowConsigneeNameBlank &&
      !formSetupSettings.consigneeNotRequired &&
      !form.consignee.companyName.name.trim() &&
      !form.consignee.contactName.trim()
    ) {
      return toast.error("Consignee Name is required");
    }
    if (!form.product.code.trim()) return toast.error("Product is required");
    if (!formSetupSettings.airlineNotRequired && !form.airline.trim())
      return toast.error("Airline is required");
    if (form.vendor.id || form.vendor.code.trim() || form.vendor.name.trim()) {
      if (!form.service.code.trim() && !form.service.name.trim()) {
        return toast.error("Service is required when Vendor is selected");
      }
    }

    const payload = normalizeForm({
      ...form,
      awbNo: form.awbNo.trim(),
      deliveryNo: form.forwarding.deliveryAwb.trim(),
      forwardingNo: form.forwarding.forwardingAwb.trim(),
    });

    if (authed) {
      setSaving(true);
      setBookingErrors([]);
      try {
        const vendorServiceError = await validateVendorServicePair(payload);
        if (vendorServiceError) {
          toast.error(vendorServiceError);
          return;
        }
        const { fields, pieces, charges } = uiFormToShipmentPayload({
          ...payload,
          pickupId: editing?.pickupId ?? payload.pickupId,
        });
        const saved = await saveShipment({
          id: editing?.id ?? null,
          rowVersion: editing?.rowVersion ?? null,
          fields,
          pieces,
          charges,
        });
        await rememberPartiesAfterAwbSave({
          shipper: payload.shipper,
          consignee: payload.consignee,
        });
        await refreshLive();
        toast.success(editing ? "AWB entry updated" : `AWB ${saved.awb_no} saved (DRAFT)`);
        setLastSavedForm({ ...payload, awbNo: saved.awb_no || payload.awbNo });
        allowLeaveRef.current = true;
        await clearDraftState();
        closeForm();
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...payload, id: editing.id, rowVersion: r.rowVersion, status: r.status ?? "DRAFT" }
            : r,
        ),
      );
      toast.success("AWB entry updated");
    } else {
      if (demoRows.some((r) => r.awbNo === payload.awbNo))
        return toast.error("AWB No already exists");
      setDemoRows((prev) => [{ id: crypto.randomUUID(), status: "DRAFT", ...payload }, ...prev]);
      toast.success("AWB entry saved");
    }
    setLastSavedForm(payload);
    allowLeaveRef.current = true;
    await clearDraftState();
    closeForm();
  };

  const collectClientBookingErrors = (): string[] => {
    const errors: string[] = [];
    if (!form.clientName.code.trim() && !form.clientName.name.trim())
      errors.push("Customer is required");
    if (!form.shipper.origin.code.trim() && !form.shipper.origin.name.trim())
      errors.push("Origin is required");
    if (!form.consignee.origin.code.trim() && !form.consignee.origin.name.trim()) {
      errors.push("Destination is required");
    }
    if (!form.product.code.trim()) errors.push("Product is required");
    if (!form.bookDate.trim()) errors.push("Book date is required");
    if (form.piecesLines.length < 1) errors.push("At least one shipment piece is required");
    if (form.vendor.id || form.vendor.code.trim() || form.vendor.name.trim()) {
      if (!form.service.code.trim() && !form.service.name.trim()) {
        errors.push("Service is required when Vendor is selected");
      }
      if (!form.shipper.mobileNo.trim() && !form.shipper.telephone.trim()) {
        errors.push("Shipper mobile number is required for vendor OTP");
      }
      if (!form.shipper.documentType.trim()) {
        errors.push("Shipper Document Type is required for vendor booking");
      }
      if (!form.shipper.documentNo.trim()) {
        errors.push("Shipper Document No is required for vendor booking");
      }
      if (!form.shipper.address1.trim()) {
        errors.push("Shipper Address 1 is required for vendor booking");
      }
      if (!form.content.trim() && !(form.proforma.lines ?? []).some((l) => l.description.trim())) {
        errors.push("Content (or proforma description) is required for vendor booking");
      }
      const valueNum = Number.parseFloat(form.shipmentValue.trim() || "0");
      const proformaSum = (form.proforma.lines ?? []).reduce((acc, l) => {
        const n = Number.parseFloat(l.amount.trim() || "0");
        return acc + (Number.isFinite(n) ? n : 0);
      }, 0);
      if ((!Number.isFinite(valueNum) || valueNum <= 0) && proformaSum <= 0) {
        errors.push("Shipment Value must be greater than 0 for vendor booking");
      }
      if (!form.proforma.invoiceNo.trim() && !form.awbNo.trim()) {
        errors.push("Invoice No is required on the Proforma tab for vendor booking");
      }
      const product = form.product.code.trim().toUpperCase();
      if (product.includes("MEDICINE")) {
        const w = Number.parseFloat(form.chargeWeight.trim() || form.actualWeight.trim() || "0");
        if (!Number.isFinite(w) || w < 0.5) {
          errors.push("MEDICINE product requires charge weight of at least 0.500 kg");
        }
      }
    }
    return errors;
  };

  const handleBook = async () => {
    if (isReadOnly) return;
    const clientErrors = collectClientBookingErrors();
    if (clientErrors.length > 0) {
      setBookingErrors(clientErrors);
      toast.error(clientErrors.join("; "));
      return;
    }
    setBookingErrors([]);

    const payload = normalizeForm({
      ...form,
      awbNo: form.awbNo.trim(),
      deliveryNo: form.forwarding.deliveryAwb.trim(),
      forwardingNo: form.forwarding.forwardingAwb.trim(),
    });

    if (authed) {
      setSaving(true);
      try {
        const vendorServiceError = await validateVendorServicePair(payload);
        if (vendorServiceError) {
          setBookingErrors([vendorServiceError]);
          toast.error(vendorServiceError);
          return;
        }
        const { fields, pieces, charges } = uiFormToShipmentPayload({
          ...payload,
          pickupId: editing?.pickupId ?? payload.pickupId,
        });
        const saved = await saveShipment({
          id: editing?.id ?? null,
          rowVersion: editing?.rowVersion ?? null,
          fields,
          pieces,
          charges,
        });
        const booked = await confirmBooking({
          id: saved.id,
          rowVersion: saved.row_version,
        });
        await rememberPartiesAfterAwbSave({
          shipper: payload.shipper,
          consignee: payload.consignee,
        });
        try {
          const breakdown = await getRatingBreakdown(booked.id);
          applyServerRating(breakdown);
          toast.success(
            `AWB ${booked.awb_no} booked — total ${ratingToSummary(breakdown).totalAmount}`,
          );
        } catch {
          toast.success(`AWB ${booked.awb_no} booked`);
        }

        setEditing((prev) => ({
          ...(prev ?? ({ ...payload, id: booked.id } as AwbRow)),
          id: booked.id,
          rowVersion: booked.row_version,
          status: booked.current_status ?? "BOOKED",
          awbNo: booked.awb_no || payload.awbNo,
        }));
        setForm((f) => ({ ...f, awbNo: booked.awb_no || f.awbNo }));
        setLastSavedForm({ ...payload, awbNo: booked.awb_no || payload.awbNo });
        allowLeaveRef.current = true;
        await clearDraftState();

        const bookedForm = {
          ...payload,
          awbNo: booked.awb_no || payload.awbNo,
        };
        try {
          await ensureBookedShipmentDocuments({
            shipmentId: booked.id,
            form: bookedForm,
            vendor: bookedForm.vendor.code || bookedForm.vendor.name || null,
          });
          setVendorPanelKey((k) => k + 1);
        } catch {
          /* internal AWB label optional on book */
        }

        // Vendor Shipping pipeline (provider-agnostic) — keep form open for OTP/docs
        let shippingEnabled = false;
        let shippingSkipReason: string | null = null;
        try {
          const ctx = await getVendorShippingContext(booked.id);
          shippingEnabled = ctx.shippingApiEnabled;
          if (!shippingEnabled) {
            shippingSkipReason =
              "Vendor shipping is not configured for this vendor. AWB booked locally only — no OTP.";
          }
        } catch (ctxErr) {
          shippingEnabled = false;
          shippingSkipReason = toErrorMessage(
            ctxErr,
            "Could not load vendor shipping config. AWB booked locally only — no OTP.",
          );
        }

        if (shippingEnabled) {
          setVendorBookingBusy(true);
          setVendorMeta({ status: "BOOKING_IN_PROGRESS", provider: undefined });
          try {
            const outcome = await startVendorBooking({
              shipmentId: booked.id,
              rowVersion: booked.row_version,
            });
            setEditing((prev) =>
              prev ? { ...prev, rowVersion: outcome.rowVersion, status: "BOOKED" } : prev,
            );
            setVendorMeta({
              status: outcome.vendorApiStatus as VendorApiStatus,
              vendorAwb: outcome.result.vendorAwb,
              trackingNumber: outcome.result.vendorTrackingNumber,
              bookingId: outcome.result.vendorBookingId,
              provider: outcome.result.vendorProvider,
              serviceCode: outcome.result.vendorServiceCode,
              otpVerified: outcome.result.otpVerified,
              syncStatus: outcome.result.syncStatus,
              lastError: outcome.result.error,
            });
            setVendorPanelKey((k) => k + 1);
            if (outcome.result.status === "OTP_REQUIRED") {
              const mobile =
                outcome.result.shipperMobileMasked ||
                (form.shipper.mobileNo.trim() || form.shipper.telephone.trim()
                  ? maskMobile(form.shipper.mobileNo.trim() || form.shipper.telephone.trim())
                  : null);
              setVendorOtpMobile(mobile);
              setVendorSandboxOtp(outcome.result.sandboxOtp ?? null);
              setVendorOtpError(null);
              setVendorOtpOpen(true);
              if (outcome.result.sandboxOtp) {
                toast.message(
                  `Sandbox OTP ${outcome.result.sandboxOtp} (live SMS not configured)`,
                );
              } else {
                toast.message(
                  outcome.result.message ||
                    "OTP sent to shipper mobile — enter OTP to continue",
                );
              }
            } else if (outcome.result.status === "SUCCESS") {
              toast.success("Vendor booking completed");
              if (outcome.result.vendorAwb) {
                setForm((f) => ({
                  ...f,
                  forwardingNo: outcome.result.vendorAwb || f.forwardingNo,
                  forwarding: {
                    ...f.forwarding,
                    forwardingAwb: outcome.result.vendorAwb || f.forwarding.forwardingAwb,
                  },
                }));
              }
            } else {
              toast.warning(
                outcome.result.message ||
                  "Vendor booking failed. Shipment has been saved locally. Retry later.",
              );
            }
          } catch (ve) {
            toast.warning(toErrorMessage(ve, "Vendor booking failed. Shipment saved locally."));
            setVendorMeta({ status: "VENDOR_PENDING", lastError: toErrorMessage(ve) });
          } finally {
            setVendorBookingBusy(false);
          }
          await refreshLive();
          return;
        }

        if (shippingSkipReason) {
          toast.message(shippingSkipReason);
        }
        await refreshLive();
        // Keep form open so internal AWB Label / Documents Center are available
      } catch (e) {
        const msg = toErrorMessage(e);
        setBookingErrors(msg.split("; ").filter(Boolean));
        toast.error(msg);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!payload.awbNo.trim()) return toast.error("AWB No is required");
    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...payload, id: editing.id, rowVersion: r.rowVersion, status: "BOOKED" }
            : r,
        ),
      );
    } else {
      if (demoRows.some((r) => r.awbNo === payload.awbNo))
        return toast.error("AWB No already exists");
      setDemoRows((prev) => [{ id: crypto.randomUUID(), status: "BOOKED", ...payload }, ...prev]);
    }
    toast.success(`AWB ${payload.awbNo} booked`);
    setLastSavedForm(payload);
    allowLeaveRef.current = true;
    await clearDraftState();
    closeForm();
  };

  const confirmCancelShipment = async () => {
    const target = cancelShipmentTarget ?? editing;
    if (!target?.id) return;
    if (authed) {
      try {
        await cancelShipment({
          id: target.id,
          rowVersion: target.rowVersion ?? 1,
          reason: "Cancelled from AWB Entry",
        });
        await refreshLive();
        toast.success(`Cancelled AWB ${target.awbNo}`);
        setCancelShipmentTarget(null);
        if (editing?.id === target.id) closeForm();
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      return;
    }
    setDemoRows((prev) =>
      prev.map((r) => (r.id === target.id ? { ...r, status: "CANCELLED" } : r)),
    );
    toast.success(`Cancelled AWB ${target.awbNo}`);
    setCancelShipmentTarget(null);
    if (editing?.id === target.id) closeForm();
  };

  const resolveCarrierCode = () =>
    editing?.carrierProviderCode ||
    normalizeVendorToCarrierCode(form.vendor.code) ||
    normalizeVendorToCarrierCode(editing?.vendor?.code) ||
    "FEDEX";

  const patchEditingCarrier = (data: Record<string, unknown> | undefined) => {
    if (!editing || !data) return;
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            rowVersion: Number(data.row_version ?? prev.rowVersion ?? 1),
            carrierProviderCode: data.provider_code
              ? String(data.provider_code)
              : prev.carrierProviderCode,
            carrierBookingRef: data.booking_ref ? String(data.booking_ref) : prev.carrierBookingRef,
            carrierTrackingNo: data.tracking_no ? String(data.tracking_no) : prev.carrierTrackingNo,
            carrierBookingStatus: data.carrier_booking_status
              ? String(data.carrier_booking_status)
              : prev.carrierBookingStatus,
            carrierLabelFileId: data.file_id ? String(data.file_id) : prev.carrierLabelFileId,
          }
        : prev,
    );
  };

  const handleCarrierBook = async () => {
    if (!editing?.id) return;
    if (!authed) {
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              carrierProviderCode: resolveCarrierCode(),
              carrierBookingRef: `DEMO-${Date.now()}`,
              carrierTrackingNo: `TRK-${editing.awbNo || "DEMO"}`,
              carrierBookingStatus: "BOOKED",
            }
          : prev,
      );
      toast.success("Booked with carrier (demo)");
      return;
    }
    setSaving(true);
    try {
      const code = resolveCarrierCode();
      const result = await getCarrierAdapter(code).book({
        shipmentId: editing.id,
        rowVersion: editing.rowVersion ?? 1,
      });
      if (result.status !== "SUCCESS") throw new Error(result.message);
      patchEditingCarrier(result.data);
      await refreshLive();
      toast.success(
        `Carrier booked (${result.data?.provider_code ?? code}) — ${result.data?.tracking_no ?? ""}`,
      );
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCarrierCancel = async () => {
    if (!editing?.id) return;
    if (!authed) {
      setEditing((prev) => (prev ? { ...prev, carrierBookingStatus: "CANCELLED" } : prev));
      toast.success("Carrier booking cancelled (demo)");
      return;
    }
    setSaving(true);
    try {
      const code = resolveCarrierCode();
      const result = await getCarrierAdapter(code).cancel({
        shipmentId: editing.id,
        rowVersion: editing.rowVersion ?? 1,
      });
      if (result.status !== "SUCCESS") throw new Error(result.message);
      patchEditingCarrier(result.data);
      await refreshLive();
      toast.success("Carrier booking cancelled");
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCarrierTrack = async () => {
    if (!editing?.id) return;
    if (!authed) {
      toast.success("Tracking refreshed (demo)");
      return;
    }
    setSaving(true);
    try {
      const code = resolveCarrierCode();
      const result = await getCarrierAdapter(code).track({
        shipmentId: editing.id,
        rowVersion: editing.rowVersion ?? 1,
      });
      if (result.status !== "SUCCESS") throw new Error(result.message);
      patchEditingCarrier(result.data);
      await refreshLive();
      toast.success("Carrier tracking refreshed");
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCarrierLabel = async () => {
    if (!editing?.id) return;
    if (!authed) {
      toast.success("Label metadata ready (demo)");
      return;
    }
    setSaving(true);
    try {
      const code = resolveCarrierCode();
      const result = await getCarrierAdapter(code).label({
        shipmentId: editing.id,
        rowVersion: editing.rowVersion ?? 1,
      });
      if (result.status !== "SUCCESS") throw new Error(result.message);
      patchEditingCarrier(result.data);
      await refreshLive();
      toast.success(
        `Label metadata: ${result.data?.original_name ?? result.data?.file_id ?? "saved"}`,
      );
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCarrierServiceability = async () => {
    const origin = form.shipper.pincode.trim();
    const dest = form.consignee.pincode.trim();
    if (!origin || !dest) {
      toast.error("Shipper and consignee pincode are required for serviceability");
      return;
    }
    if (!authed) {
      toast.success(`Serviceable (demo): ${origin} → ${dest}`);
      return;
    }
    setSaving(true);
    try {
      const code = resolveCarrierCode();
      const result = await getCarrierAdapter(code).serviceability({
        originPincode: origin,
        destinationPincode: dest,
      });
      if (result.status !== "SUCCESS") throw new Error(result.message);
      toast.success(
        `${code}: ${result.message}${result.data?.reason ? ` — ${result.data.reason}` : ""}`,
      );
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const canCarrierActions = Boolean(
    editing?.id &&
      formStatus &&
      formStatus !== "DRAFT" &&
      formStatus !== "CANCELLED" &&
      formStatus !== "VOID",
  );
  const vendorShippingActive = Boolean(
    vendorMeta.status && vendorMeta.status !== "NONE",
  );
  /** Documents Center for booked / in-progress shipments (AWB Label, Invoice, vendor docs). */
  const showShipmentDocumentsCenter = Boolean(
    editing?.id && shipmentNeedsSystemDocuments(formStatus),
  );
  const canRetryVendorBooking = Boolean(
    editing?.id &&
      (vendorMeta.status === "VENDOR_PENDING" || vendorMeta.status === "FAILED"),
  );

  const ensureInternalDocument = async (
    type: string,
  ): Promise<ShipmentDocumentItem | null> => {
    if (!editing?.id) return null;

    // System docs: build HTML sync-fast and return immediately (open in tab/sheet).
    // PDF save continues in background inside ensure* helpers.
    // Authority Letter is vendor-only (API) — not generated here.
    if (type === "AWB_LABEL") {
      const html = buildAwbLabelHtml(formToAwbLabelInput(form));
      void ensureAwbLabelDocument({
        shipmentId: editing.id,
        form,
        force: true,
      }).then(() => setVendorPanelKey((k) => k + 1));
      return {
        type: "AWB_LABEL",
        title: "AWB Label",
        status: "AVAILABLE",
        available: true,
        fileName: `AWB-${form.awbNo || "label"}.pdf`,
        mimeType: "text/html",
        htmlPreview: html,
        source: "SYSTEM",
      };
    }

    if (type === "INVOICE") {
      const html = buildInvoiceHtml(formToInvoiceInput(form));
      void ensureInvoiceDocument({
        shipmentId: editing.id,
        form,
        force: true,
      }).then(() => setVendorPanelKey((k) => k + 1));
      return {
        type: "INVOICE",
        title: "Invoice",
        status: "AVAILABLE",
        available: true,
        fileName: `Invoice-${form.awbNo || "invoice"}.pdf`,
        mimeType: "text/html",
        htmlPreview: html,
        source: "SYSTEM",
      };
    }

    // Vendor / other docs: load stored bytes for preview
    const stored = await getShipmentDocument(editing.id, type);
    if (!stored?.available) return null;
    return stored;
  };

  const runVendorOtpVerify = async (otp: string) => {
    if (!editing?.id) return;
    setVendorBookingBusy(true);
    setVendorOtpError(null);
    try {
      const outcome = await verifyVendorOtp({
        shipmentId: editing.id,
        rowVersion: editing.rowVersion ?? 1,
        otp,
      });
      setEditing((prev) => (prev ? { ...prev, rowVersion: outcome.rowVersion } : prev));
      setVendorMeta({
        status: outcome.vendorApiStatus as VendorApiStatus,
        vendorAwb: outcome.result.vendorAwb,
        trackingNumber: outcome.result.vendorTrackingNumber,
        bookingId: outcome.result.vendorBookingId,
        provider: outcome.result.vendorProvider,
        serviceCode: outcome.result.vendorServiceCode,
        otpVerified: outcome.result.otpVerified,
        syncStatus: outcome.result.syncStatus,
        lastError: outcome.result.error,
      });
      setVendorPanelKey((k) => k + 1);
      if (outcome.result.status === "SUCCESS") {
        setVendorOtpOpen(false);
        toast.success("OTP verified — vendor booking completed");
        if (outcome.result.vendorAwb) {
          setForm((f) => ({
            ...f,
            forwardingNo: outcome.result.vendorAwb || f.forwardingNo,
            forwarding: {
              ...f.forwarding,
              forwardingAwb: outcome.result.vendorAwb || f.forwarding.forwardingAwb,
            },
          }));
        }
      } else if (outcome.result.status === "OTP_REQUIRED") {
        setVendorOtpError(outcome.result.message || "Invalid OTP");
      } else {
        setVendorOtpError(outcome.result.message || "Verification failed");
      }
    } catch (e) {
      setVendorOtpError(toErrorMessage(e));
    } finally {
      setVendorBookingBusy(false);
    }
  };

  const runVendorRetry = async () => {
    if (!editing?.id) return;
    setVendorBookingBusy(true);
    try {
      const outcome = await retryVendorBooking({
        shipmentId: editing.id,
        rowVersion: editing.rowVersion ?? 1,
      });
      setEditing((prev) => (prev ? { ...prev, rowVersion: outcome.rowVersion } : prev));
      setVendorMeta({
        status: outcome.vendorApiStatus as VendorApiStatus,
        vendorAwb: outcome.result.vendorAwb,
        trackingNumber: outcome.result.vendorTrackingNumber,
        bookingId: outcome.result.vendorBookingId,
        provider: outcome.result.vendorProvider,
        serviceCode: outcome.result.vendorServiceCode,
        otpVerified: outcome.result.otpVerified,
        syncStatus: outcome.result.syncStatus,
        lastError: outcome.result.error,
      });
      setVendorPanelKey((k) => k + 1);
      if (outcome.result.status === "OTP_REQUIRED") {
        const mobile =
          outcome.result.shipperMobileMasked ||
          (form.shipper.mobileNo.trim() || form.shipper.telephone.trim()
            ? maskMobile(form.shipper.mobileNo.trim() || form.shipper.telephone.trim())
            : null);
        setVendorOtpMobile(mobile);
        setVendorSandboxOtp(outcome.result.sandboxOtp ?? null);
        setVendorOtpError(null);
        setVendorOtpOpen(true);
        if (outcome.result.sandboxOtp) {
          toast.message(`Sandbox OTP ${outcome.result.sandboxOtp} (live SMS not configured)`);
        } else {
          toast.message(outcome.result.message || "OTP resent to shipper mobile");
        }
      } else if (outcome.result.status === "SUCCESS") {
        toast.success("Vendor booking completed");
      } else {
        toast.warning(outcome.result.message || "Vendor booking failed");
      }
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setVendorBookingBusy(false);
    }
  };
  const carrierBooked = editing?.carrierBookingStatus === "BOOKED";

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (authed) {
      try {
        await cancelShipment({
          id: deleteTarget.id,
          rowVersion: deleteTarget.rowVersion ?? 1,
          reason: "Cancelled from AWB Entry",
        });
        await refreshLive();
        toast.success(`Cancelled AWB ${deleteTarget.awbNo}`);
      } catch (e) {
        toast.error(toErrorMessage(e));
        return;
      } finally {
        setDeleteTarget(null);
      }
      return;
    }
    setDemoRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted AWB ${deleteTarget.awbNo}`);
    setDeleteTarget(null);
  };

  const clearColFilters = (silent = false) => {
    setColFilters(emptyColFilters());
    setPage(1);
    if (!silent) toast.success("Column filters cleared");
  };

  const handleRefresh = async () => {
    setSearchInput("");
    setAppliedSearch(null);
    clearColFilters(true);
    setPage(1);
    if (authed) {
      try {
        await refreshLive();
        toast.success("Refreshed");
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      return;
    }
    toast.success("Refreshed");
  };

  const handleSearch = async () => {
    const query = searchInput.trim();
    setAppliedSearch(query ? { field: searchField, query } : null);
    setPage(1);
    if (!query) return;

    // CourierWala-style: searching an AWB opens the full entry form.
    if (authed) {
      try {
        setSaving(true);
        const field =
          searchField === "forwardingNo"
            ? "forwarding_awb"
            : searchField === "deliveryNo"
              ? "delivery_awb"
              : searchField === "referenceNo"
                ? "reference_no"
                : "awb_no";
        const found = await findShipmentBySearch({ query, field });
        if (!found) {
          toast.error("No AWB entry found");
          return;
        }
        await openEdit({
          ...emptyForm(),
          id: found.id,
          rowVersion: found.row_version,
          status: found.current_status ?? "DRAFT",
          awbNo: found.awb_no ?? query,
        } as AwbRow);
        toast.success(`Opened AWB ${found.awb_no ?? query}`);
      } catch (e) {
        toast.error(toErrorMessage(e, "Search failed"));
      } finally {
        setSaving(false);
      }
      return;
    }

    const match = rows.find((r) => {
      const val = String(r[searchField] ?? "");
      return val.toLowerCase().includes(query.toLowerCase());
    });
    if (match) {
      await openEdit(match);
      toast.success(`Opened AWB ${match.awbNo}`);
    } else {
      toast.error("No AWB entry found");
    }
  };

  const patchPiecesDraft = (patch: Partial<PiecesDraft>) => {
    setPiecesDraft((d) => {
      const next = { ...d, ...patch };
      next.volWeight = calcVolWeight(next);
      next.chargeWeight = calcChargeWeight(next);
      return next;
    });
  };

  const addPiecesLine = () => {
    if (!piecesDraft.noOfPieces.trim()) return toast.error("No. Of Pieces is required");
    const line: PiecesLine = {
      id: crypto.randomUUID(),
      childAwb: "",
      actualWeightPerPc: piecesDraft.actualWeightPerPc,
      pieces: piecesDraft.noOfPieces,
      length: piecesDraft.length,
      breadth: piecesDraft.width,
      height: piecesDraft.height,
      volWeight: piecesDraft.volWeight,
      chargeWeight: piecesDraft.chargeWeight,
    };
    setForm((f) => ({ ...f, piecesLines: [...f.piecesLines, line] }));
    setPiecesDraft(emptyPiecesDraft());
    toast.success("Piece line added");
  };

  const removePiecesLine = (id: string) => {
    setForm((f) => ({ ...f, piecesLines: f.piecesLines.filter((l) => l.id !== id) }));
  };

  const addChargeLine = () => {
    if (!chargeDraft.description) return toast.error("Description is required");
    if (!chargeDraft.itemAmount.trim()) return toast.error("Item Amount is required");
    const amount = chargeDraft.itemAmount;
    const line: ChargeLine = {
      id: crypto.randomUUID(),
      description: chargeDraft.description,
      rate: amount,
      amount,
      fuelApply: chargeDraft.itemFuel,
      fuelAmt: "0",
      taxApply: chargeDraft.tax,
      taxOnFuel: chargeDraft.taxOnFuel,
      igst: "0",
      sgst: "0",
      cgst: "0",
      total: chargeDraft.itemTotal || amount,
      chargesType: "Other",
    };
    setForm((f) => ({ ...f, chargeLines: [...f.chargeLines, line] }));
    setChargeDraft(emptyChargeDraft());
    toast.success("Charge line added");
  };

  const removeChargeLine = (id: string) => {
    setForm((f) => ({ ...f, chargeLines: f.chargeLines.filter((l) => l.id !== id) }));
  };

  const updateProformaDraftAmount = (draft: ProformaDraft) => {
    const qty = Number.parseFloat(draft.quantity) || 0;
    const rate = Number.parseFloat(draft.rate) || 0;
    return (qty * rate).toFixed(2);
  };

  const patchProformaDraft = (patch: Partial<ProformaDraft>) => {
    setProformaDraft((d) => {
      const next = { ...d, ...patch };
      if ("quantity" in patch || "rate" in patch) {
        next.amount = updateProformaDraftAmount(next);
      }
      return next;
    });
  };

  const addProformaUnit = () => {
    const unit = newUnitInput.trim().toUpperCase();
    if (!unit) return toast.error("Unit is required");
    if (proformaUnits.some((u) => u.toUpperCase() === unit)) {
      patchProformaDraft({ unit });
      setAddUnitOpen(false);
      setNewUnitInput("");
      toast.message(`Unit ${unit} already exists`);
      return;
    }
    setProformaUnits((prev) => [...prev, unit]);
    patchProformaDraft({ unit });
    setAddUnitOpen(false);
    setNewUnitInput("");
    toast.success(`Unit ${unit} added`);
  };

  const addProformaLine = () => {
    if (!proformaDraft.description.trim()) return toast.error("Description is required");
    if (!proformaDraft.rate.trim()) return toast.error("Rate is required");
    const amount = updateProformaDraftAmount(proformaDraft);
    const igstPct = Number.parseFloat(proformaDraft.igstPercent) || 0;
    const igstAmount = ((Number.parseFloat(amount) || 0) * igstPct) / 100;
    const line: ProformaLine = {
      id: crypto.randomUUID(),
      boxNo: proformaDraft.boxNo,
      packages: proformaDraft.packages,
      description: proformaDraft.description.trim(),
      hsCode: proformaDraft.hsnCode,
      quantity: proformaDraft.quantity,
      weight: proformaDraft.weight,
      unit: proformaDraft.unit,
      rate: proformaDraft.rate,
      amount,
      igstPercent: proformaDraft.igstPercent,
      igstAmount: igstAmount.toFixed(2),
    };
    setForm((f) => ({ ...f, proforma: { ...f.proforma, lines: [...f.proforma.lines, line] } }));
    setProformaDraft(emptyProformaDraft());
    toast.success("Proforma line added");
  };

  const removeProformaLine = (id: string) => {
    setForm((f) => ({
      ...f,
      proforma: { ...f.proforma, lines: f.proforma.lines.filter((l) => l.id !== id) },
    }));
  };

  const addVendorChargeLine = () => {
    if (!vendorChargeDraft.description) return toast.error("Description is required");
    if (!vendorChargeDraft.amount.trim()) return toast.error("Amount is required");
    const amount = vendorChargeDraft.amount;
    const line: VendorChargeLine = {
      id: crypto.randomUUID(),
      description: vendorChargeDraft.description,
      rate: amount,
      amount,
      fuelApply: vendorChargeDraft.fuel,
      fuelAmt: vendorChargeDraft.fuelAmt,
      taxApply: vendorChargeDraft.tax,
      taxOnFuel: vendorChargeDraft.taxOnFuel,
      igst: "0",
      sgst: "0",
      cgst: "0",
      total: vendorChargeDraft.total || amount,
      chargesType: "Vendor",
    };
    setForm((f) => ({
      ...f,
      forwarding: { ...f.forwarding, vendorChargeLines: [...f.forwarding.vendorChargeLines, line] },
    }));
    setVendorChargeDraft(emptyVendorChargeDraft());
    toast.success("Vendor charge added");
  };

  const removeVendorChargeLine = (id: string) => {
    setForm((f) => ({
      ...f,
      forwarding: {
        ...f.forwarding,
        vendorChargeLines: f.forwarding.vendorChargeLines.filter((l) => l.id !== id),
      },
    }));
  };

  const patchVendorChargeDraft = (patch: Partial<VendorChargeDraft>) => {
    setVendorChargeDraft((d) => {
      const next = { ...d, ...patch };
      next.total = next.amount || "0.00";
      return next;
    });
  };

  const addKycDocument = (file: File) => {
    const doc: KycDocument = {
      id: crypto.randomUUID(),
      fileName: file.name,
      entryType: kycDocType,
      entryDate: formatDisplayDate(todayIso()),
    };
    setForm((f) => ({ ...f, kyc: { documents: [...f.kyc.documents, doc] } }));
    toast.success("KYC document added");
  };

  const handleKycFile = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    addKycDocument(file);
  };

  const removeKycDocument = (id: string) => {
    setForm((f) => ({ ...f, kyc: { documents: f.kyc.documents.filter((d) => d.id !== id) } }));
  };

  const patchParty = (side: "shipper" | "consignee", patch: Partial<PartyDetails>) => {
    setForm((f) => ({ ...f, [side]: { ...f[side], ...patch } }));
  };

  const handleClientChange = async (v: LookupPair) => {
    const cleared = !v.id && !v.code.trim() && !v.name.trim();
    if (cleared) {
      clientLoadSeqRef.current += 1;
      setLoadedClientProfile(null);
      setClientLoading(false);
      setForm((f) => ({ ...f, clientName: emptyPair(), paymentType: "" }));
      return;
    }

    setForm((f) => ({ ...f, clientName: v }));

    if (!authed) return;

    const seq = ++clientLoadSeqRef.current;
    setClientLoading(true);
    try {
      const profile = await loadClientProfile({ id: v.id, code: v.code, name: v.name });
      if (seq !== clientLoadSeqRef.current) return;
      if (!profile) {
        setLoadedClientProfile(null);
        toast.error("Client profile not found");
        return;
      }

      const hydrate = clientProfileToAwbHydrate(profile);
      setLoadedClientProfile(profile);
      setForm((f) => ({
        ...f,
        clientName: hydrate.clientName,
        paymentType: hydrate.paymentType,
        instruction: hydrate.instruction || f.instruction,
        shipmentCurrency: profile.defaults.currency || f.shipmentCurrency,
        fieldExecutive: hydrate.fieldExecutive.code
          ? hydrate.fieldExecutive
          : f.fieldExecutive,
        shipper: {
          ...f.shipper,
          ...hydrate.shipper,
          origin: f.shipper.origin.code.trim() ? f.shipper.origin : DEFAULT_SHIPPER_ORIGIN,
        },
        proforma: {
          ...(f.proforma ?? emptyProforma()),
          currency: profile.defaults.currency || f.proforma?.currency || "INR",
        },
      }));

      if (hydrate.paymentTypeMissing) {
        toast.warning("No default payment type configured for this client.");
      }
    } catch (e) {
      if (seq !== clientLoadSeqRef.current) return;
      toast.error(toErrorMessage(e, "Failed to load client profile"));
    } finally {
      if (seq === clientLoadSeqRef.current) setClientLoading(false);
    }
  };

  const paymentTypeReadOnly =
    !formSetupSettings.allowPaymentTypeOverride &&
    Boolean(form.clientName.id || form.clientName.code.trim()) &&
    Boolean(form.paymentType);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Transaction", showForm ? "AWB Entry" : "AWB Entry List"]} />

      {showForm ? (
        <Card className="min-w-0 overflow-hidden border p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="h-auto gap-1 bg-transparent p-0">
                {(["awb", "proforma", "forwarding", "kyc"] as const).map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="rounded-full px-4 py-1.5 capitalize data-[state=active]:bg-sidebar data-[state=active]:text-sidebar-foreground data-[state=active]:shadow-none"
                  >
                    {tab === "awb"
                      ? "AWB"
                      : tab === "kyc"
                        ? "KYC"
                        : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TooltipProvider delayDuration={200}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {!isReadOnly ? (
                    <div
                      className="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                      aria-live="polite"
                    >
                      {draftUiStatus === "saving" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : draftUiStatus === "saved" ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700 dark:text-emerald-400">Draft Saved</span>
                          {draftSavedAt ? (
                            <span className="text-muted-foreground">
                              · Last saved: {formatDraftSavedAt(draftSavedAt)}
                            </span>
                          ) : null}
                        </>
                      ) : draftUiStatus === "error" ? (
                        <>
                          <Cloud className="h-3.5 w-3.5" />
                          <span>Draft save failed (kept locally if possible)</span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <IconButton label="Form Setup" onClick={openFormSetup}>
                    <Settings className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Clone Entry" onClick={openEntry}>
                    <Copy className="h-4 w-4" />
                  </IconButton>
                  <Select value="awbNo" disabled>
                    <SelectTrigger className="h-9 w-[8.5rem]">
                      <SelectValue>AWB No</SelectValue>
                    </SelectTrigger>
                  </Select>
                  <Input
                    value={formToolbarSearch}
                    onChange={(e) => setFormToolbarSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFormToolbarSearch();
                    }}
                    placeholder="Search"
                    className="h-9 w-36"
                  />
                  <Button
                    size="icon"
                    className="h-9 w-9 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={handleFormToolbarSearch}
                    aria-label="Search AWB"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </TooltipProvider>
            </div>

            <TabsContent value="awb" className="mt-0">
              <fieldset disabled={isReadOnly} className="min-w-0 border-0 p-0 disabled:opacity-90">
                <div className="flex flex-wrap gap-x-6 gap-y-2 border-b bg-muted/10 px-4 py-2 text-xs text-muted-foreground">
                  <span>
                    AWB UserID:{" "}
                    <span className="font-medium text-foreground">{form.awbUserId}</span>
                  </span>
                  <span>
                    POD UserID:{" "}
                    <span className="font-medium text-foreground">{form.podUserId || "—"}</span>
                  </span>
                  <span>Manifest No ({form.manifestNo})</span>
                  <span>
                    Manifest Date: {form.manifestDate ? formatDisplayDate(form.manifestDate) : "—"}
                  </span>
                  <span>Invoice No: {form.invoiceNo || "—"}</span>
                  <span>Debit Note No ({form.debitNoteNo})</span>
                  <span>Credit Note No ({form.creditNoteNo})</span>
                  <span>Flight No: {form.flightNo || "—"}</span>
                </div>

                <div className="p-4 md:p-6">
                  <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <FieldWrapper label="AWB No.">
                      <div className="flex items-center gap-2">
                        <Input
                          value={form.awbNo}
                          disabled={!!editing || isReadOnly}
                          onChange={(e) => setForm((f) => ({ ...f, awbNo: e.target.value }))}
                          className="flex-1"
                        />
                        {formStatus ? (
                          <Badge
                            variant={
                              formStatus === "BOOKED"
                                ? "default"
                                : formStatus === "CANCELLED"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="shrink-0"
                          >
                            {formStatus}
                          </Badge>
                        ) : null}
                      </div>
                    </FieldWrapper>
                    <FieldWrapper label="Book Date">
                      <Input
                        type="date"
                        value={form.bookDate}
                        onChange={(e) => setForm((f) => ({ ...f, bookDate: e.target.value }))}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Time">
                      <Input
                        value={form.bookTime}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            bookTime: e.target.value.replace(/\D/g, "").slice(0, 4),
                          }))
                        }
                        placeholder="HHmm"
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Reference No.">
                      <Input
                        value={form.referenceNo}
                        onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Client Name" required>
                      <div className="space-y-1">
                        <LookupPairInput
                          lookup="customer"
                          value={form.clientName}
                          onChange={(v) => void handleClientChange(v)}
                          disabled={clientLoading}
                        />
                        {clientLoading ? (
                          <p className="text-xs text-muted-foreground">Loading client profile…</p>
                        ) : loadedClientProfile?.paymentType ? (
                          <p className="text-xs text-muted-foreground">
                            Payment Type from Client Master: {loadedClientProfile.paymentType}
                          </p>
                        ) : null}
                      </div>
                    </FieldWrapper>
                  </div>

                  {editing?.id && (formStatus === "BOOKED" || showShipmentDocumentsCenter) ? (
                    <ShipmentDocumentQuickLinks
                      shipmentId={editing.id}
                      refreshKey={vendorPanelKey}
                      onOpenCenter={() => {
                        document
                          .getElementById("shipment-documents-center")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      onEnsureDocument={ensureInternalDocument}
                    />
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <PartySection
                      title="Shipper Details"
                      party={form.shipper}
                      onChange={(p) => patchParty("shipper", p)}
                      originLookup="destination"
                    />
                    <PartySection
                      title="Consignee Details"
                      party={form.consignee}
                      onChange={(p) => patchParty("consignee", p)}
                      originLookup="destination"
                      destinationRequired={!formSetupSettings.consigneeNotRequired}
                    />
                    <ServicesSection
                      form={form}
                      setForm={setForm}
                      airlineRequired={!formSetupSettings.airlineNotRequired}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="flex items-end gap-2">
                      <Button
                        className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-600/90"
                        onClick={() =>
                          toast.info("Customer charges will be enabled with backend wiring")
                        }
                      >
                        Customer Charges
                      </Button>
                      <Input
                        value={form.customerChargesTotal}
                        readOnly
                        className="bg-muted/30"
                        placeholder="Total Amount"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button
                        className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-600/90"
                        onClick={() =>
                          toast.info("Vendor charges will be enabled with backend wiring")
                        }
                      >
                        Vendor Charges
                      </Button>
                      <Input
                        value={form.vendorChargesTotal}
                        readOnly
                        className="bg-muted/30"
                        placeholder="Total Amount"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                        onClick={() =>
                          toast.info("Rate compare will be enabled with backend wiring")
                        }
                      >
                        Rate Compare
                      </Button>
                    </div>
                  </div>

                  <Collapsible open={piecesOpen} onOpenChange={setPiecesOpen} className="mt-4">
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60">
                      Click here to enter Pieces details Or Press [Alt + u]
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", piecesOpen && "rotate-180")}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border border-t-0 p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            toast.info("Import MTS will be enabled with backend wiring")
                          }
                        >
                          Import MTS
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-emerald-600"
                          onClick={() =>
                            toast.info("Excel format download will be enabled with backend wiring")
                          }
                        >
                          Download Excel File Format
                        </Button>
                        <Input type="file" className="max-w-[200px] h-9" />
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-600/90 gap-1"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Upload
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-9">
                        <FieldWrapper label="Measurement Unit">
                          <Select
                            value={piecesDraft.measurementUnit}
                            onValueChange={(v) => patchPiecesDraft({ measurementUnit: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MEASUREMENT_UNITS.map((u) => (
                                <SelectItem key={u} value={u}>
                                  {u}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldWrapper>
                        <FieldWrapper label="Actl Weight/PCS">
                          <Input
                            value={piecesDraft.actualWeightPerPc}
                            onChange={(e) =>
                              patchPiecesDraft({ actualWeightPerPc: e.target.value })
                            }
                          />
                        </FieldWrapper>
                        <FieldWrapper label="No. Of Pieces">
                          <Input
                            value={piecesDraft.noOfPieces}
                            onChange={(e) => patchPiecesDraft({ noOfPieces: e.target.value })}
                          />
                        </FieldWrapper>
                        <FieldWrapper label="Length">
                          <Input
                            value={piecesDraft.length}
                            onChange={(e) => patchPiecesDraft({ length: e.target.value })}
                          />
                        </FieldWrapper>
                        <FieldWrapper label="Width">
                          <Input
                            value={piecesDraft.width}
                            onChange={(e) => patchPiecesDraft({ width: e.target.value })}
                          />
                        </FieldWrapper>
                        <FieldWrapper label="Height">
                          <Input
                            value={piecesDraft.height}
                            onChange={(e) => patchPiecesDraft({ height: e.target.value })}
                          />
                        </FieldWrapper>
                        <FieldWrapper label="Division">
                          <Input
                            value={piecesDraft.division}
                            onChange={(e) => patchPiecesDraft({ division: e.target.value })}
                          />
                        </FieldWrapper>
                        <FieldWrapper label="Vol Weight (Discount - 0 %)">
                          <Input value={piecesDraft.volWeight} readOnly className="bg-muted/30" />
                        </FieldWrapper>
                        <FieldWrapper label="Chrg Weight">
                          <Input
                            value={piecesDraft.chargeWeight}
                            readOnly
                            className="bg-muted/30"
                          />
                        </FieldWrapper>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                          onClick={addPiecesLine}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add
                        </Button>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                          <TableHeader>
                            <TableRow className="bg-sidebar hover:bg-sidebar">
                              {[
                                "Child AWB",
                                "Actl Weight/PCS",
                                "Pieces",
                                "Length",
                                "Breadth",
                                "Height",
                                "Volumetric Weight",
                                "Charge Weight",
                                "Action",
                              ].map((h) => (
                                <TableHead key={h} className="text-sidebar-foreground">
                                  {h}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {form.piecesLines.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={9}
                                  className="h-16 text-center text-muted-foreground"
                                >
                                  No piece lines added
                                </TableCell>
                              </TableRow>
                            ) : (
                              form.piecesLines.map((l) => (
                                <TableRow key={l.id}>
                                  <TableCell>{l.childAwb || "—"}</TableCell>
                                  <TableCell>{l.actualWeightPerPc}</TableCell>
                                  <TableCell>{l.pieces}</TableCell>
                                  <TableCell>{l.length}</TableCell>
                                  <TableCell>{l.breadth}</TableCell>
                                  <TableCell>{l.height}</TableCell>
                                  <TableCell>{l.volWeight}</TableCell>
                                  <TableCell>{l.chargeWeight}</TableCell>
                                  <TableCell>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => removePiecesLine(l.id)}
                                      aria-label="Delete piece line"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <Collapsible open={chargesOpen} onOpenChange={setChargesOpen} className="mt-4">
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60">
                      Click here to enter Charge details Or Press [Alt + c]
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", chargesOpen && "rotate-180")}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border border-t-0 p-4">
                      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
                        {(
                          [
                            ["Contract Charges", chargeSummary.contractCharges],
                            ["Other Charges", chargeSummary.otherCharges],
                            ["Sub Total", chargeSummary.subTotal],
                            ["Total Fuel", chargeSummary.totalFuel],
                            ["IGST", chargeSummary.igst],
                            ["CGST", chargeSummary.cgst],
                            ["SGST", chargeSummary.sgst],
                            ["Total Amount", chargeSummary.totalAmount],
                          ] as const
                        ).map(([label, val]) => (
                          <FieldWrapper key={label} label={label}>
                            <Input value={val} readOnly className="bg-muted/30" />
                          </FieldWrapper>
                        ))}
                      </div>
                      {authed && editing?.id ? (
                        <div className="mb-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving || isReadOnly}
                            onClick={() => {
                              void (async () => {
                                try {
                                  const breakdown = await calculateShipmentRating(editing.id!);
                                  applyServerRating(breakdown);
                                  await refreshLive();
                                  toast.success(
                                    `Rated — total ${ratingToSummary(breakdown).totalAmount}`,
                                  );
                                } catch (e) {
                                  toast.error(toErrorMessage(e));
                                }
                              })();
                            }}
                          >
                            Calculate rating
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving || isReadOnly}
                            onClick={() => {
                              void (async () => {
                                try {
                                  const breakdown = await recalculateShipmentRating({
                                    id: editing.id!,
                                    row_version: editing.rowVersion ?? 1,
                                  });
                                  applyServerRating(breakdown);
                                  await refreshLive();
                                  toast.success(
                                    `Recalculated — total ${ratingToSummary(breakdown).totalAmount}`,
                                  );
                                } catch (e) {
                                  toast.error(toErrorMessage(e));
                                }
                              })();
                            }}
                          >
                            Recalculate
                          </Button>
                          {ratingSummary ? (
                            <span className="self-center text-xs text-muted-foreground">
                              Server rating: freight {ratingSummary.freight} · fuel{" "}
                              {ratingSummary.fuel} · tax {ratingSummary.tax} · total{" "}
                              {ratingSummary.totalAmount}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
                        <FieldWrapper label="Description">
                          <Select
                            value={chargeDraft.description || undefined}
                            onValueChange={(v) =>
                              setChargeDraft((d) => ({
                                ...d,
                                description: v,
                                itemTotal: d.itemAmount || "0",
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {CHARGE_DESCRIPTIONS.map((d) => (
                                <SelectItem key={d} value={d}>
                                  {d}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldWrapper>
                        <FieldWrapper label="Item Amount">
                          <Input
                            value={chargeDraft.itemAmount}
                            onChange={(e) =>
                              setChargeDraft((d) => ({
                                ...d,
                                itemAmount: e.target.value,
                                itemTotal: e.target.value || "0",
                              }))
                            }
                          />
                        </FieldWrapper>
                        <FieldWrapper label="Item Fuel (0%)">
                          <Select
                            value={chargeDraft.itemFuel}
                            onValueChange={(v) => setChargeDraft((d) => ({ ...d, itemFuel: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {YES_NO.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldWrapper>
                        <FieldWrapper label="Tax On Fuel">
                          <Select
                            value={chargeDraft.taxOnFuel}
                            onValueChange={(v) => setChargeDraft((d) => ({ ...d, taxOnFuel: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {YES_NO.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldWrapper>
                        <FieldWrapper label="Tax">
                          <Select
                            value={chargeDraft.tax}
                            onValueChange={(v) => setChargeDraft((d) => ({ ...d, tax: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {YES_NO.map((v) => (
                                <SelectItem key={v} value={v}>
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldWrapper>
                        <FieldWrapper label="Item Total">
                          <Input value={chargeDraft.itemTotal} readOnly className="bg-muted/30" />
                        </FieldWrapper>
                        <div className="flex items-end">
                          <Button
                            className="w-full bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                            onClick={addChargeLine}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Add
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[960px] text-sm">
                          <TableHeader>
                            <TableRow className="bg-sidebar hover:bg-sidebar">
                              {[
                                "Description",
                                "Rate",
                                "Amount",
                                "Fuel Apply",
                                "Fuel Amt",
                                "TaxApply",
                                "Tax On Fuel",
                                "IGST",
                                "SGST",
                                "CGST",
                                "Total",
                                "Charges Type",
                                "Action",
                              ].map((h) => (
                                <TableHead
                                  key={h}
                                  className="whitespace-nowrap text-sidebar-foreground"
                                >
                                  {h}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {form.chargeLines.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={13}
                                  className="h-16 text-center text-muted-foreground"
                                >
                                  No charge lines added
                                </TableCell>
                              </TableRow>
                            ) : (
                              form.chargeLines.map((l) => (
                                <TableRow key={l.id}>
                                  <TableCell>{l.description}</TableCell>
                                  <TableCell>{l.rate}</TableCell>
                                  <TableCell>{l.amount}</TableCell>
                                  <TableCell>{l.fuelApply}</TableCell>
                                  <TableCell>{l.fuelAmt}</TableCell>
                                  <TableCell>{l.taxApply}</TableCell>
                                  <TableCell>{l.taxOnFuel}</TableCell>
                                  <TableCell>{l.igst}</TableCell>
                                  <TableCell>{l.sgst}</TableCell>
                                  <TableCell>{l.cgst}</TableCell>
                                  <TableCell>{l.total}</TableCell>
                                  <TableCell>{l.chargesType}</TableCell>
                                  <TableCell>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => removeChargeLine(l.id)}
                                      aria-label="Delete charge line"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  <FormSection title="Shipment Details" className="mt-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <FieldWrapper label="Payment Type">
                        <Select
                          value={form.paymentType || undefined}
                          onValueChange={(v) => setForm((f) => ({ ...f, paymentType: v }))}
                          disabled={isReadOnly || paymentTypeReadOnly || clientLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_TYPES.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {paymentTypeReadOnly ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Locked to Client Master. Enable “Allow Payment Type Override” in Form
                            Setup to edit.
                          </p>
                        ) : null}
                      </FieldWrapper>
                      <FieldWrapper label="Content">
                        <Input
                          value={form.content}
                          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Instruction">
                        <Input
                          value={form.instruction}
                          onChange={(e) => setForm((f) => ({ ...f, instruction: e.target.value }))}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Field Executive">
                        <LookupPairInput
                          lookup="fieldExecutive"
                          value={form.fieldExecutive}
                          onChange={(v) => setForm((f) => ({ ...f, fieldExecutive: v }))}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Cash Receipt No.">
                        <Input
                          value={form.cashReceiptNo}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, cashReceiptNo: e.target.value }))
                          }
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Amount Received">
                        <Input
                          value={form.amountReceived}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, amountReceived: e.target.value }))
                          }
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Balance Amount">
                        <Input
                          value={form.balanceAmount}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, balanceAmount: e.target.value }))
                          }
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Cash Receipt Date">
                        <Input
                          type="date"
                          value={form.cashReceiptDate}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, cashReceiptDate: e.target.value }))
                          }
                        />
                      </FieldWrapper>
                      <div className="flex items-end pb-1">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="lock"
                            checked={form.lock}
                            onCheckedChange={(c) => setForm((f) => ({ ...f, lock: c === true }))}
                          />
                          <label htmlFor="lock" className="text-sm text-muted-foreground">
                            Lock
                          </label>
                        </div>
                      </div>
                    </div>
                  </FormSection>
                </div>
              </fieldset>
              {editing?.id &&
              (showShipmentDocumentsCenter || vendorShippingActive || vendorBookingBusy) ? (
                <div className="space-y-4 border-t px-4 py-4 md:px-6">
                  {vendorShippingActive || vendorBookingBusy ? (
                    vendorMeta.status === "VENDOR_BOOKED" || vendorMeta.otpVerified ? (
                      <ShipmentBookedBanner
                        vendorAwb={vendorMeta.vendorAwb}
                        trackingNumber={vendorMeta.trackingNumber}
                        provider={vendorMeta.provider}
                      />
                    ) : (
                      <VendorBookingStatusStrip
                        meta={vendorMeta}
                        bookingInProgress={vendorBookingBusy}
                        canRetry={canRetryVendorBooking && !vendorBookingBusy}
                        onRetry={() => void runVendorRetry()}
                      />
                    )
                  ) : null}
                  {showShipmentDocumentsCenter ? (
                    <div id="shipment-documents-center">
                      <ShipmentDocumentsCard
                        shipmentId={editing.id}
                        refreshKey={vendorPanelKey}
                        poll={vendorShippingActive}
                        onEnsureDocument={ensureInternalDocument}
                      />
                    </div>
                  ) : null}
                  {vendorShippingActive || vendorBookingBusy ? (
                    <VendorActivityTimeline shipmentId={editing.id} refreshKey={vendorPanelKey} />
                  ) : null}
                </div>
              ) : null}
              {canCarrierActions && !vendorShippingActive ? (
                <div className="border-t px-4 py-4 md:px-6">
                  <FormSection title="Carrier booking & tracking">
                    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <FieldWrapper label="Provider">
                        <Input
                          readOnly
                          className="bg-muted/30"
                          value={editing?.carrierProviderCode || resolveCarrierCode()}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Booking status">
                        <Input
                          readOnly
                          className="bg-muted/30"
                          value={editing?.carrierBookingStatus || "NONE"}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Booking ref">
                        <Input
                          readOnly
                          className="bg-muted/30"
                          value={editing?.carrierBookingRef || ""}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Tracking no">
                        <Input
                          readOnly
                          className="bg-muted/30"
                          value={editing?.carrierTrackingNo || ""}
                        />
                      </FieldWrapper>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!carrierBooked ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => void handleCarrierBook()}
                        >
                          Book with carrier
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void handleCarrierCancel()}
                          >
                            Cancel booking
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void handleCarrierTrack()}
                          >
                            Refresh tracking
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void handleCarrierLabel()}
                          >
                            Download label
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void handleCarrierServiceability()}
                      >
                        Check serviceability
                      </Button>
                      <span className="self-center text-xs text-muted-foreground">
                        Supported: {SUPPORTED_CARRIER_CODES.join(", ")}
                      </span>
                    </div>
                  </FormSection>
                </div>
              ) : null}
              <div className="border-t px-4 py-4 md:px-6">
                {bookingErrors.length > 0 ? (
                  <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {bookingErrors.map((msg) => (
                      <div key={msg}>{msg}</div>
                    ))}
                  </div>
                ) : null}
                <AwbFormFooter
                  showPrevious={false}
                  readOnly={isReadOnly}
                  canBook={canBook}
                  canCancelShipment={canCancelShipment}
                  saving={saving}
                  onSave={handleSave}
                  onBook={handleBook}
                  onCancelShipment={() => editing && setCancelShipmentTarget(editing)}
                  onNext={goNextTab}
                  onCancel={requestCloseForm}
                />
              </div>
            </TabsContent>

            <TabsContent value="proforma" className="mt-0">
              <div className="p-4 md:p-6">
                <div className={cn(isReadOnly && "pointer-events-none opacity-90")}>
                  <FormSection title="Manifest GST Detail">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <FieldWrapper label="CSB_Type">
                        <Select
                          value={form.proforma.csbType}
                          onValueChange={(v) => patchProforma({ csbType: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CSB_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                      <FieldWrapper label="Term Of Invoice">
                        <Select
                          value={form.proforma.termOfInvoice || undefined}
                          onValueChange={(v) => patchProforma({ termOfInvoice: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {TERM_OF_INVOICE.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                      <YesNoField
                        label="GST Invoice"
                        value={form.proforma.gstInvoice}
                        onChange={(v) => patchProforma({ gstInvoice: v })}
                      />
                      <FieldWrapper label="Invoice No">
                        <Input
                          value={form.proforma.invoiceNo}
                          onChange={(e) => patchProforma({ invoiceNo: e.target.value })}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Invoice Date">
                        <Input
                          type="date"
                          value={form.proforma.invoiceDate}
                          onChange={(e) => patchProforma({ invoiceDate: e.target.value })}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Department No">
                        <Input
                          value={form.proforma.departmentNo}
                          onChange={(e) => patchProforma({ departmentNo: e.target.value })}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Export Reason">
                        <Select
                          value={form.proforma.exportReason}
                          onValueChange={(v) => patchProforma({ exportReason: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPORT_REASONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                      <FieldWrapper label="Format">
                        <Select
                          value={form.proforma.format || undefined}
                          onValueChange={(v) => patchProforma({ format: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {PROFORMA_FORMATS.map((f) => (
                              <SelectItem key={f} value={f}>
                                {f}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                    </div>
                  </FormSection>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                    <FormSection title="Import Proforma">
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-destructive"
                          onClick={() =>
                            toast.info("Excel format download will be enabled with backend wiring")
                          }
                        >
                          Download Excel File Format
                        </Button>
                        <Input type="file" className="max-w-[220px] h-9" />
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-600/90 gap-1"
                          onClick={() =>
                            toast.info("Proforma import will be enabled with backend wiring")
                          }
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Upload
                        </Button>
                      </div>
                    </FormSection>
                    <FormSection title="Currency" className="min-w-[12rem]">
                      <Select
                        value={form.proforma.currency}
                        onValueChange={(v) => patchProforma({ currency: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {PROFORMA_CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormSection>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-11">
                    <FieldWrapper label="Box No">
                      <Select
                        value={proformaDraft.boxNo}
                        onValueChange={(v) => patchProformaDraft({ boxNo: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BOX_NUMBERS.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldWrapper>
                    <FieldWrapper label="Packages">
                      <Input
                        value={proformaDraft.packages}
                        onChange={(e) => patchProformaDraft({ packages: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Description">
                      <Input
                        value={proformaDraft.description}
                        onChange={(e) => patchProformaDraft({ description: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="HSN Code">
                      <Input
                        value={proformaDraft.hsnCode}
                        onChange={(e) => patchProformaDraft({ hsnCode: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Quantity">
                      <Input
                        value={proformaDraft.quantity}
                        onChange={(e) => patchProformaDraft({ quantity: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Weight">
                      <Input
                        value={proformaDraft.weight}
                        onChange={(e) => patchProformaDraft({ weight: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Unit">
                      <div className="flex gap-1">
                        <Select
                          value={proformaDraft.unit}
                          onValueChange={(v) => patchProformaDraft({ unit: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {proformaUnits.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          title="Add custom unit"
                          aria-label="Add custom unit"
                          className="shrink-0 px-2"
                          onClick={() => {
                            setNewUnitInput("");
                            setAddUnitOpen(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </FieldWrapper>
                    <FieldWrapper label="Rate">
                      <Input
                        value={proformaDraft.rate}
                        onChange={(e) => patchProformaDraft({ rate: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addProformaLine();
                          }
                        }}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Amount">
                      <Input value={proformaDraft.amount} readOnly className="bg-muted/30" />
                    </FieldWrapper>
                    <div className="flex items-end lg:col-span-2">
                      <Button
                        type="button"
                        className="w-full bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                        onClick={addProformaLine}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add line
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-sm">
                    <span>
                      Total Record:{" "}
                      <span className="font-semibold text-primary">
                        {proformaSummary.totalRecord}
                      </span>
                    </span>
                    <span>
                      Quantity:{" "}
                      <span className="font-semibold text-primary">{proformaSummary.quantity}</span>
                    </span>
                    <span>
                      Weight:{" "}
                      <span className="font-semibold text-primary">{proformaSummary.weight}</span>
                    </span>
                    <span>
                      Amount:{" "}
                      <span className="font-semibold text-primary">{proformaSummary.amount}</span>
                    </span>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[960px] text-sm">
                      <TableHeader>
                        <TableRow className="bg-sidebar hover:bg-sidebar">
                          {[
                            "Box No",
                            "Package",
                            "Description",
                            "HS Code",
                            "Quantity",
                            "Weight",
                            "Unit",
                            "Rate",
                            "Amount",
                            "IGST %",
                            "IGST Amount",
                            "Action",
                          ].map((h) => (
                            <TableHead
                              key={h}
                              className="whitespace-nowrap text-sidebar-foreground"
                            >
                              {h}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {form.proforma.lines.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={12}
                              className="h-16 text-center text-muted-foreground"
                            >
                              No proforma lines added
                            </TableCell>
                          </TableRow>
                        ) : (
                          form.proforma.lines.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell>{l.boxNo}</TableCell>
                              <TableCell>{l.packages}</TableCell>
                              <TableCell>{l.description}</TableCell>
                              <TableCell>{l.hsCode}</TableCell>
                              <TableCell>{l.quantity}</TableCell>
                              <TableCell>{l.weight}</TableCell>
                              <TableCell>{l.unit}</TableCell>
                              <TableCell>{l.rate}</TableCell>
                              <TableCell>{l.amount}</TableCell>
                              <TableCell>{l.igstPercent}</TableCell>
                              <TableCell>{l.igstAmount}</TableCell>
                              <TableCell>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => removeProformaLine(l.id)}
                                  aria-label="Delete proforma line"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </table>
                  </div>
                </div>
                <div className="mt-6">
                  <AwbFormFooter
                    showPrevious
                    onPrevious={goPrevTab}
                    readOnly={isReadOnly}
                    canBook={canBook}
                    canCancelShipment={canCancelShipment}
                    saving={saving}
                    onSave={handleSave}
                    onBook={handleBook}
                    onCancelShipment={() => editing && setCancelShipmentTarget(editing)}
                    onNext={goNextTab}
                    onCancel={requestCloseForm}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="forwarding" className="mt-0">
              <div className="p-4 md:p-6">
                <div className={cn(isReadOnly && "pointer-events-none opacity-90")}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <FieldWrapper label="Delivery AWB">
                      <Input
                        value={form.forwarding.deliveryAwb}
                        onChange={(e) => patchForwarding({ deliveryAwb: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Forwarding AWB">
                      <Input
                        value={form.forwarding.forwardingAwb}
                        onChange={(e) => patchForwarding({ forwardingAwb: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Delivery Product">
                      <LookupPairInput
                        lookup="product"
                        value={form.forwarding.deliveryProduct}
                        onChange={(v) => patchForwarding({ deliveryProduct: v })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Delivery Vendor">
                      <LookupPairInput
                        lookup="vendor"
                        value={form.forwarding.deliveryVendor}
                        onChange={(v) => patchForwarding({ deliveryVendor: v })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Delivery Service">
                      <LookupPairInput
                        lookup="product"
                        value={form.forwarding.deliveryService}
                        onChange={(v) => patchForwarding({ deliveryService: v })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Vendor Weight">
                      <Input
                        value={form.forwarding.vendorWeight}
                        onChange={(e) => patchForwarding({ vendorWeight: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Vendor Amount">
                      <Input
                        value={form.forwarding.vendorAmount}
                        onChange={(e) => patchForwarding({ vendorAmount: e.target.value })}
                      />
                    </FieldWrapper>
                    <FieldWrapper label="Vendor Invoice">
                      <Input
                        value={form.forwarding.vendorInvoice}
                        onChange={(e) => patchForwarding({ vendorInvoice: e.target.value })}
                      />
                    </FieldWrapper>
                  </div>

                  <Collapsible
                    open={vendorChargesOpen}
                    onOpenChange={setVendorChargesOpen}
                    className="mt-4"
                  >
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60">
                      Click here to enter Vendor Charge details Or Press [Alt + w]
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          vendorChargesOpen && "rotate-180",
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border border-t-0 p-4">
                      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
                        {(
                          [
                            ["Contract Charges", vendorChargeSummary.contractCharges],
                            ["Other Charges", vendorChargeSummary.otherCharges],
                            ["Sub Total", vendorChargeSummary.subTotal],
                            ["Total Fuel", vendorChargeSummary.totalFuel],
                            ["IGST", vendorChargeSummary.igst],
                            ["CGST", vendorChargeSummary.cgst],
                            ["SGST", vendorChargeSummary.sgst],
                            ["Total Amount", vendorChargeSummary.totalAmount],
                          ] as const
                        ).map(([label, val]) => (
                          <FieldWrapper key={label} label={label}>
                            <Input value={val} readOnly className="bg-muted/30" />
                          </FieldWrapper>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-8">
                        <FieldWrapper label="Description" required>
                          <Select
                            value={vendorChargeDraft.description || undefined}
                            onValueChange={(v) => patchVendorChargeDraft({ description: v })}
                          >
                            <SelectTrigger
                              className={cn(!vendorChargeDraft.description && "border-destructive")}
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {VENDOR_CHARGE_DESCRIPTIONS.map((d) => (
                                <SelectItem key={d} value={d}>
                                  {d}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldWrapper>
                        <FieldWrapper label="Amount" required>
                          <Input
                            className={cn(!vendorChargeDraft.amount.trim() && "border-destructive")}
                            value={vendorChargeDraft.amount}
                            onChange={(e) => patchVendorChargeDraft({ amount: e.target.value })}
                          />
                        </FieldWrapper>
                        <FieldWrapper label="Fuel(0)">
                          <div className="flex gap-1">
                            <Select
                              value={vendorChargeDraft.fuel}
                              onValueChange={(v) => patchVendorChargeDraft({ fuel: v })}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {YES_NO.map((v) => (
                                  <SelectItem key={v} value={v}>
                                    {v}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={vendorChargeDraft.fuelAmt}
                              readOnly
                              className="bg-muted/30"
                            />
                          </div>
                        </FieldWrapper>
                        <FieldWrapper label="Tax On Fuel">
                          <div className="flex gap-1">
                            <Select
                              value={vendorChargeDraft.taxOnFuel}
                              onValueChange={(v) => patchVendorChargeDraft({ taxOnFuel: v })}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {YES_NO.map((v) => (
                                  <SelectItem key={v} value={v}>
                                    {v}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={vendorChargeDraft.taxOnFuelAmt}
                              readOnly
                              className="bg-muted/30"
                            />
                          </div>
                        </FieldWrapper>
                        <FieldWrapper label="Tax">
                          <div className="flex gap-1">
                            <Select
                              value={vendorChargeDraft.tax}
                              onValueChange={(v) => patchVendorChargeDraft({ tax: v })}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {YES_NO.map((v) => (
                                  <SelectItem key={v} value={v}>
                                    {v}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={vendorChargeDraft.taxAmt}
                              readOnly
                              className="bg-muted/30"
                            />
                          </div>
                        </FieldWrapper>
                        <FieldWrapper label="Total">
                          <Input value={vendorChargeDraft.total} readOnly className="bg-muted/30" />
                        </FieldWrapper>
                        <div className="flex items-end lg:col-span-2">
                          <Button
                            className="w-full bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                            onClick={addVendorChargeLine}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Add
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[960px] text-sm">
                          <TableHeader>
                            <TableRow className="bg-sidebar hover:bg-sidebar">
                              {[
                                "Description",
                                "Rate",
                                "Amount",
                                "Fuel Apply",
                                "Fuel Amt",
                                "TaxApply",
                                "Tax On Fuel",
                                "IGST",
                                "SGST",
                                "CGST",
                                "Total",
                                "Charges Type",
                                "Action",
                              ].map((h) => (
                                <TableHead
                                  key={h}
                                  className="whitespace-nowrap text-sidebar-foreground"
                                >
                                  {h}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {form.forwarding.vendorChargeLines.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={13}
                                  className="h-16 text-center text-muted-foreground"
                                >
                                  No vendor charges added
                                </TableCell>
                              </TableRow>
                            ) : (
                              form.forwarding.vendorChargeLines.map((l) => (
                                <TableRow key={l.id}>
                                  <TableCell>{l.description}</TableCell>
                                  <TableCell>{l.rate}</TableCell>
                                  <TableCell>{l.amount}</TableCell>
                                  <TableCell>{l.fuelApply}</TableCell>
                                  <TableCell>{l.fuelAmt}</TableCell>
                                  <TableCell>{l.taxApply}</TableCell>
                                  <TableCell>{l.taxOnFuel}</TableCell>
                                  <TableCell>{l.igst}</TableCell>
                                  <TableCell>{l.sgst}</TableCell>
                                  <TableCell>{l.cgst}</TableCell>
                                  <TableCell>{l.total}</TableCell>
                                  <TableCell>{l.chargesType}</TableCell>
                                  <TableCell>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => removeVendorChargeLine(l.id)}
                                      aria-label="Delete vendor charge"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </table>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
                <div className="mt-6">
                  <AwbFormFooter
                    showPrevious
                    onPrevious={goPrevTab}
                    readOnly={isReadOnly}
                    canBook={canBook}
                    canCancelShipment={canCancelShipment}
                    saving={saving}
                    onSave={handleSave}
                    onBook={handleBook}
                    onCancelShipment={() => editing && setCancelShipmentTarget(editing)}
                    onNext={goNextTab}
                    onCancel={requestCloseForm}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="kyc" className="mt-0">
              <div className="p-4 md:p-6">
                <div className={cn(isReadOnly && "pointer-events-none opacity-90")}>
                  <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                    <TooltipProvider delayDuration={200}>
                      <IconButton
                        label="Settings"
                        onClick={() =>
                          toast.info("KYC settings will be enabled with backend wiring")
                        }
                      >
                        <Settings className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Info"
                        onClick={() =>
                          toast.info("KYC document guidelines will be enabled with backend wiring")
                        }
                      >
                        <Info className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="List"
                        onClick={() =>
                          toast.info("KYC list view will be enabled with backend wiring")
                        }
                      >
                        <List className="h-4 w-4" />
                      </IconButton>
                    </TooltipProvider>
                    <Select
                      value={kycSearchField}
                      onValueChange={(v) => setKycSearchField(v as SearchField)}
                    >
                      <SelectTrigger className="h-9 w-[8.5rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEARCH_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={kycSearchInput}
                      onChange={(e) => setKycSearchInput(e.target.value)}
                      placeholder="Search"
                      className="h-9 w-40"
                    />
                    <Button
                      size="icon"
                      className="h-9 w-9 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                      aria-label="Search KYC"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
                    <div className="flex flex-col gap-4">
                      <FieldWrapper label="Type">
                        <Select value={kycDocType} onValueChange={setKycDocType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {KYC_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                      <input
                        ref={kycFileRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          handleKycFile(e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => kycFileRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleKycFile(e.dataTransfer.files);
                        }}
                        className="flex min-h-[180px] flex-col items-center justify-center rounded-md border-2 border-dashed border-emerald-500/60 bg-emerald-500/5 p-6 text-center text-sm font-medium uppercase tracking-wide text-emerald-600 hover:bg-emerald-500/10"
                      >
                        Drag and drop a file or select add image
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-sm">
                        <TableHeader>
                          <TableRow className="bg-sidebar hover:bg-sidebar">
                            {["Id", "File Name", "Entry Type", "Entry Date", "Action"].map((h) => (
                              <TableHead key={h} className="text-sidebar-foreground">
                                {h}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredKycDocs.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={5}
                                className="h-32 text-center text-muted-foreground"
                              >
                                No KYC documents added
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredKycDocs.map((d, i) => (
                              <TableRow key={d.id}>
                                <TableCell>{i + 1}</TableCell>
                                <TableCell>{d.fileName}</TableCell>
                                <TableCell>{d.entryType}</TableCell>
                                <TableCell>{d.entryDate}</TableCell>
                                <TableCell>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => removeKycDocument(d.id)}
                                    aria-label="Delete KYC document"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <AwbFormFooter
                    showPrevious
                    onPrevious={goPrevTab}
                    readOnly={isReadOnly}
                    canBook={canBook}
                    canCancelShipment={canCancelShipment}
                    saving={saving}
                    onSave={handleSave}
                    onBook={handleBook}
                    onCancelShipment={() => editing && setCancelShipmentTarget(editing)}
                    onCancel={requestCloseForm}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Dialog open={addUnitOpen} onOpenChange={setAddUnitOpen}>
            <DialogContent className="max-w-sm gap-0 overflow-hidden p-0 sm:max-w-sm">
              <div className="bg-sidebar px-4 py-3">
                <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                  Add Unit
                </DialogTitle>
              </div>
              <div className="flex flex-col gap-4 p-6">
                <FieldWrapper label="Unit code">
                  <Input
                    autoFocus
                    value={newUnitInput}
                    placeholder="e.g. BOX"
                    onChange={(e) => setNewUnitInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addProformaUnit();
                      }
                    }}
                  />
                </FieldWrapper>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAddUnitOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={addProformaUnit}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={formSetupOpen} onOpenChange={(o) => !o && closeFormSetup()}>
            <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl">
              <div className="bg-sidebar px-4 py-3">
                <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                  Form Setup
                </DialogTitle>
              </div>
              <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
                {AWB_FORM_SETUP_COLUMNS.map((column, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-3">
                    {column.map(({ key, label }) => (
                      <div key={key} className="flex items-start gap-2">
                        <Checkbox
                          id={`awbSetup-${key}`}
                          checked={formSetupDraft[key]}
                          onCheckedChange={(c) =>
                            setFormSetupDraft((s) => ({ ...s, [key]: c === true }))
                          }
                        />
                        <label
                          htmlFor={`awbSetup-${key}`}
                          className="text-sm leading-snug text-foreground"
                        >
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 px-6 pb-6">
                <Button
                  onClick={handleFormSetupSave}
                  className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                >
                  Save
                </Button>
                <Button variant="destructive" onClick={closeFormSetup}>
                  Cancel
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={entryOpen} onOpenChange={(o) => !o && closeEntry()}>
            <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
              <div className="bg-sidebar px-4 py-3">
                <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                  Entry
                </DialogTitle>
              </div>
              <div className="flex flex-col gap-4 p-6">
                <FieldWrapper label="Entry Type">
                  <Select value={entryType} onValueChange={setEntryType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTRY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Master AWB">
                  <Input
                    value={masterAwb}
                    onChange={(e) => setMasterAwb(e.target.value)}
                    placeholder="Master AWBNo"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEntrySearch();
                    }}
                  />
                </FieldWrapper>
              </div>
              <div className="flex justify-end gap-2 px-6 pb-6">
                <Button
                  onClick={handleEntrySearch}
                  className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                >
                  Search
                </Button>
                <Button variant="destructive" onClick={closeEntry}>
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              AWB Entry List
            </h1>
            <p className="text-sm text-muted-foreground">
              View, search, and manage air waybill bookings.
            </p>
          </div>

          <Card className="min-w-0 overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
              <TooltipProvider delayDuration={200}>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <DataIoToolbar
                    export={{
                      filename: "awb-entries",
                      title: "AWB Entries",
                      columns: [
                        { key: "awbNo", header: "AWB No" },
                        { key: "bookDate", header: "Book Date" },
                        { key: "shipperName", header: "Shipper Name" },
                        { key: "customerCode", header: "Customer Code" },
                        { key: "customerName", header: "Customer Name" },
                        { key: "consigneeName", header: "Consignee Name" },
                        { key: "destination", header: "Destination" },
                        { key: "product", header: "Product" },
                        { key: "vendor", header: "Vendor" },
                        { key: "actualWeight", header: "Actual Weight" },
                        { key: "chargeWeight", header: "Charge Weight" },
                        { key: "pieces", header: "Pieces" },
                        { key: "deliveryVendor", header: "Delivery Vendor" },
                      ],
                      getRows: () =>
                        filtered.map((r) => {
                          const d = listFromRow(r);
                          return {
                            awbNo: d.awbNo,
                            bookDate: d.bookDate,
                            shipperName: d.shipperName,
                            customerCode: d.customerCode,
                            customerName: d.customerName,
                            consigneeName: d.consigneeName,
                            destination: d.destination,
                            product: d.product,
                            vendor: d.vendor,
                            actualWeight: d.actualWeight,
                            chargeWeight: d.chargeWeight,
                            pieces: d.pieces,
                            deliveryVendor: d.deliveryVendor,
                          };
                        }),
                    }}
                  />
                  <IconButton label="Filter" onClick={() => clearColFilters()}>
                    <Filter className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Refresh" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4" />
                  </IconButton>
                </div>
              </TooltipProvider>
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
                <Select value={searchField} onValueChange={(v) => setSearchField(v as SearchField)}>
                  <SelectTrigger className="h-9 w-[10.5rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEARCH_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                  placeholder="Search"
                  className="h-9 w-full min-w-[10rem] sm:w-48"
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                  onClick={handleSearch}
                  aria-label="Search"
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={openAdd} className="h-9 shrink-0 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
              <table className="w-max min-w-full caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className={cn("text-sidebar-foreground", awbCol.awbNoHead)}>
                      AWB No
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.bookDate)}>
                      Book Date
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.shipperName)}>
                      Shipper Name
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.customerCode)}>
                      Customer Code
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.customerName)}>
                      Customer Name
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.consigneeName)}>
                      Consignee Name
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.destination)}>
                      Destination
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.product)}>
                      Product
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.vendor)}>
                      Vendor
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.actualWeight)}>
                      Actual Weight
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.chargeWeight)}>
                      Charge Weight
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.pieces)}>
                      Pieces
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.deliveryVendor)}>
                      Delivery Vendor
                    </TableHead>
                    <TableHead className={cn("text-sidebar-foreground", awbCol.action)}>
                      Action
                    </TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {(
                      [
                        ["awbNo", "AWB No", awbCol.awbNoFilter],
                        ["bookDate", "Book Date", awbCol.bookDate],
                        ["shipperName", "Shipper Name", awbCol.shipperName],
                        ["customerCode", "Customer Code", awbCol.customerCode],
                        ["customerName", "Customer Name", awbCol.customerName],
                        ["consigneeName", "Consignee Name", awbCol.consigneeName],
                        ["destination", "Destination", awbCol.destination],
                        ["product", "Product", awbCol.product],
                        ["vendor", "Vendor", awbCol.vendor],
                        ["actualWeight", "Actual Weight", awbCol.actualWeight],
                        ["chargeWeight", "Charge Weight", awbCol.chargeWeight],
                        ["pieces", "Pieces", awbCol.pieces],
                        ["deliveryVendor", "Delivery Vendor", awbCol.deliveryVendor],
                      ] as const
                    ).map(([key, placeholder, colClass]) => (
                      <TableHead key={key} className={cn("py-2", colClass)}>
                        <Input
                          value={colFilters[key]}
                          onChange={(e) => {
                            setColFilters((f) => ({ ...f, [key]: e.target.value }));
                            setPage(1);
                          }}
                          placeholder={placeholder}
                          className={awbCol.filter}
                        />
                      </TableHead>
                    ))}
                    <TableHead className={awbCol.actionFilter} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={14}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => {
                      const d = listFromRow(r);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className={awbCol.awbNo}>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(r)}
                                className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400"
                              >
                                {d.awbNo}
                              </button>
                              {r.status ? (
                                <Badge
                                  variant={
                                    r.status === "BOOKED"
                                      ? "default"
                                      : r.status === "CANCELLED"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {r.status}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className={awbCol.bookDate}>{d.bookDate}</TableCell>
                          <TableCell className={awbCol.shipperName}>{d.shipperName}</TableCell>
                          <TableCell className={awbCol.customerCode}>{d.customerCode}</TableCell>
                          <TableCell className={awbCol.customerName}>{d.customerName}</TableCell>
                          <TableCell className={awbCol.consigneeName}>{d.consigneeName}</TableCell>
                          <TableCell className={awbCol.destination}>{d.destination}</TableCell>
                          <TableCell className={awbCol.product}>{d.product}</TableCell>
                          <TableCell className={awbCol.vendor}>{d.vendor}</TableCell>
                          <TableCell className={awbCol.actualWeight}>{d.actualWeight}</TableCell>
                          <TableCell className={awbCol.chargeWeight}>{d.chargeWeight}</TableCell>
                          <TableCell className={awbCol.pieces}>{d.pieces}</TableCell>
                          <TableCell className={awbCol.deliveryVendor}>{d.deliveryVendor}</TableCell>
                          <TableCell className={awbCol.actionCell}>
                            <div className="flex justify-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(r)}
                                aria-label={`Delete AWB ${d.awbNo}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </table>
            </div>

            <TablePager
              totalPages={totalPages}
              currentPage={currentPage}
              setPage={setPage}
              startIdx={startIdx}
              endIdx={endIdx}
              total={filtered.length}
            />
          </Card>
        </>
      )}

      <VendorOtpDialog
        open={vendorOtpOpen}
        busy={vendorBookingBusy}
        error={vendorOtpError}
        shipperMobile={vendorOtpMobile}
        sandboxOtp={vendorSandboxOtp}
        onVerify={(otp) => void runVendorOtpVerify(otp)}
        onResend={() => void runVendorRetry()}
        onCancel={() => {
          if (!vendorBookingBusy) {
            setVendorOtpOpen(false);
            setVendorSandboxOtp(null);
          }
        }}
      />

      <AlertDialog open={!!restoreDraft && !showForm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>An unsaved AWB draft was found.</AlertDialogTitle>
            <AlertDialogDescription>
              Continue editing to restore every field from your last unfinished entry, or start a
              new entry and discard the draft.
              {restoreDraft?.savedAt
                ? ` Last saved ${formatDraftSavedAt(restoreDraft.savedAt)}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => void handleRestoreStartNew()}>
              Start New Entry
            </Button>
            <Button type="button" onClick={handleRestoreContinue}>
              Continue Editing
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leavePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have an unfinished AWB entry.</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how to handle your current AWB Entry before leaving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => void finishLeavePrompt("continue")}>
              Continue Editing
            </Button>
            <Button type="button" variant="secondary" onClick={() => void finishLeavePrompt("save")}>
              Save Draft & Leave
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void finishLeavePrompt("discard")}
            >
              Discard Changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{authed ? "Cancel shipment?" : "Delete AWB entry?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {authed
                ? `This will cancel AWB ${deleteTarget?.awbNo}. Cancelled shipments cannot be edited.`
                : `This will permanently remove AWB ${deleteTarget?.awbNo}. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {authed ? "Cancel Shipment" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!cancelShipmentTarget}
        onOpenChange={(o) => !o && setCancelShipmentTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel shipment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel AWB {cancelShipmentTarget?.awbNo}. Cancelled shipments cannot be
              edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelShipment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Shipment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative rounded-md border p-4 pt-6", className)}>
      <span className="absolute -top-2.5 left-3 bg-card px-2 text-sm font-medium text-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function PartySection({
  title,
  party,
  onChange,
  originLookup,
  destinationRequired,
}: {
  title: string;
  party: PartyDetails;
  onChange: (patch: Partial<PartyDetails>) => void;
  originLookup: LookupKey;
  destinationRequired?: boolean;
}) {
  const originLabel = title.includes("Consignee") ? "Destination" : "Origin";
  return (
    <FormSection title={title}>
      <div className="grid grid-cols-1 gap-3">
        <FieldWrapper label={originLabel} required={destinationRequired}>
          <LookupPairInput
            lookup={originLookup}
            value={party.origin}
            onChange={(v) => onChange({ origin: v })}
          />
        </FieldWrapper>
        <FieldWrapper label="Company Name">
          <PartyContactLookup
            role={title.includes("Shipper") ? "shipper" : "consignee"}
            value={party.companyName}
            onCompanyChange={(v) => onChange({ companyName: v })}
            onSelectContact={(c) =>
              onChange({
                companyName: { id: c.id, code: c.code, name: c.name },
                contactName: c.contactName || c.name,
                address1: c.address1,
                address2: c.address2,
                pincode: c.pincode,
                city: c.city,
                state: c.state,
                country: c.country || "India",
                telephone: c.telephone,
                mobileNo: c.mobileNo,
                email: c.email,
                documentType: c.documentType,
                documentNo: c.documentNo,
                iecNo: c.iecNo,
                origin:
                  c.origin.code || c.origin.name
                    ? { id: c.origin.id, code: c.origin.code, name: c.origin.name }
                    : party.origin,
              })
            }
          />
        </FieldWrapper>
        <FieldWrapper label="Contact Name">
          <Input
            value={party.contactName}
            onChange={(e) => onChange({ contactName: e.target.value })}
          />
        </FieldWrapper>
        <FieldWrapper label="Address 1">
          <Input value={party.address1} onChange={(e) => onChange({ address1: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Address 2">
          <Input value={party.address2} onChange={(e) => onChange({ address2: e.target.value })} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper label="Pincode">
            <Input value={party.pincode} onChange={(e) => onChange({ pincode: e.target.value })} />
          </FieldWrapper>
          <FieldWrapper label="City">
            <Input value={party.city} onChange={(e) => onChange({ city: e.target.value })} />
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper label="State">
            <Input value={party.state} onChange={(e) => onChange({ state: e.target.value })} />
          </FieldWrapper>
          <FieldWrapper label="Telephone">
            <Input
              value={party.telephone}
              onChange={(e) => onChange({ telephone: e.target.value })}
            />
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper label="Mobile No.">
            <Input
              value={party.mobileNo}
              onChange={(e) => onChange({ mobileNo: e.target.value })}
            />
          </FieldWrapper>
          <FieldWrapper label="E-Mail">
            <Input value={party.email} onChange={(e) => onChange({ email: e.target.value })} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Country">
          <Input value={party.country} onChange={(e) => onChange({ country: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="IEC No">
          <Input value={party.iecNo} onChange={(e) => onChange({ iecNo: e.target.value })} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper label="Document Type">
            <Select
              value={party.documentType || undefined}
              onValueChange={(v) => onChange({ documentType: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
          <FieldWrapper label="Document No.">
            <Input
              value={party.documentNo}
              onChange={(e) => onChange({ documentNo: e.target.value })}
            />
          </FieldWrapper>
        </div>
      </div>
    </FormSection>
  );
}

function ServicesSection({
  form,
  setForm,
  airlineRequired,
}: {
  form: AwbFullForm;
  setForm: React.Dispatch<React.SetStateAction<AwbFullForm>>;
  airlineRequired?: boolean;
}) {
  const hasVendor = Boolean(
    form.vendor.id || form.vendor.code.trim() || form.vendor.name.trim(),
  );
  return (
    <FormSection title="Services Details">
      <div className="grid grid-cols-1 gap-3">
        <FieldWrapper label="Product" required>
          <LookupPairInput
            lookup="product"
            value={form.product}
            onChange={(v) => setForm((f) => ({ ...f, product: v }))}
          />
        </FieldWrapper>
        <FieldWrapper label="Vendor">
          <LookupPairInput
            lookup="vendor"
            value={form.vendor}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                vendor: v,
                // Changing vendor invalidates the previous service mapping.
                service: emptyPair(),
              }))
            }
          />
        </FieldWrapper>
        <FieldWrapper label="Airline" required={airlineRequired}>
          <Input
            value={form.airline}
            onChange={(e) => setForm((f) => ({ ...f, airline: e.target.value }))}
          />
        </FieldWrapper>
        <FieldWrapper label="Service" required={hasVendor}>
          <VendorServiceLookup
            vendor={form.vendor}
            value={form.service}
            onChange={(v) => setForm((f) => ({ ...f, service: v }))}
            productId={form.product.id}
            destinationId={form.consignee.origin.id}
          />
          {hasVendor ? null : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Select a Vendor to load mapped services.
            </p>
          )}
        </FieldWrapper>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <FieldWrapper label="Shipment Value">
            <Input
              value={form.shipmentValue}
              onChange={(e) => setForm((f) => ({ ...f, shipmentValue: e.target.value }))}
            />
          </FieldWrapper>
          <FieldWrapper label=" ">
            <Select
              value={form.shipmentCurrency}
              onValueChange={(v) => setForm((f) => ({ ...f, shipmentCurrency: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <FieldWrapper label="Pieces">
            <Input
              value={form.pieces}
              onChange={(e) => setForm((f) => ({ ...f, pieces: e.target.value }))}
            />
          </FieldWrapper>
          <FieldWrapper label=" ">
            <Select
              value={form.piecesUnit}
              onValueChange={(v) => setForm((f) => ({ ...f, piecesUnit: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIECE_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <FieldWrapper label="Actual Weight">
            <Input
              value={form.actualWeight}
              onChange={(e) => setForm((f) => ({ ...f, actualWeight: e.target.value }))}
            />
          </FieldWrapper>
          <FieldWrapper label=" ">
            <Select
              value={form.weightUnit}
              onValueChange={(v) => setForm((f) => ({ ...f, weightUnit: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEIGHT_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>
        <FieldWrapper label="Volumetric Weight">
          <Input
            value={form.volWeight}
            onChange={(e) => setForm((f) => ({ ...f, volWeight: e.target.value }))}
          />
        </FieldWrapper>
        <FieldWrapper label="Charge Weight">
          <Input
            value={form.chargeWeight}
            onChange={(e) => setForm((f) => ({ ...f, chargeWeight: e.target.value }))}
          />
        </FieldWrapper>
        <div className="flex flex-wrap gap-4 pt-1">
          {(
            [
              ["commercial", "Commercial"],
              ["oda", "ODA"],
              ["medicalCharges", "Medical Charges"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                id={key}
                checked={form[key]}
                onCheckedChange={(c) => setForm((f) => ({ ...f, [key]: c === true }))}
              />
              <label htmlFor={key} className="text-sm text-muted-foreground">
                {label}
              </label>
            </div>
          ))}
        </div>
      </div>
    </FormSection>
  );
}

function AwbFormFooter({
  showPrevious = true,
  onPrevious,
  onSave,
  onBook,
  onCancelShipment,
  onNext,
  onCancel,
  readOnly = false,
  canBook = false,
  canCancelShipment = false,
  saving = false,
}: {
  showPrevious?: boolean;
  onPrevious?: () => void;
  onSave: () => void;
  onBook?: () => void;
  onCancelShipment?: () => void;
  onNext?: () => void;
  onCancel: () => void;
  readOnly?: boolean;
  canBook?: boolean;
  canCancelShipment?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {showPrevious && onPrevious ? (
          <Button variant="secondary" onClick={onPrevious} disabled={saving}>
            Previous
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {!readOnly ? (
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-emerald-600 text-white hover:bg-emerald-600/90"
          >
            Save
          </Button>
        ) : null}
        {canBook && onBook && !readOnly ? (
          <Button
            onClick={onBook}
            disabled={saving}
            className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          >
            Book
          </Button>
        ) : null}
        {canCancelShipment && onCancelShipment ? (
          <Button variant="destructive" onClick={onCancelShipment} disabled={saving}>
            Cancel Shipment
          </Button>
        ) : null}
        {onNext ? (
          <Button
            className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            onClick={onNext}
            disabled={saving}
          >
            Next
          </Button>
        ) : null}
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Close
        </Button>
      </div>
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <FieldWrapper label={label}>
      <div className="flex h-9 overflow-hidden rounded-md border">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 flex-1 rounded-none",
            value
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "text-muted-foreground hover:bg-muted/60",
          )}
          onClick={() => onChange(true)}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 flex-1 rounded-none border-l",
            !value
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "text-muted-foreground hover:bg-muted/60",
          )}
          onClick={() => onChange(false)}
        >
          No
        </Button>
      </div>
    </FieldWrapper>
  );
}

function LookupPairInput({
  value,
  onChange,
  lookup,
  disabled,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
  disabled?: boolean;
}) {
  return (
    <SearchableLookupPair value={value} onChange={onChange} lookup={lookup} disabled={disabled} />
  );
}
