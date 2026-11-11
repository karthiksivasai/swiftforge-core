import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Filter,
  RefreshCw,
  Pencil,
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
  FileSpreadsheet,
  Loader2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import {
  AWB_LOOKUP_NO_RESULTS,
  type LookupDisplayVariant,
} from "@/components/masters/lookup-autocomplete-ui";
import { ClientNameField } from "@/components/transactions/client-name-field";
import { PartyContactLookup } from "@/components/transactions/party-contact-lookup";
import { VendorServiceLookup } from "@/components/transactions/vendor-service-lookup";
import { PincodeAutocomplete } from "@/components/pincode-autocomplete";
import { ErpFormNavProvider, ErpNavCycleSelect, ErpNavDateInput, ErpNavInput, ErpNavSelect, useErpNavCommit, useErpSelectNav } from "@/components/forms/erp-form-nav-context";
import { AWB_NAV } from "@/lib/forms/awb-entry-nav-order";
import {
  AWB_REQUIRED_NAV_ORDERS,
  getVendorChargePrerequisiteErrors,
  isAwbLookupSelected,
  validateAwbNavField,
} from "@/lib/forms/awb-entry-required-fields";
import {
  erpNavOrder,
  erpNavSkip,
  ERP_MANUAL_SEARCH,
  focusErpFieldByOrder,
  focusPrevBeforeOrder,
  getErpNavOrderFromElement,
  scheduleErpFocusAdvance,
} from "@/lib/forms/erp-keyboard-nav";
import type { LookupKey } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomerChildren } from "@/lib/masters/resources/customers";
import { sendEmail, sendSms } from "@/lib/notifications/delivery";
import {
  awbGstPercent,
  awbIntraState,
  awbErrorField,
  awbTextErrors,
  clipText,
  balanceDue,
  consigneeBookingErrors,
  fillEmptyPartyFields,
  formatChargeWeight,
  formatMoney2,
  futureBookDateError,
  fuelPercentFor,
  istBookDate,
  hsnIsValid,
  lockedByCaption,
  manualChargeAmounts,
  rateRefreshDecision,
  resolveDivision,
  sumPieceCount,
  type FuelSurchargeRow,
  type VolumetricFactor,
} from "@/lib/transactions/awbEntryRules";
import { downloadAwbMtsTemplate, mtsFileAccepted, mtsPiecesFromRows } from "@/lib/transactions/awbMtsImport";
import {
  proformaErrorReportCsv,
  recalculateProformaAmounts,
  validateProformaEntry,
  type ProformaImportError,
} from "@/lib/transactions/proformaImport";
import { parseTabularFile } from "@/lib/io/tableIo";
import { toErrorMessage } from "@/lib/masters/screen";
import { rememberPartiesAfterAwbSave } from "@/lib/transactions/resources/partyContacts";
import {
  clientProfileToAwbHydrate,
  loadClientProfile,
  type ClientProfile,
} from "@/lib/transactions/resources/clientProfile";
import { destinationCountryName } from "@/lib/masters/resources/destinations";
import { listVendorServices } from "@/lib/transactions/resources/vendorServices";
import {
  AWB_DRAFT_AUTOSAVE_MS,
  AWB_DRAFT_VERSION,
  clearAwbDraft,
  clearFreshAwbEntryRequest,
  clearOpenAwbForm,
  draftUserKey,
  formatDraftSavedAt,
  isAwbDraftWorthKeeping,
  isFreshAwbEntryRequested,
  loadAwbDraft,
  persistAwbDraft,
  readLocalAwbDraft,
  readOpenAwbForm,
  writeOpenAwbForm,
  type AwbEntryDraftPayload,
} from "@/lib/transactions/awbDraftStorage";
import {
  bookAwbShipment,
  cancelShipment,
  fetchShipmentChildren,
  findShipmentBySearch,
  getShipmentById,
  listShipments,
  unlockShipment,
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
  documentObjectUrl,
  getShipmentDocument,
  revokeDocumentObjectUrl,
  saveShipmentDocument,
  type ShipmentDocumentItem,
} from "@/lib/transactions/shipmentDocuments";
import {
  calculateShipmentRating,
  getRatingBreakdown,
  recalculateShipmentRating,
} from "@/lib/transactions/resources/rating";
import { useActiveBranch } from "@/lib/branch-context";
import { lookupAwbLabels } from "@/lib/transactions/resources/awbQuery";
import { getAwbEntryStatus } from "@/lib/transactions/resources/awbStatus";
import {
  getBranchAwbStockSummary,
  validateManualAwb,
} from "@/lib/transactions/resources/awbStock";
import {
  validateDocumentId,
  validatePartyIdNumbers,
} from "@/lib/transactions/idValidators";
import {
  validateAwbEntry,
  validateDocumentNoFormat,
} from "@/lib/validation/awbValidations";
import {
  apiRatingToChargeLines,
  apiRatingToSummary,
  ratingSnapshotToChargeLines,
  ratingToSummary,
  type RatingSummary,
} from "@/lib/transactions/ratingUiMap";
import type { RatingCalculationResult } from "@/lib/rating/ratingEngine";
import type { VendorQuote } from "@/lib/rating/vendorTariff";
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
import {
  buildWfBookingPayload,
  buildUpsBookingPayload,
  callWorldFirstBookingApi,
  getWfClientConfig,
  getUpsClientConfig,
  validateWfBookingRequest,
} from "@/lib/integrations/world-first-api";

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
  division?: string;
  measurementUnit?: string;
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
  source?: "Manual" | "Import";
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
  adCode: string;
  bondUt: string;
  payOfIgst: string;
  lutNo: string;
  lutExpiry: string;
  ecommerce: string;
  meis: string;
  invoiceType: string;
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
  contentB64?: string;
  mimeType?: string;
  uploaded?: boolean;
};

type KycData = {
  documents: KycDocument[];
};

export type AwbFullForm = {
  awbNo: string;
  /** Source AWB this entry was duplicated from (blank for normal creates). */
  masterAwbNo: string;
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
  expectedDeliveryDate: string;
  notifyEmail: boolean;
  notifySms: boolean;
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
  lockedByName?: string | null;
  lockedAt?: string | null;
  serverLocked?: boolean;
};

async function lockDisplayFor(row: {
  is_locked?: boolean | null;
  locked_by?: string | null;
  locked_at?: string | null;
}): Promise<{ lockedByName: string | null; lockedAt: string | null }> {
  if (!row.is_locked || !row.locked_at) return { lockedByName: null, lockedAt: null };
  let lockedByName: string | null = null;
  if (row.locked_by) {
    try {
      const labels = await lookupAwbLabels({
        userIds: [row.locked_by],
        branchIds: [],
        fileIds: [],
      });
      lockedByName = labels.users[row.locked_by] ?? null;
    } catch {
      lockedByName = null;
    }
  }
  return { lockedByName, lockedAt: row.locked_at };
}

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
  igst?: string;
  cgst?: string;
  sgst?: string;
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

const CSB5_EXPORT_REASONS = [
  "SALE",
  "COMMERCIAL SAMPLES",
  "REPAIR & RETURN",
  "EXHIBITION",
  "DEFECTIVE RETURN",
] as const;

const CSB4_EXPORT_REASONS = [
  "UNSOLICITED GIFT - NOT FOR SALE",
  "Bonafide Gift",
  "PERSONAL",
  "Personal not for resale",
  "Samples not for sale",
  "BUYER (IF OTHER THAN CONSIGNEE)",
  "FREE SAMPLE OF NO COMMERICAL VALUE",
  "FREE TRADE SAMPLE",
] as const;

const EXPORT_REASONS = [
  ...CSB5_EXPORT_REASONS,
  ...CSB4_EXPORT_REASONS,
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

const AWB_TABS = ["awb", "proforma", "forwarding", "kyc", "notification"] as const;
const FORM_SETUP_STORAGE_KEY = "cms.awb-form-setup.v1";

type AwbChargeHead = {
  code: string;
  name: string;
  charge_rate: number;
  apply_fuel: boolean;
  apply_tax_on_fuel: boolean;
  apply_tax: boolean;
};
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

const AWB_LOOKUP_FIELDS = [
  { value: "awb_no", label: "AWB No", missing: "No AWB found" },
  { value: "forwarding_awb", label: "Forwarding No", missing: "No shipment found for this forwarding number" },
  { value: "delivery_awb", label: "Delivery No", missing: "No shipment found for this delivery number" },
  { value: "reference_no", label: "Reference No", missing: "No shipment found for this reference number" },
] as const;

type AwbLookupField = (typeof AWB_LOOKUP_FIELDS)[number]["value"];

const emptyPair = (): LookupPair => ({ code: "", name: "" });

function lookupPairEqual(a: LookupPair, b: LookupPair): boolean {
  return a.id === b.id && a.code === b.code && a.name === b.name;
}

function copyLookupPair(pair: LookupPair): LookupPair {
  return { ...pair };
}

function isWorldFirstVendor(vendor: LookupPair): boolean {
  const code = (vendor.code || "").trim().toUpperCase();
  const name = (vendor.name || "").trim().toUpperCase();
  const wfConfig = getWfClientConfig();
  const wfCode = wfConfig.vendorCode.toUpperCase();

  return (
    code === wfCode ||
    code === "WFT" ||
    code === "WORLD_FIRST" ||
    name.includes("WORLD FREIGHT") ||
    name.includes("WORLD-FIRST") ||
    name.includes("WORLD FIRST")
  );
}

function isUpsVendor(vendor: LookupPair): boolean {
  const code = (vendor.code || "").trim().toUpperCase();
  const name = (vendor.name || "").trim().toUpperCase();
  return (
    code === "UPS" ||
    code === "UPS2" ||
    code === "UPS3" ||
    name.includes("UNITED PARCEL SERVICE") ||
    name.includes("UPS")
  );
}

/** Mirror Shipment Details product/vendor/service into Forwarding delivery fields. */
function syncForwardingDeliveryFromShipment(
  forwarding: ForwardingData,
  product: LookupPair,
  vendor: LookupPair,
  service: LookupPair,
): Partial<ForwardingData> | null {
  const patch: Partial<ForwardingData> = {};
  if (!lookupPairEqual(forwarding.deliveryProduct, product)) {
    patch.deliveryProduct = copyLookupPair(product);
  }
  if (!lookupPairEqual(forwarding.deliveryVendor, vendor)) {
    patch.deliveryVendor = copyLookupPair(vendor);
  }
  if (!lookupPairEqual(forwarding.deliveryService, service)) {
    patch.deliveryService = copyLookupPair(service);
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

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

const todayIso = () => istBookDate();

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
  actualWeightPerPc: "0",
  noOfPieces: "1",
  length: "0",
  width: "0",
  height: "0",
  division: "5000",
  volWeight: "0.000",
  chargeWeight: "0.000",
});

const emptyChargeDraft = (): ChargeDraft => ({
  description: "",
  itemAmount: "",
  itemFuel: "No",
  taxOnFuel: "Yes",
  tax: "No",
  itemTotal: "0",
});

const emptyProforma = (): ProformaData => ({
  csbType: "",
  termOfInvoice: "",
  gstInvoice: false,
  invoiceNo: "",
  invoiceDate: "",
  departmentNo: "",
  exportReason: "",
  format: "",
  currency: "INR",
  adCode: "",
  bondUt: "No",
  payOfIgst: "No",
  lutNo: "",
  lutExpiry: "",
  ecommerce: "No",
  meis: "No",
  invoiceType: "",
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
  igst: "0.00",
  cgst: "0.00",
  sgst: "0.00",
});

export const emptyForm = (): AwbFullForm => ({
  awbNo: "",
  masterAwbNo: "",
  bookDate: todayIso(),
  bookTime: nowBookTime(),
  referenceNo: "",
  clientName: emptyPair(),
  awbUserId: "",
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
  expectedDeliveryDate: "",
  notifyEmail: false,
  notifySms: false,
  forwardingNo: "",
  deliveryNo: "",
  proforma: emptyProforma(),
  forwarding: emptyForwarding(),
  kyc: emptyKyc(),
});

const cloneLookupPair = (pair: LookupPair): LookupPair => ({
  id: pair.id,
  code: pair.code,
  name: pair.name,
});

const clonePartyDetails = (party: PartyDetails): PartyDetails => ({
  ...party,
  origin: cloneLookupPair(party.origin),
  companyName: cloneLookupPair(party.companyName),
});

/**
 * Duplicate Entry mapping — copies shipment detail across all tabs, regenerates
 * identity / post-booking fields, and recomputes charge totals.
 */
const cloneAwbFormFromSource = (
  source: AwbFullForm,
  sourceAwbNo: string,
  opts?: { awbNoPlus1?: boolean },
): AwbFullForm => {
  const blank = emptyForm();
  let newAwbNo = "";
  if (opts?.awbNoPlus1) {
    const num = Number.parseInt(sourceAwbNo, 10);
    if (!Number.isNaN(num)) newAwbNo = String(num + 1);
  }

  const piecesLines = (source.piecesLines ?? []).map((line, i) => ({
    ...line,
    id: crypto.randomUUID(),
    childAwb: newAwbNo ? `${newAwbNo}-${i + 1}` : "",
  }));

  const chargeLines = (source.chargeLines ?? []).map((line) => ({
    ...line,
    id: crypto.randomUUID(),
  }));
  const customerChargesTotal = chargeLines
    .reduce((s, l) => s + (Number.parseFloat(l.total) || Number.parseFloat(l.amount) || 0), 0)
    .toFixed(2);

  const srcFwd = source.forwarding ?? emptyForwarding();
  const vendorChargeLines = (srcFwd.vendorChargeLines ?? []).map((line) => ({
    ...line,
    id: crypto.randomUUID(),
  }));
  const vendorChargesTotal = vendorChargeLines
    .reduce((s, l) => s + (Number.parseFloat(l.total) || Number.parseFloat(l.amount) || 0), 0)
    .toFixed(2);

  const srcProforma = source.proforma ?? emptyProforma();
  const proformaLines = (srcProforma.lines ?? []).map((line) => ({
    ...line,
    id: crypto.randomUUID(),
  }));

  return {
    ...blank,
    awbNo: newAwbNo,
    masterAwbNo: sourceAwbNo,
    bookDate: source.bookDate || blank.bookDate,
    bookTime: source.bookTime || blank.bookTime,
    referenceNo: source.referenceNo ?? "",
    clientName: cloneLookupPair(source.clientName),
    awbUserId: source.awbUserId || blank.awbUserId,
    podUserId: source.podUserId ?? "",
    // Regenerated / blank operational identifiers
    manifestNo: blank.manifestNo,
    manifestDate: "",
    invoiceNo: "",
    debitNoteNo: blank.debitNoteNo,
    creditNoteNo: blank.creditNoteNo,
    flightNo: "",
    shipper: clonePartyDetails(source.shipper),
    consignee: clonePartyDetails(source.consignee),
    product: cloneLookupPair(source.product),
    vendor: cloneLookupPair(source.vendor),
    airline: source.airline ?? "",
    service: cloneLookupPair(source.service),
    shipmentValue: source.shipmentValue ?? "",
    shipmentCurrency: source.shipmentCurrency || blank.shipmentCurrency,
    pieces: source.pieces || blank.pieces,
    piecesUnit: source.piecesUnit || blank.piecesUnit,
    actualWeight: source.actualWeight || blank.actualWeight,
    weightUnit: source.weightUnit || blank.weightUnit,
    volWeight: source.volWeight || blank.volWeight,
    chargeWeight: source.chargeWeight || blank.chargeWeight,
    commercial: source.commercial === true,
    oda: source.oda === true,
    medicalCharges: source.medicalCharges === true,
    piecesLines,
    chargeLines,
    customerChargesTotal,
    vendorChargesTotal,
    paymentType: source.paymentType ?? "",
    content: source.content ?? "",
    instruction: source.instruction ?? "",
    fieldExecutive: cloneLookupPair(source.fieldExecutive),
    cashReceiptNo: "",
    amountReceived: "",
    balanceAmount: "",
    cashReceiptDate: "",
    lock: false,
    expectedDeliveryDate: source.expectedDeliveryDate ?? "",
    notifyEmail: source.notifyEmail === true,
    notifySms: source.notifySms === true,
    forwardingNo: "",
    deliveryNo: "",
    pickupId: undefined,
    proforma: {
      ...emptyProforma(),
      ...srcProforma,
      invoiceNo: "",
      invoiceDate: "",
      lines: proformaLines,
    },
    forwarding: {
      ...emptyForwarding(),
      deliveryProduct: cloneLookupPair(srcFwd.deliveryProduct ?? emptyPair()),
      deliveryVendor: cloneLookupPair(srcFwd.deliveryVendor ?? emptyPair()),
      deliveryService: cloneLookupPair(srcFwd.deliveryService ?? emptyPair()),
      vendorWeight: srcFwd.vendorWeight || "0",
      vendorAmount: srcFwd.vendorAmount || "0.00",
      vendorInvoice: "",
      deliveryAwb: "",
      forwardingAwb: "",
      vendorChargeLines,
    },
    // Keep shipper/consignee document type+no (on party); do not copy uploads / verification.
    kyc: emptyKyc(),
  };
};

/** Digits only. Used for piece counts. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Digits and one decimal point. Letters and other symbols are dropped. */
function decimalNumber(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, "")}`;
}

const calcVolWeight = (draft: PiecesDraft) => {
  const l = Number.parseFloat(draft.length) || 0;
  const w = Number.parseFloat(draft.width) || 0;
  const h = Number.parseFloat(draft.height) || 0;
  const pcs = Number.parseFloat(draft.noOfPieces) || 0;
  const isInch = (draft.measurementUnit || "").toUpperCase().startsWith("INCH");
  const div = Number.parseFloat(draft.division);
  if (!l || !w || !h || !pcs) return "0.000";
  if (isInch && (!div || div === 5000)) return "0.000";
  const divisor = div > 0 ? div : 5000;
  return ((l * w * h * pcs) / divisor).toFixed(3);
};

const calcChargeWeight = (draft: PiecesDraft) => {
  const vol = Number.parseFloat(calcVolWeight(draft)) || 0;
  const act =
    (Number.parseFloat(draft.actualWeightPerPc) || 0) * (Number.parseFloat(draft.noOfPieces) || 0);
  return formatChargeWeight(Math.max(vol, act), false);
};

function payableFromLines(form: AwbFullForm): string {
  if (form.chargeLines.length === 0) return form.customerChargesTotal || "0.00";
  const sum = form.chargeLines.reduce((sum, line) => sum + (Number.parseFloat(line.total) || 0), 0);
  return sum.toFixed(2);
}

const AWB_ERROR_NAV: Record<string, number> = {
  manualAwb: AWB_NAV.AWB_NO,
  reference: AWB_NAV.REFERENCE,
  client: AWB_NAV.CLIENT,
  origin: AWB_NAV.SHIPPER_ORIGIN,
  shipperCompany: AWB_NAV.SHIPPER_COMPANY,
  shipperAddress1: AWB_NAV.SHIPPER_ADDRESS1,
  shipperPincode: AWB_NAV.SHIPPER_PINCODE,
  shipperCity: AWB_NAV.SHIPPER_CITY,
  shipperState: AWB_NAV.SHIPPER_STATE,
  shipperMobile: AWB_NAV.SHIPPER_MOBILE,
  shipperEmail: AWB_NAV.SHIPPER_EMAIL,
  shipperIec: AWB_NAV.SHIPPER_IEC,
  destination: AWB_NAV.CONSIGNEE_DESTINATION,
  consigneeCompany: AWB_NAV.CONSIGNEE_COMPANY,
  consigneeAddress1: AWB_NAV.CONSIGNEE_ADDRESS1,
  consigneePostcode: AWB_NAV.CONSIGNEE_PINCODE,
  consigneeCity: AWB_NAV.CONSIGNEE_CITY,
  consigneeMobile: AWB_NAV.CONSIGNEE_MOBILE,
  consigneeEmail: AWB_NAV.CONSIGNEE_EMAIL,
  consigneeIec: AWB_NAV.CONSIGNEE_IEC,
  product: AWB_NAV.PRODUCT,
  vendor: AWB_NAV.VENDOR,
  service: AWB_NAV.SERVICE,
  cashReceiptNo: AWB_NAV.CASH_RECEIPT_NO,
  amountReceived: AWB_NAV.AMOUNT_RECEIVED,
  cashReceiptDate: AWB_NAV.CASH_RECEIPT_DATE,
  expectedDelivery: AWB_NAV.EXPECTED_DELIVERY,
  adCode: AWB_NAV.PROFORMA_AD_CODE,
  bondUt: AWB_NAV.PROFORMA_BOND_UT,
  payOfIgst: AWB_NAV.PROFORMA_PAY_IGST,
  lutNo: AWB_NAV.PROFORMA_LUT_NO,
  lutExpiry: AWB_NAV.PROFORMA_LUT_EXPIRY,
  csbType: AWB_NAV.PROFORMA_CSB_TYPE,
  exportReason: AWB_NAV.PROFORMA_EXPORT_REASON,
  proformaLines: AWB_NAV.PROFORMA_BOX_NO,
};

const DEFAULT_CUSTOMS_EXCHANGE_RATES: Record<string, number> = {
  INR: 1.0,
  USD: 86.50,
  EUR: 93.20,
  GBP: 110.00,
  AED: 23.55,
  CAD: 63.50,
  AUD: 56.20,
  SGD: 64.80,
};

function getCustomsExchangeRate(currency: string): number {
  const c = (currency || "INR").trim().toUpperCase();
  return DEFAULT_CUSTOMS_EXCHANGE_RATES[c] ?? 1.0;
}

export function collectAwbProductionErrors(form: AwbFullForm, clientProfile?: ClientProfile | null): string[] {
  const errors: string[] = [];
  if (!isAwbLookupSelected(form.vendor)) errors.push("Vendor is required");
  if (!form.shipper.address1.trim()) errors.push("Shipper Address 1 is required");
  if (!form.shipper.pincode.trim()) errors.push("Shipper Pincode is required");
  if (!form.shipper.city.trim()) errors.push("Shipper City is required");
  if (!form.shipper.state.trim()) errors.push("Shipper State is required");

  // Proforma Customs & GST checks
  const bondUt = (form.proforma.bondUt || "No").trim().toUpperCase();
  const payOfIgst = (form.proforma.payOfIgst || "No").trim().toUpperCase();
  if (bondUt === "YES" && payOfIgst === "YES") {
    errors.push("LUT (Bond/UT) and Payment of IGST are mutually exclusive under Section 16 of the IGST Act. Choose either LUT or Payment of IGST, not both.");
  }

  const csbTypeUpper = (form.proforma.csbType || "").trim().toUpperCase();
  const exportReasonUpper = (form.proforma.exportReason || "").trim().toUpperCase();
  const isCommercialExport = form.commercial || csbTypeUpper === "CSB 5" || csbTypeUpper === "COMMERCIAL" || csbTypeUpper === "CBE XIII";
  const isDox = form.product.code.trim().toUpperCase() === "DOX" && !isCommercialExport;

  // For non-commercial DOX shipments, CSB Type and Export Reason are not required (exempt)
  if (!isDox) {
    if (!csbTypeUpper) {
      errors.push("CSB Type is required. Select CSB 4, CSB 5, etc. on the Proforma tab.");
    }
    if (!exportReasonUpper) {
      errors.push("Export reason is required. Select an export reason on the Proforma tab.");
    }
  }

  if (isCommercialExport) {
    if (!form.proforma.adCode.trim()) {
      errors.push("Ad Code is required when CSB Type is CSB 5");
    }
    if (exportReasonUpper.includes("GIFT")) {
      errors.push("Non-commercial gift exports cannot be filed under commercial exports / CSB-V. Select a commercial export reason.");
    }
    if (csbTypeUpper === "CSB 4" || csbTypeUpper === "CSB 3" || csbTypeUpper === "ECM SPX") {
      errors.push("Commercial shipments must be filed under CSB-V or COMMERCIAL, not CSB-IV/III.");
    }
    const allowedCsb5 = ["SALE", "COMMERCIAL SAMPLES", "REPAIR & RETURN", "EXHIBITION", "DEFECTIVE RETURN"];
    if (exportReasonUpper && !allowedCsb5.includes(exportReasonUpper)) {
      errors.push(`Export reason "${form.proforma.exportReason}" is not permitted for commercial CSB-V. Allowed reasons: SALE, COMMERCIAL SAMPLES, REPAIR & RETURN, EXHIBITION, DEFECTIVE RETURN.`);
    }
    const shipperIec = (form.shipper.iecNo.trim() || ((form.shipper.documentType === "IEC" || form.shipper.documentType.includes("IEC")) ? form.shipper.documentNo.trim() : "")).toUpperCase();
    if (!shipperIec) {
      errors.push("Valid 10-character alphanumeric IEC is required on Shipper for CSB-V / Commercial export.");
    } else if (!/^[A-Z0-9]{10}$/.test(shipperIec)) {
      errors.push(`Invalid IEC "${shipperIec}". IEC must be exactly 10 alphanumeric characters.`);
    }
  } else {
    if (exportReasonUpper === "SALE") {
      errors.push('Commercial export reason "SALE" must be filed under CSB-V or COMMERCIAL, not CSB-IV/III.');
    }
  }

  // LUT number check when Bond/UT is Yes
  // Must come only from Proforma input, Shipper master, or Customer master (Branch fallback removed)
  if (bondUt === "YES") {
    const lutInput = (form.proforma.lutNo || "").trim();
    const customerLut = (clientProfile?.lutNumber || "").trim();
    const customerLutExpiry = (clientProfile?.lutExpiryDate || "").trim();
    const activeLut = lutInput || customerLut;
    const lutExpiryInput = (form.proforma.lutExpiry || "").trim();
    const activeExpiry = lutInput && lutInput !== customerLut ? lutExpiryInput : (lutExpiryInput || customerLutExpiry);
    const bookDate = form.bookDate.trim() || new Date().toISOString().slice(0, 10);

    if (!activeLut) {
      errors.push("Bond / UT is selected as Yes, but no valid LUT (Bond/UT) number is on file for the Shipper or Customer. Enter an LUT number on the Proforma tab or configure it in Client Master.");
    } else {
      if (lutInput && !activeExpiry) {
        errors.push("LUT Expiry Date is required when LUT Number is entered on the Proforma tab.");
      } else if (activeExpiry && activeExpiry < bookDate) {
        errors.push(`Bond / UT is selected as Yes, but the LUT on file (${activeLut}) expired on ${activeExpiry}. An active, unexpired LUT is required.`);
      }
    }
  }

  // Inch volumetric divisor check
  for (let i = 0; i < form.piecesLines.length; i++) {
    const line = form.piecesLines[i];
    const isInch = (line.measurementUnit || "").toUpperCase().startsWith("INCH");
    const hasDims = Number(line.length) > 0 || Number(line.breadth) > 0 || Number(line.height) > 0;
    if (isInch && hasDims) {
      const div = Number(line.division);
      if (!div || div === 5000) {
        errors.push(`Box ${i + 1}: No inch volumetric divisor (e.g. 305 or 166) is configured for this customer or vendor. Configure an inch divisor or enter dimensions in cm.`);
      }
    }
  }

  // International shipment Proforma line requirement:
  // DOX (document) shipments do NOT need proforma lines.
  // Non-DOX and Commercial shipments need at least one proforma line.
  const consigneeCountry = (form.consignee.country || "").trim().toUpperCase();
  const isDomestic = consigneeCountry === "INDIA" || consigneeCountry === "IN";
  if (!isDomestic && !isDox && form.proforma.lines.length === 0) {
    errors.push("At least one Proforma line item is required for non-document and commercial shipments. Add items on the Proforma tab before booking.");
  }

  // CSB-IV Statutory Value Limit check
  if (!isCommercialExport && (csbTypeUpper === "CSB 4" || csbTypeUpper === "CSB 3" || csbTypeUpper === "ECM SPX")) {
    const totalProforma = form.proforma.lines.reduce((s, l) => s + (Number.parseFloat(l.amount) || 0), 0);
    const currency = (form.proforma.currency || "INR").trim().toUpperCase();
    const rate = getCustomsExchangeRate(currency);
    const totalInr = totalProforma * rate;
    const csbIvLimit = 100000;
    if (totalInr > csbIvLimit) {
      errors.push(`Proforma value (${totalProforma.toFixed(2)} ${currency} = ₹${totalInr.toFixed(2)} INR) exceeds the statutory CSB-IV limit of ₹1,00,000.00 INR. Commercial CSB-V export is mandatory for shipments exceeding this limit.`);
    }
  }
  const bookDateError = futureBookDateError(form.bookDate);
  if (bookDateError) errors.push(bookDateError);
  errors.push(
    ...awbTextErrors({
      referenceNo: form.referenceNo,
      paymentType: form.paymentType,
      cashReceiptNo: form.cashReceiptNo,
      amountReceived: form.amountReceived,
      cashReceiptDate: form.cashReceiptDate,
      bookDate: form.bookDate,
      expectedDeliveryDate: form.expectedDeliveryDate,
      totalAmount: payableFromLines(form),
      shipper: {
        companyName: form.shipper.companyName.name,
        contactName: form.shipper.contactName,
        address1: form.shipper.address1,
        address2: form.shipper.address2,
        city: form.shipper.city,
        state: form.shipper.state,
        telephone: form.shipper.telephone,
        mobile: form.shipper.mobileNo,
        email: form.shipper.email,
        country: form.shipper.country,
        iecNo: form.shipper.iecNo,
      },
      consignee: {
        companyName: form.consignee.companyName.name,
        contactName: form.consignee.contactName,
        address1: form.consignee.address1,
        address2: form.consignee.address2,
        city: form.consignee.city,
        state: form.consignee.state,
        telephone: form.consignee.telephone,
        mobile: form.consignee.mobileNo,
        email: form.consignee.email,
        country: form.consignee.country,
        iecNo: form.consignee.iecNo,
      },
    }),
  );
  return errors;
}

async function notifySavedAwb(form: AwbFullForm) {
  if (!form.notifyEmail && !form.notifySms) return;
  const awb = form.awbNo.trim() || "shipment";
  const body = `Shipment ${awb} was saved.`;
  const warnings: string[] = [];
  try {
    if (form.notifyEmail) {
      const emails = [form.shipper.email, form.consignee.email]
        .map((value) => value.trim())
        .filter((value) => value.includes("@"));
      if (emails.length === 0) warnings.push("No email address on the shipper or consignee.");
      for (const to of emails) {
        const result = await sendEmail({
          to,
          subject: `AWB ${awb} saved`,
          html_body: `<p>${body}</p>`,
          text_body: body,
          skip_preference_check: true,
        });
        if (result.ok === false) warnings.push(String(result.message || "Email was not sent."));
      }
    }
    if (form.notifySms) {
      const phones = [form.shipper.mobileNo, form.consignee.mobileNo]
        .map((value) => value.trim())
        .filter(Boolean);
      if (phones.length === 0) warnings.push("No mobile number on the shipper or consignee.");
      for (const to of phones) {
        const result = await sendSms({
          to,
          purpose: "SHIPMENT_BOOKED",
          body,
          variables: { awb },
          skip_preference_check: true,
        });
        if (result.ok === false) warnings.push(String(result.message || "SMS was not sent."));
      }
    }
  } catch (error) {
    warnings.push(toErrorMessage(error, "Notification could not be sent."));
  }
  if (warnings.length > 0) toast.warning(`Shipment saved. ${warnings[0]}`);
}

/** Service Details totals. Charge weight is the sum of the piece rows, then one half-kg step when the vendor flag is on. */
function summarizePieceLines(lines: PiecesLine[], roundTotal = false): {
  actualWeight: string;
  volWeight: string;
  chargeWeight: string;
} {
  let actual = 0;
  let vol = 0;
  let charge = 0;
  for (const line of lines) {
    const pcs = Number.parseFloat(line.pieces) || 0;
    const perPc = Number.parseFloat(line.actualWeightPerPc) || 0;
    actual += perPc * pcs;
    vol += Number.parseFloat(line.volWeight) || 0;
    charge += Number.parseFloat(line.chargeWeight) || 0;
  }
  return {
    actualWeight: actual.toFixed(3),
    volWeight: vol.toFixed(3),
    chargeWeight: formatChargeWeight(charge, roundTotal && lines.length > 0),
  };
}

/** Box-1..Box-N, one box for each piece across the pieces rows, falling back to AWB pieces count. */
function deriveAwbBoxNumbers(piecesLines: PiecesLine[], piecesCount?: string): string[] {
  const lineTotal = piecesLines.reduce((sum, line) => {
    const pieces = Number.parseInt(line.pieces, 10);
    return sum + (Number.isFinite(pieces) && pieces > 0 ? pieces : 0);
  }, 0);
  const count = lineTotal > 0 ? lineTotal : Math.max(1, Number.parseInt(piecesCount || "1", 10) || 1);
  return Array.from({ length: count }, (_, index) => `Box-${index + 1}`);
}

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
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "form" ? ("form" as const) : undefined,
    fresh: typeof search.fresh === "string" && search.fresh ? search.fresh : undefined,
  }),
  head: () => ({
    meta: [
      { title: "AWB Entry — Transaction — Courier ERP" },
      { name: "description", content: "View and manage air waybill entries." },
    ],
  }),
  component: AwbEntryPage,
});

function AwbEntryPage() {
  const { fresh, view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { isAuthenticated: authed, profile, hasPermission } = useAuth();
  const { activeBranchId } = useActiveBranch();
  const queryClient = useQueryClient();
  const taxRateQuery = useQuery({
    queryKey: ["awb-tax-rate"],
    enabled: authed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("igst_pct, cgst_pct, sgst_pct")
        .eq("status", "ACTIVE")
        .is("deleted_at", null)
        .is("customer_id", null)
        .is("product_id", null)
        .order("from_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const branchStateQuery = useQuery({
    queryKey: ["awb-branch-state", activeBranchId],
    enabled: authed && Boolean(activeBranchId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("state_code")
        .eq("id", activeBranchId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.state_code ?? "";
    },
  });
  const userKey = draftUserKey(profile?.id, profile?.auth_user_id);
  const [demoRows, setDemoRows] = useState<AwbRow[]>(seedRows);
  const [colFilters, setColFilters] = useState(emptyColFilters());
  const [page, setPage] = useState(1);
  const [searchField, setSearchField] = useState<SearchField>("awbNo");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState<{ field: SearchField; query: string } | null>(
    null,
  );
  const showForm = view === "form";
  const [editing, setEditing] = useState<AwbRow | null>(null);
  const [form, setForm] = useState<AwbFullForm>(emptyForm());
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [chargeRefs, setChargeRefs] = useState({
    customerContract: "",
    vendorContract: "",
    customerZone: "",
    vendorZone: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<AwbRow | null>(null);
  const [activeTab, setActiveTab] = useState("awb");
  const [piecesOpen, setPiecesOpen] = useState(true);
  const [chargesOpen, setChargesOpen] = useState(true);
  const [piecesDraft, setPiecesDraft] = useState<PiecesDraft>(emptyPiecesDraft);
  const [editingPiecesId, setEditingPiecesId] = useState<string | null>(null);
  const [chargeDraft, setChargeDraft] = useState<ChargeDraft>(emptyChargeDraft);
  const [proformaDraft, setProformaDraft] = useState<ProformaDraft>(emptyProformaDraft);
  const [editingProformaId, setEditingProformaId] = useState<string | null>(null);
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
  const mtsFileRef = useRef<HTMLInputElement | null>(null);
  const loadedAwbIdRef = useRef<string | null>(null);
  const loadedRateKeyRef = useRef<string | null>(null);
  const proformaFileRef = useRef<HTMLInputElement | null>(null);
  const [proformaImportErrors, setProformaImportErrors] = useState<ProformaImportError[]>([]);
  const [proformaImportPending, setProformaImportPending] = useState<ProformaLine[] | null>(null);
  const [proformaPreview, setProformaPreview] = useState<{
    lines: ProformaLine[];
    warnings: string[];
  } | null>(null);
  const [proformaUploading, setProformaUploading] = useState(false);
  const awbFormNavRef = useRef<HTMLDivElement>(null);
  const [navInvalidOrders, setNavInvalidOrders] = useState<Set<number>>(() => new Set());
  const [vendorChargePrereqErrors, setVendorChargePrereqErrors] = useState<string[] | null>(null);
  const [weightErrorModal, setWeightErrorModal] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });
  const [rateCompareOpen, setRateCompareOpen] = useState(false);
  const [rateCompareRows, setRateCompareRows] = useState<VendorQuote[]>([]);
  const [rateCompareMessage, setRateCompareMessage] = useState("");
  const [ratingBusy, setRatingBusy] = useState<"customer" | "vendor" | "compare" | null>(null);
  const [formSetupOpen, setFormSetupOpen] = useState(false);
  const [formSetupSettings, setFormSetupSettings] =
    useState<AwbFormSetupSettings>(defaultAwbFormSetup);
  const [formSetupDraft, setFormSetupDraft] = useState<AwbFormSetupSettings>(defaultAwbFormSetup);
  const [chargeHeads, setChargeHeads] = useState<AwbChargeHead[]>([]);
  const [volumetricRows, setVolumetricRows] = useState<VolumetricFactor[]>([]);
  const [fuelRows, setFuelRows] = useState<FuelSurchargeRow[]>([]);
  const [vendorRoundOff, setVendorRoundOff] = useState(false);
  const [formToolbarSearch, setFormToolbarSearch] = useState("");
  const [toolbarSearchField, setToolbarSearchField] = useState<AwbLookupField>("awb_no");
  const [lastSavedForm, setLastSavedForm] = useState<AwbFullForm | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<string>(ENTRY_TYPES[0]);
  const [masterAwb, setMasterAwb] = useState("");
  const [saving, setSaving] = useState(false);
  const [bookingErrors, setBookingErrors] = useState<string[]>([]);
  const [cancelShipmentTarget, setCancelShipmentTarget] = useState<AwbRow | null>(null);
  const [awbMode, setAwbMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [clientLoading, setClientLoading] = useState(false);
  const [loadedClientProfile, setLoadedClientProfile] = useState<ClientProfile | null>(null);
  const clientLoadSeqRef = useRef(0);
  const [vendorBookingBusy, setVendorBookingBusy] = useState(false);
  const [vendorOtpOpen, setVendorOtpOpen] = useState(false);
  const [vendorOtpError, setVendorOtpError] = useState<string | null>(null);
  const [vendorOtpMobile, setVendorOtpMobile] = useState<string | null>(null);
  const [vendorSandboxOtp, setVendorSandboxOtp] = useState<string | null>(null);
  const [vendorMeta, setVendorMeta] = useState<VendorShippingMeta>({});
  const [vendorLastResult, setVendorLastResult] = useState<import("@/lib/integrations/vendor-shipping").VendorBookResult | null>(null);
  const [vendorPanelKey, setVendorPanelKey] = useState(0);

  const branchStockQuery = useQuery({
    queryKey: ["branch-awb-stock", profile?.home_branch_id, activeBranchId],
    queryFn: () => getBranchAwbStockSummary(activeBranchId || profile?.home_branch_id || undefined),
    enabled: authed,
  });

  const currentUserId = profile?.username || profile?.full_name || profile?.id || null;

  const awbStatusQuery = useQuery({
    queryKey: ["awb-entry-status", currentUserId],
    queryFn: () => getAwbEntryStatus({ userId: currentUserId }),
    enabled: authed,
  });

  // Alt+~ toggles Auto/Manual. Alt+U and Alt+C open the pieces and charges sections.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === "~" || key === "`") {
        e.preventDefault();
        setAwbMode((m) => {
          const next = m === "AUTO" ? "MANUAL" : "AUTO";
          toast.info(next === "MANUAL" ? "Switched to MANUAL AWB mode" : "Switched to AUTO AWB mode");
          if (next === "AUTO") {
            setForm((f) => ({ ...f, awbNo: "" }));
          }
          return next;
        });
        return;
      }
      if (!showForm || (key !== "u" && key !== "c" && key !== "w")) return;
      e.preventDefault();
      const order =
        key === "u"
          ? AWB_NAV.PIECES_ACTUAL_WEIGHT_PCS
          : key === "c"
            ? AWB_NAV.CHARGE_DESCRIPTION
            : AWB_NAV.VENDOR_CHARGE_DESCRIPTION;
      if (key === "u") setPiecesOpen(true);
      else if (key === "c") setChargesOpen(true);
      else setVendorChargesOpen(true);
      window.setTimeout(() => {
        const container = awbFormNavRef.current;
        if (container) focusErpFieldByOrder(container, order);
      }, 0);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showForm]);

  type DraftUiStatus = "idle" | "saving" | "saved" | "error";
  const [draftUiStatus, setDraftUiStatus] = useState<DraftUiStatus>("idle");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [restoreDraft, setRestoreDraft] = useState<AwbEntryDraftPayload | null>(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [leaveSource, setLeaveSource] = useState<"nav" | "close">("nav");
  const allowLeaveRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const saveLockRef = useRef(false);
  const lastDraftSnapshotRef = useRef<string>("");

  const formStatus = editing?.status ?? (showForm && !editing ? "DRAFT" : undefined);
  const isTerminalStatus = formStatus === "CANCELLED" || formStatus === "VOID";
  const persistedLocked = Boolean(editing?.id && editing.serverLocked);
  const isReadOnly = isTerminalStatus || persistedLocked;
  const canModifyAwb = profile?.user_type === "ADMIN" || hasPermission("txn.awb-entry", "modify");
  const canUnlockAwb = profile?.user_type === "ADMIN" || hasPermission("txn.awb-unlock", "modify");
  const entryLocked = isTerminalStatus || persistedLocked;
  /** Persisted shipment id from save/book/open-edit — not the AWB number input. */
  const isSaved = Boolean(editing?.id);
  const hasUnfinishedDraft =
    showForm && !isReadOnly && isAwbDraftWorthKeeping(form);

  const navBlocker = useBlocker({
    shouldBlockFn: ({ next }) => {
      if (allowLeaveRef.current || isFreshAwbEntryRequested()) {
        allowLeaveRef.current = false;
        return false;
      }
      const nextView =
        next.search && typeof next.search === "object" && "view" in next.search
          ? (next.search as { view?: string }).view
          : undefined;
      // Browser Back from the form returns to the AWB list. Do not hold that navigation.
      if (next.pathname === "/transaction/awb-entry" && nextView !== "form") return false;
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
      adCode: String(p.adCode ?? base.adCode),
      bondUt: String(p.bondUt ?? base.bondUt),
      payOfIgst: String(p.payOfIgst ?? base.payOfIgst),
      lutNo: String(p.lutNo ?? base.lutNo),
      lutExpiry: String(p.lutExpiry ?? base.lutExpiry),
      ecommerce: String(p.ecommerce ?? base.ecommerce),
      meis: String(p.meis ?? base.meis),
      invoiceType: String(p.invoiceType ?? base.invoiceType),
      lines: recalculateProformaAmounts({
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
      }).lines,
    };
  };

  const normalizeForwarding = (raw: unknown, fallback?: Partial<ForwardingData>): ForwardingData => {
    const base = emptyForwarding();
    const f =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const pair = (v: unknown, fb: LookupPair): LookupPair => {
      if (!v || typeof v !== "object") return { ...fb };
      const p = v as Record<string, unknown>;
      return {
        id: typeof p.id === "string" ? p.id : fb.id,
        code: String(p.code ?? fb.code ?? ""),
        name: String(p.name ?? fb.name ?? ""),
      };
    };
    const linesRaw = Array.isArray(f.vendorChargeLines) ? f.vendorChargeLines : [];
    return {
      ...base,
      ...fallback,
      deliveryAwb: String(f.deliveryAwb ?? fallback?.deliveryAwb ?? base.deliveryAwb),
      forwardingAwb: String(f.forwardingAwb ?? fallback?.forwardingAwb ?? base.forwardingAwb),
      deliveryProduct: pair(f.deliveryProduct, fallback?.deliveryProduct ?? base.deliveryProduct),
      deliveryVendor: pair(f.deliveryVendor, fallback?.deliveryVendor ?? base.deliveryVendor),
      deliveryService: pair(f.deliveryService, fallback?.deliveryService ?? base.deliveryService),
      vendorWeight: String(f.vendorWeight ?? fallback?.vendorWeight ?? base.vendorWeight),
      vendorAmount: String(f.vendorAmount ?? fallback?.vendorAmount ?? base.vendorAmount),
      vendorInvoice: String(f.vendorInvoice ?? fallback?.vendorInvoice ?? base.vendorInvoice),
      vendorChargeLines: linesRaw.map((line, i) => {
        const l = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
        return {
          id: String(l.id ?? `vch-${i}`),
          description: String(l.description ?? ""),
          rate: String(l.rate ?? ""),
          amount: String(l.amount ?? ""),
          fuelApply: String(l.fuelApply ?? "No"),
          fuelAmt: String(l.fuelAmt ?? "0"),
          taxApply: String(l.taxApply ?? "No"),
          taxOnFuel: String(l.taxOnFuel ?? "No"),
          igst: String(l.igst ?? "0"),
          sgst: String(l.sgst ?? "0"),
          cgst: String(l.cgst ?? "0"),
          total: String(l.total ?? "0"),
          chargesType: String(l.chargesType ?? "Vendor"),
        };
      }),
    };
  };

  const normalizeForm = (data: AwbFullForm): AwbFullForm => {
    const bookTimeDigits = String(data.bookTime ?? "")
      .replace(/\D/g, "")
      .slice(0, 4);
    const forwarding = normalizeForwarding(data.forwarding, {
      deliveryAwb: data.deliveryNo,
      forwardingAwb: data.forwardingNo,
    });
    return {
      ...data,
      masterAwbNo: String(data.masterAwbNo ?? ""),
      bookTime: bookTimeDigits || data.bookTime,
      expectedDeliveryDate: String(data.expectedDeliveryDate ?? ""),
      notifyEmail: data.notifyEmail === true,
      notifySms: data.notifySms === true,
      proforma: normalizeProforma(data.proforma),
      forwarding: {
        ...forwarding,
        deliveryAwb: forwarding.deliveryAwb || data.deliveryNo || "",
        forwardingAwb: forwarding.forwardingAwb || data.forwardingNo || "",
      },
      kyc: data.kyc ?? emptyKyc(),
      piecesLines: (data.piecesLines ?? []).map((l, i) => ({
        ...l,
        id: l.id || `pc-${i}`,
      })),
      chargeLines: (data.chargeLines ?? []).map((l, i) => ({
        ...l,
        id: l.id || `ch-${i}`,
      })),
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
    const amountOf = (line: { amount: string }) => Number.parseFloat(line.amount) || 0;
    const freight = form.chargeLines
      .filter((line) => /freight/i.test(line.description))
      .reduce((sum, line) => sum + amountOf(line), 0);
    const other = form.chargeLines
      .filter((line) => !/freight/i.test(line.description))
      .reduce((sum, line) => sum + amountOf(line), 0);
    const totalFuel = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.fuelAmt) || 0), 0);
    const igst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.igst) || 0), 0);
    const cgst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.cgst) || 0), 0);
    const sgst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.sgst) || 0), 0);
    const total = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.total) || 0), 0);
    return {
      freight: freight.toFixed(2),
      fuel: totalFuel.toFixed(2),
      tax: (igst + cgst + sgst).toFixed(2),
      otherCharges: other.toFixed(2),
      vendorCost: "0.00",
      total: total.toFixed(2),
      contractCharges: freight.toFixed(2),
      subTotal: (freight + other).toFixed(2),
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
    const persistedVendor = Number(breakdown.raw?.vendor_charges_total);
    setRatingSummary(summary);
    setForm((f) => ({
      ...f,
      chargeLines: lines,
      customerChargesTotal: summary.totalAmount,
      vendorChargesTotal:
        Number.isFinite(persistedVendor) && breakdown.raw?.vendor_charges_total != null
          ? persistedVendor.toFixed(2)
          : summary.vendorCost,
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

  const proformaBoxNumbers = useMemo(
    () => deriveAwbBoxNumbers(form.piecesLines, form.pieces),
    [form.piecesLines, form.pieces],
  );

  useEffect(() => {
    setProformaDraft((draft) => {
      if (proformaBoxNumbers.length === 0) return draft;
      if (proformaBoxNumbers.includes(draft.boxNo)) return draft;
      return { ...draft, boxNo: proformaBoxNumbers[0]! };
    });
  }, [proformaBoxNumbers]);

  const effectiveVendorId = form.forwarding.deliveryVendor?.id || form.vendor?.id;
  const vendorMasterQuery = useQuery({
    queryKey: ["vendor-master-details", effectiveVendorId],
    enabled: authed && Boolean(effectiveVendorId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, code, name, state_id, gst_no, charges_gst_on_export, states:states(id, code, name)")
        .eq("id", effectiveVendorId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const vendorStateCode =
    (vendorMasterQuery.data as unknown as { states?: { code?: string } })?.states?.code ||
    vendorMasterQuery.data?.gst_no?.slice(0, 2) ||
    "";
  const hasVendorStateOrGst = Boolean(vendorStateCode.trim());
  const vendorMissingStateWarning =
    effectiveVendorId && !hasVendorStateOrGst
      ? "Selected vendor has no State or GSTIN registered in vendor master. Vendor GST cannot be calculated."
      : null;
  const vendorIntraState =
    hasVendorStateOrGst &&
    vendorStateCode.trim().toUpperCase() === (branchStateQuery.data || "").trim().toUpperCase();
  const vendorChargesGst =
    hasVendorStateOrGst && vendorMasterQuery.data?.charges_gst_on_export !== false;
  const vendorGstPct = vendorChargesGst ? Number(taxRateQuery.data?.igst_pct ?? 18) : 0;

  const vendorFuelPct = fuelPercentFor({
    rows: fuelRows,
    vendorCode: (form.forwarding.deliveryVendor?.code || form.vendor?.code)?.trim(),
    vendorName: (form.forwarding.deliveryVendor?.name || form.vendor?.name)?.trim(),
    productCode: (form.forwarding.deliveryProduct?.code || form.product?.code)?.trim(),
    productName: (form.forwarding.deliveryProduct?.name || form.product?.name)?.trim(),
    destinationCode: form.consignee?.origin?.code?.trim(),
    destinationName: form.consignee?.origin?.name?.trim(),
    bookDate: form.bookDate,
  });

  const priceVendorChargeDraft = (draft: VendorChargeDraft) => {
    const applyFuel = draft.fuel === "Yes";
    const applyTaxOnFuel = draft.taxOnFuel === "Yes";
    const applyTax = draft.tax === "Yes";
    return manualChargeAmounts({
      itemAmount: Number.parseFloat(draft.amount) || 0,
      applyFuel,
      applyTaxOnFuel,
      applyTax,
      fuelPct: vendorFuelPct,
      gstPct: vendorGstPct,
      intraState: vendorIntraState,
    });
  };

  const vendorChargeSummary = useMemo(() => {
    const lines = form.forwarding.vendorChargeLines;
    const contract = Number.parseFloat(ratingSummary?.vendorCost || form.vendorChargesTotal || "0") || 0;
    const contractFuel = (contract * vendorFuelPct) / 100;
    const contractTaxBase = contract + contractFuel;
    const contractGst = (contractTaxBase * vendorGstPct) / 100;

    const manualAmt = lines.reduce((s, l) => s + (Number.parseFloat(l.amount) || 0), 0);
    const manualFuel = lines.reduce((s, l) => s + (Number.parseFloat(l.fuelAmt) || 0), 0);
    const manualGst = lines.reduce(
      (s, l) => s + (Number.parseFloat(l.igst || "0") + Number.parseFloat(l.cgst || "0") + Number.parseFloat(l.sgst || "0")),
      0,
    );

    const totalFuel = contractFuel + manualFuel;
    const vendorCostExGst = contract + contractFuel + manualAmt + manualFuel;
    const totalVendorGst = contractGst + manualGst;
    const vendorTotalInclGst = vendorCostExGst + totalVendorGst;

    // Customer Total ex-GST: customer freight + customer fuel + customer other charges
    const custGrand = Number.parseFloat(form.customerChargesTotal || "0") || 0;
    const custTax = Number.parseFloat(chargeSummary.tax || "0") || 0;
    const custExGst = custGrand > 0 ? (custGrand - custTax > 0 ? custGrand - custTax : custGrand) : (Number.parseFloat(chargeSummary.subTotal || "0") + Number.parseFloat(chargeSummary.fuel || "0"));

    const margin = custExGst - vendorCostExGst;

    return {
      contractCharges: contract.toFixed(2),
      contractFuel: contractFuel.toFixed(2),
      manualCharges: manualAmt.toFixed(2),
      manualFuel: manualFuel.toFixed(2),
      totalFuel: totalFuel.toFixed(2),
      vendorCostExGst: vendorCostExGst.toFixed(2),
      vendorGst: totalVendorGst.toFixed(2),
      vendorTotalInclGst: vendorTotalInclGst.toFixed(2),
      totalAmount: vendorTotalInclGst.toFixed(2),
      customerExGst: custExGst.toFixed(2),
      margin: margin.toFixed(2),
      subTotal: (contract + manualAmt).toFixed(2),
      otherCharges: manualAmt.toFixed(2),
      igst: lines.reduce((s, l) => s + (Number.parseFloat(l.igst) || 0), 0).toFixed(2),
      cgst: lines.reduce((s, l) => s + (Number.parseFloat(l.cgst) || 0), 0).toFixed(2),
      sgst: lines.reduce((s, l) => s + (Number.parseFloat(l.sgst) || 0), 0).toFixed(2),
    };
  }, [form.forwarding.vendorChargeLines, ratingSummary?.vendorCost, form.vendorChargesTotal, vendorFuelPct, vendorGstPct, form.customerChargesTotal, chargeSummary.tax, chargeSummary.subTotal, chargeSummary.fuel]);

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
  const openBlankAwb = () => {
    setEditing(null);
    setForm(emptyForm());
    setRatingSummary(null);
    setBookingErrors([]);
    setActiveTab("awb");
    setPiecesDraft(emptyPiecesDraft());
    setEditingPiecesId(null);
    setEditingProformaId(null);
    setChargeDraft(emptyChargeDraft());
    setProformaDraft(emptyProformaDraft());
    setVendorChargeDraft(emptyVendorChargeDraft());
    setLoadedClientProfile(null);
    setClientLoading(false);
    setVendorMeta({});
    setKycSearchInput("");
    allowLeaveRef.current = true;
  };

  const goNextTab = () => {
    if (tabIndex < AWB_TABS.length - 1) {
      setActiveTab(AWB_TABS[tabIndex + 1]);
    }
  };

  const patchProforma = (patch: Partial<ProformaData>) => {
    setForm((f) => ({ ...f, proforma: { ...f.proforma, ...patch } }));
  };

  const patchForwarding = (patch: Partial<ForwardingData>) => {
    setForm((f) => ({ ...f, forwarding: { ...f.forwarding, ...patch } }));
  };

  useEffect(() => {
    if (
      (activeTab === "forwarding" || activeTab === "Forwarding") &&
      form.chargeWeight &&
      (!form.forwarding.vendorWeight ||
        form.forwarding.vendorWeight === "0" ||
        form.forwarding.vendorWeight.trim() === "")
    ) {
      patchForwarding({ vendorWeight: form.chargeWeight });
    }
  }, [activeTab, form.chargeWeight, form.forwarding.vendorWeight]);

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
    try {
      localStorage.setItem(`${FORM_SETUP_STORAGE_KEY}:${userKey}`, JSON.stringify(formSetupDraft));
    } catch {
      /* Form setup still applies for this visit when storage is unavailable. */
    }
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

  const openShipmentBrief = async (
    found: { id: string; row_version: number; current_status?: string | null; awb_no?: string | null },
    fallbackAwb = "",
  ) => {
    const awbNo = found.awb_no ?? fallbackAwb;
    await openEdit({
      ...emptyForm(),
      id: found.id,
      rowVersion: found.row_version,
      status: found.current_status ?? "DRAFT",
      awbNo,
    } as AwbRow);
    setFormToolbarSearch("");
    toast.success(`Opened AWB ${awbNo}`);
  };

  const handleFormToolbarSearch = async () => {
    const q = formToolbarSearch.trim();
    if (!q) return;
    const field: AwbLookupField = toolbarSearchField;
    const missing =
      AWB_LOOKUP_FIELDS.find((item) => item.value === field)?.missing ?? "No AWB found";
    if (authed) {
      try {
        setSaving(true);
        const found = await findShipmentBySearch({ query: q, field });
        if (!found) {
          toast.error(missing);
          return;
        }
        await openShipmentBrief(found, q);
      } catch (e) {
        toast.error(toErrorMessage(e, "Search failed"));
      } finally {
        setSaving(false);
      }
      return;
    }
    const needle = q.toLowerCase();
    const match = rows.find((row) => {
      const value =
        field === "forwarding_awb"
          ? row.forwardingNo
          : field === "delivery_awb"
            ? row.deliveryNo
            : field === "reference_no"
              ? row.referenceNo
              : row.awbNo;
      return value.toLowerCase().includes(needle);
    });
    if (match) {
      void openEdit(match);
      setFormToolbarSearch("");
      toast.success(`Opened AWB ${match.awbNo}`);
    } else toast.error(missing);
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

  const resetCloneSessionState = () => {
    setEditing(null);
    setRatingSummary(null);
    setPiecesDraft(emptyPiecesDraft());
    setEditingPiecesId(null);
    setEditingProformaId(null);
    setChargeDraft(emptyChargeDraft());
    setProformaDraft(emptyProformaDraft());
    setVendorChargeDraft(emptyVendorChargeDraft());
    setKycSearchInput("");
    setBookingErrors([]);
    setLoadedClientProfile(null);
    setClientLoading(false);
    setVendorMeta({});
    setVendorOtpOpen(false);
    setVendorOtpError(null);
    setVendorSandboxOtp(null);
    setVendorBookingBusy(false);
    setVendorPanelKey((k) => k + 1);
    setActiveTab("awb");
  };

  const handleEntrySearch = async () => {
    const key = masterAwb.trim();
    if (!key) return toast.error("Master AWB is required");
    if (entryType !== "Duplicate Entry") {
      closeEntry();
      return;
    }

    setSaving(true);
    try {
      let sourceForm: AwbFullForm | null = null;
      let sourceAwbNo = key;

      if (authed) {
        const found = await findShipmentBySearch({ query: key, field: "awb_no" });
        if (!found) {
          toast.error("Master AWB not found");
          return;
        }
        sourceAwbNo = found.awb_no || key;
        const children = await fetchShipmentChildren(found.id);
        const patch = dbShipmentToFormPatch(found, children);
        const {
          id: _id,
          rowVersion: _rv,
          status: _st,
          carrierProviderCode: _cpc,
          carrierBookingRef: _cbr,
          carrierTrackingNo: _ctn,
          carrierBookingStatus: _cbs,
          carrierLabelFileId: _clf,
          ...rest
        } = patch;
        sourceForm = await withStoredKyc(
          found.id,
          normalizeForm({ ...emptyForm(), ...rest } as AwbFullForm),
        );
      } else {
        const match = rows.find(
          (r) => r.awbNo === key || r.awbNo.toLowerCase() === key.toLowerCase(),
        );
        if (!match) {
          toast.error("Master AWB not found");
          return;
        }
        sourceAwbNo = match.awbNo;
        const { id: _id, rowVersion: _rv, status: _st, ...rest } = match;
        sourceForm = normalizeForm(rest);
      }

      const cloned = cloneAwbFormFromSource(sourceForm, sourceAwbNo, {
        awbNoPlus1: formSetupSettings.awbNoPlus1,
      });
      resetCloneSessionState();
      setForm(normalizeForm(cloned));
      allowLeaveRef.current = true;
      // Don't block the UI on draft cleanup.
      void clearDraftState();
      toast.success(`Duplicated from AWB ${sourceAwbNo}`);
      closeEntry();
    } catch (e) {
      toast.error(toErrorMessage(e, "Could not duplicate AWB"));
    } finally {
      setSaving(false);
    }
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
    awbMode,
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
    if (draft.awbMode === "MANUAL" || draft.awbMode === "AUTO") {
      setAwbMode(draft.awbMode);
    }
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
  };

  const clearDraftState = async () => {
    await clearAwbDraft({ userKey, syncRemote: authed });
    lastDraftSnapshotRef.current = "";
    setDraftUiStatus("idle");
    setDraftSavedAt(null);
  };

  const openFormSnapRef = useRef<AwbEntryDraftPayload | null>(null);
  openFormSnapRef.current = showForm ? buildCurrentDraft() : null;
  const skippedOpenFormClearRef = useRef(false);
  const freshHandledRef = useRef<string | undefined>(undefined);
  const didInitialNavRef = useRef(false);

  const beginNewAwbEntry = () => {
    allowLeaveRef.current = true;
    clearFreshAwbEntryRequest();
    const nextForm = applyFormSetupRepeats(emptyForm());
    const nextPieces = emptyPiecesDraft();
    const nextCharge = emptyChargeDraft();
    const nextProforma = emptyProformaDraft();
    const nextVendorCharge = emptyVendorChargeDraft();
    const blankSnapshot: AwbEntryDraftPayload = {
      version: AWB_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      userKey,
      form: nextForm,
      editing: null,
      activeTab: "awb",
      awbMode: "AUTO",
      piecesDraft: nextPieces,
      chargeDraft: nextCharge,
      proformaDraft: nextProforma,
      vendorChargeDraft: nextVendorCharge,
    };
    writeOpenAwbForm(blankSnapshot);
    openFormSnapRef.current = blankSnapshot;
    setRestoreDraft(null);
    setEditing(null);
    setAwbMode("AUTO");
    setForm(nextForm);
    setFormToolbarSearch("");
    setToolbarSearchField("awb_no");
    setRatingSummary(null);
    setPiecesDraft(nextPieces);
    setChargeDraft(nextCharge);
    setProformaDraft(nextProforma);
    setVendorChargeDraft(nextVendorCharge);
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
    setVendorSandboxOtp(null);
    setVendorBookingBusy(false);
    setVendorPanelKey((key) => key + 1);
  };

  const pushFormPage = () => {
    if (view === "form") return;
    allowLeaveRef.current = true;
    void navigate({ search: { view: "form", fresh: undefined } });
  };

  useLayoutEffect(() => {
    if (fresh || isFreshAwbEntryRequested()) {
      didInitialNavRef.current = true;
      if (freshHandledRef.current !== fresh) {
        freshHandledRef.current = fresh;
        beginNewAwbEntry();
      }
      return;
    }
    if (didInitialNavRef.current) return;
    didInitialNavRef.current = true;
    if (view !== "form") return;
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    // Opening Add pushes a new history entry and must not reload the last shipment.
    // A browser refresh of the form address still restores the fields on screen.
    if (navigation && navigation.type !== "reload") return;
    const snap = readOpenAwbForm();
    if (!snap) return;
    skippedOpenFormClearRef.current = true;
    applyDraftPayload(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, view]);

  useEffect(() => {
    if (!fresh) return;
    void navigate({ search: { view: "form", fresh: undefined }, replace: true });
  }, [fresh, navigate]);

  useEffect(() => {
    const flush = () => {
      const snap = openFormSnapRef.current;
      if (snap) writeOpenAwbForm(snap);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    if (skippedOpenFormClearRef.current) {
      skippedOpenFormClearRef.current = false;
      return;
    }
    if (!showForm) {
      clearOpenAwbForm();
      return;
    }
    const timer = window.setTimeout(() => {
      const snap = openFormSnapRef.current;
      if (snap) writeOpenAwbForm(snap);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [showForm, form, piecesDraft, chargeDraft, proformaDraft, vendorChargeDraft, activeTab, awbMode, editing]);

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
    // Draft autosave disabled
  }, []);

  useEffect(() => {
    if (navBlocker.status === "blocked") {
      setLeaveSource("nav");
      setLeavePromptOpen(true);
    }
  }, [navBlocker.status]);

  const shipmentRatingInput = () => {
    const pieces = form.piecesLines.map((line) => ({
      actualWeight: Number.parseFloat(line.actualWeightPerPc) || 0,
      pieces: Number.parseInt(line.pieces, 10) || 1,
      length: Number.parseFloat(line.length) || 0,
      width: Number.parseFloat(line.breadth) || 0,
      height: Number.parseFloat(line.height) || 0,
    }));
    if (pieces.length === 0) {
      const draftPieces = Number.parseInt(piecesDraft.noOfPieces, 10) || 0;
      const draftWeight = Number.parseFloat(piecesDraft.actualWeightPerPc) || 0;
      const draftLength = Number.parseFloat(piecesDraft.length) || 0;
      const draftWidth = Number.parseFloat(piecesDraft.width) || 0;
      const draftHeight = Number.parseFloat(piecesDraft.height) || 0;
      if (draftPieces > 0 || draftWeight > 0 || draftLength * draftWidth * draftHeight > 0) {
        pieces.push({
          actualWeight: draftWeight,
          pieces: draftPieces || 1,
          length: draftLength,
          width: draftWidth,
          height: draftHeight,
        });
      }
    }
    if (pieces.length === 0) return null;

    const otherChargesSum = form.chargeLines
      .filter((line) => line.description.toUpperCase() !== "FREIGHT")
      .reduce((sum, line) => sum + (Number.parseFloat(line.amount) || 0), 0);

    return {
      customerCode: form.clientName.code || "",
      contractNo: "",
      productCode: form.product.code || form.product.name || "",
      vendorCode: form.vendor.code || "",
      serviceCode: form.service.code || form.service.name || "",
      originCode: form.shipper.origin.code || "",
      originName: form.shipper.origin.name || "",
      destinationCode: form.consignee.origin.code || "",
      destinationName: form.consignee.origin.name || "",
      destinationCountry: form.consignee.country || "",
      bookDate: form.bookDate || todayIso(),
      pieces,
      division: Number.parseFloat(form.piecesLines[0]?.division || piecesDraft.division) || 5000,
      roundHalfKg: vendorRoundOff,
      fuelPct: fuelPercentFor({
        rows: fuelRows,
        vendorCode: form.vendor.code,
        vendorName: form.vendor.name,
        productCode: form.product.code,
        productName: form.product.name,
        destinationCode: form.consignee.origin.code,
        destinationName: form.consignee.origin.name,
        bookDate: form.bookDate,
      }),
      gstPct: awbGstPercent({ gstPercent: Number(taxRateQuery.data?.igst_pct ?? 18) }),
      igstPct: Number(taxRateQuery.data?.igst_pct ?? 18),
      cgstPct: Number(taxRateQuery.data?.cgst_pct ?? 9),
      sgstPct: Number(taxRateQuery.data?.sgst_pct ?? 9),
      otherCharges: otherChargesSum,
      customerBillingStateCode: loadedClientProfile?.billingStateCode || "",
      branchStateCode: branchStateQuery.data || "",
    };
  };

  const postRating = async (path: string, payload: unknown) => {
    const { authorizedFetch } = await import("@/lib/security/authorized-fetch");
    const res = await authorizedFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as RatingCalculationResult & {
      code?: string;
      message?: string;
      error?: string;
      rows?: VendorQuote[];
    };
    return { ok: res.ok, data };
  };

  const handleCheckRateCombination = async (options?: { silent?: boolean }) => {
    const payload = shipmentRatingInput();
    if (!payload) {
      if (!options?.silent) {
        toast.error("Please add at least one piece row before calculating rates");
      }
      return;
    }
    if (!form.clientName.code.trim() && !options?.silent) {
      toast.error("Select a customer before calculating customer charges");
      return;
    }

    try {
      if (!options?.silent) setRatingBusy("customer");

      const { ok, data } = await postRating("/api/shipments/rate", payload);

      if (!ok) {
        if (
          data.code === "WEIGHT_OUT_OF_RANGE" ||
          (data.message && data.message.includes("weight allowed between"))
        ) {
          setWeightErrorModal({
            open: true,
            message: String(data.message || data.error || ""),
          });
          setRatingSummary(null);
          setForm((f) => ({
            ...f,
            customerChargesTotal: "0.00",
            balanceAmount: "0.00",
          }));
          return;
        }

        toast.error(data.message || data.error || "Failed to calculate rating");
        if (options?.silent) {
          setChargeRefs((current) => ({ ...current, customerContract: "", customerZone: "" }));
          setForm((current) => ({
            ...current,
            customerChargesTotal: "0.00",
            balanceAmount: "0.00",
          }));
        }
        return;
      }

      const summary = apiRatingToSummary(data);
      const chargeLines = apiRatingToChargeLines(data);

      setRatingSummary(summary);
      setChargeRefs((current) => ({
        ...current,
        customerContract: data.contractNo || "",
        customerZone: data.zoneCode || "",
      }));
      setForm((f) => {
        const manualLines = f.chargeLines.filter(
          (line) => line.chargesType?.toUpperCase() !== "SYSTEM" && !/freight/i.test(line.description),
        );
        return {
          ...f,
          customerChargesTotal: summary.totalAmount,
          balanceAmount: balanceDue(summary.totalAmount, f.amountReceived),
          chargeLines: [...chargeLines, ...manualLines],
        };
      });

      if (!options?.silent) {
        toast.success(
          `Check Rate Combination: Total ₹${summary.totalAmount} (Contract Charges: ₹${summary.contractCharges})`,
        );
      }
    } catch (err) {
      toast.error(toErrorMessage(err, "Rate calculation request failed"));
    } finally {
      if (!options?.silent) setRatingBusy(null);
    }
  };

  const handleVendorCharges = async (options?: { silent?: boolean }) => {
    const payload = shipmentRatingInput();
    if (!payload) {
      if (!options?.silent) toast.error("Please add at least one piece row before calculating rates");
      return;
    }
    if (!payload.vendorCode) {
      if (!options?.silent) toast.error("Select a vendor before calculating vendor charges");
      return;
    }

    try {
      if (!options?.silent) setRatingBusy("vendor");
      const { ok, data } = await postRating("/api/shipments/vendor-rate", payload);
      if (!ok) {
        toast.error(data.message || data.error || "No vendor tariff for this shipment");
        if (options?.silent) {
          setChargeRefs((current) => ({ ...current, vendorContract: "", vendorZone: "" }));
          setForm((current) => ({ ...current, vendorChargesTotal: "0.00" }));
        }
        return;
      }
      const total = Number(data.totalAmount);
      if (!Number.isFinite(total)) {
        if (!options?.silent) toast.error("Vendor tariff did not return an amount");
        return;
      }
      setChargeRefs((current) => ({
        ...current,
        vendorContract: data.contractNo || "",
        vendorZone: data.zoneCode || "",
      }));
      setForm((current) => ({ ...current, vendorChargesTotal: total.toFixed(2) }));
      if (!options?.silent) toast.success(`Vendor cost ₹${total.toFixed(2)}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Vendor charge calculation failed"));
    } finally {
      if (!options?.silent) setRatingBusy(null);
    }
  };

  const handleRateCompare = async () => {
    const payload = shipmentRatingInput();
    if (!payload) {
      toast.error("Please add at least one piece row before comparing rates");
      return;
    }

    setRateCompareRows([]);
    setRateCompareMessage("");
    setRateCompareOpen(true);
    try {
      setRatingBusy("compare");
      const { ok, data } = await postRating("/api/shipments/rate-compare", {
        ...payload,
        serviceCode: "",
      });
      if (!ok) {
        setRateCompareMessage(data.message || "Rate compare failed");
        return;
      }
      const rows = data.rows ?? [];
      setRateCompareRows(rows);
      if (rows.length === 0) {
        setRateCompareMessage("No vendor tariff covers this origin, destination, product, and weight.");
      }
    } catch (err) {
      setRateCompareMessage(toErrorMessage(err, "Rate compare failed"));
    } finally {
      setRatingBusy(null);
    }
  };

  const selectComparedVendor = (row: VendorQuote) => {
    setForm((current) => ({
      ...current,
      vendor: { id: row.vendorId, code: row.vendorCode, name: row.vendorName },
      service: row.service
        ? { ...current.service, code: row.service, name: row.service }
        : current.service,
      vendorChargesTotal: row.totalAmount.toFixed(2),
    }));
    setChargeRefs((current) => ({
      ...current,
      vendorContract: row.contractNo || "",
      vendorZone: row.zoneCode || "",
    }));
    setRateCompareOpen(false);
    toast.success(`${row.vendorName} selected. Vendor cost ₹${row.totalAmount.toFixed(2)}`);
  };

  useEffect(() => {
    const totals = summarizePieceLines(form.piecesLines, vendorRoundOff);
    const pieceCount =
      form.piecesLines.length > 0
        ? String(sumPieceCount(form.piecesLines.map((line) => line.pieces)))
        : null;
    setForm((f) => {
      const nextPieces = pieceCount ?? f.pieces;
      if (
        f.actualWeight === totals.actualWeight &&
        f.volWeight === totals.volWeight &&
        f.chargeWeight === totals.chargeWeight &&
        f.pieces === nextPieces
      ) {
        return f;
      }
      return {
        ...f,
        actualWeight: totals.actualWeight,
        volWeight: totals.volWeight,
        chargeWeight: totals.chargeWeight,
        pieces: nextPieces,
      };
    });
  }, [form.piecesLines, vendorRoundOff]);

  useEffect(() => {
    const next = balanceDue(payableFromLines(form), form.amountReceived);
    setForm((current) => (current.balanceAmount === next ? current : { ...current, balanceAmount: next }));
  }, [form.chargeLines, form.customerChargesTotal, form.amountReceived]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${FORM_SETUP_STORAGE_KEY}:${userKey}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AwbFormSetupSettings>;
      setFormSetupSettings((current) => ({ ...current, ...parsed }));
      setFormSetupDraft((current) => ({ ...current, ...parsed }));
    } catch {
      /* Ignore a damaged form-setup record and keep the defaults. */
    }
  }, [userKey]);

  useEffect(() => {
    if (!authed) {
      setChargeHeads([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("charges")
      .select("code, name, charge_rate, apply_fuel, apply_tax_on_fuel, apply_tax, charge_type, sequence")
      .is("deleted_at", null)
      .eq("charge_type", "AIRWAYBILL")
      .order("sequence", { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setChargeHeads(
          data.map((row) => ({
            code: String(row.code ?? ""),
            name: String(row.name ?? row.code ?? ""),
            charge_rate: Number(row.charge_rate ?? 0),
            apply_fuel: row.apply_fuel === true,
            apply_tax_on_fuel: row.apply_tax_on_fuel === true,
            apply_tax: row.apply_tax === true,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [authed]);

  useEffect(() => {
    const customerId = form.clientName.id;
    if (!authed || !customerId) {
      setVolumetricRows([]);
      setFuelRows([]);
      return;
    }
    let cancelled = false;
    void fetchCustomerChildren(customerId)
      .then((children) => {
        if (cancelled) return;
        setVolumetricRows(children.volumetrics);
        setFuelRows(children.fuelSurcharges);
        const adCode = children.addresses.find((address) => (address.ad_code ?? "").trim())?.ad_code?.trim() ?? "";
        if (!adCode) return;
        setForm((current) =>
          current.proforma.adCode.trim()
            ? current
            : { ...current, proforma: { ...current.proforma, adCode } },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setVolumetricRows([]);
          setFuelRows([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authed, form.clientName.id]);

  useEffect(() => {
    const vendorId = form.vendor.id;
    if (!authed || !vendorId) {
      setVendorRoundOff(false);
      return;
    }
    let cancelled = false;
    void supabase
      .from("vendors")
      .select("vol_weight_round_off")
      .eq("id", vendorId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setVendorRoundOff(data?.vol_weight_round_off === true);
      });
    return () => {
      cancelled = true;
    };
  }, [authed, form.vendor.id]);

  const divisionKey = [
    form.product.code,
    form.product.name,
    form.vendor.code,
    form.vendor.name,
    form.service.code,
    form.service.name,
    piecesDraft.measurementUnit,
    volumetricRows
      .map((row) => `${row.product}|${row.vendor}|${row.service}|${row.cm_divisor}|${row.inch_divisor}`)
      .join(";"),
  ].join("||");

  useEffect(() => {
    const nextDivision = resolveDivision({
      measurementUnit: piecesDraft.measurementUnit,
      productCode: form.product.code,
      productName: form.product.name,
      vendorCode: form.vendor.code,
      vendorName: form.vendor.name,
      serviceCode: form.service.code,
      serviceName: form.service.name,
      rows: volumetricRows,
    });
    setPiecesDraft((current) => {
      if (current.division === nextDivision) return current;
      const next = { ...current, division: nextDivision };
      next.volWeight = calcVolWeight(next);
      next.chargeWeight = calcChargeWeight(next);
      return next;
    });
    // divisionKey is the only trigger. Typing a division must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionKey]);

  useEffect(() => {
    setPiecesDraft((current) => {
      const chargeWeight = calcChargeWeight(current);
      return current.chargeWeight === chargeWeight ? current : { ...current, chargeWeight };
    });
    setForm((current) => {
      if (current.piecesLines.length === 0) return current;
      let changed = false;
      const piecesLines = current.piecesLines.map((line) => {
        const volumetric = Number.parseFloat(line.volWeight) || 0;
        const actual = (Number.parseFloat(line.actualWeightPerPc) || 0) * (Number.parseFloat(line.pieces) || 0);
        const chargeWeight = formatChargeWeight(Math.max(volumetric, actual), false);
        if (chargeWeight === line.chargeWeight) return line;
        changed = true;
        return { ...line, chargeWeight };
      });
      return changed ? { ...current, piecesLines } : current;
    });
  }, [vendorRoundOff]);

  const rateCustomerRef = useRef(handleCheckRateCombination);
  rateCustomerRef.current = handleCheckRateCombination;
  const rateVendorRef = useRef(handleVendorCharges);
  rateVendorRef.current = handleVendorCharges;

  const customerRateKey = [
    authed ? "1" : "0",
    showForm ? "1" : "0",
    entryLocked ? "1" : "0",
    form.clientName.code,
    form.product.code,
    form.product.name,
    form.vendor.code,
    form.service.code,
    form.service.name,
    form.shipper.origin.code,
    form.shipper.origin.name,
    form.shipper.state,
    form.consignee.origin.code,
    form.consignee.origin.name,
    form.consignee.country,
    form.bookDate,
    form.commercial ? "1" : "0",
    form.proforma.csbType,
    piecesDraft.actualWeightPerPc,
    piecesDraft.noOfPieces,
    piecesDraft.length,
    piecesDraft.width,
    piecesDraft.height,
    piecesDraft.division,
    form.piecesLines
      .map((line) =>
        [
          line.actualWeightPerPc,
          line.pieces,
          line.length,
          line.breadth,
          line.height,
          line.division ?? "",
        ].join(":"),
      )
      .join(","),
  ].join("|");

  // Remember the rate inputs that were stored with this AWB. A later change
  // is the only reason to calculate again.
  useEffect(() => {
    if (!editing?.id) {
      loadedAwbIdRef.current = null;
      loadedRateKeyRef.current = null;
      return;
    }
    if (loadedAwbIdRef.current !== editing.id) {
      loadedAwbIdRef.current = editing.id;
      loadedRateKeyRef.current = customerRateKey;
    }
  }, [editing?.id, customerRateKey]);

  // Fill Customer Charges as soon as the client, lane, and weight are known.
  // Opening a saved AWB shows the stored charges. Rating runs only after a
  // rate field changes, and only for a new AWB while it is being filled in.
  useEffect(() => {
    if (!authed || !showForm || entryLocked) return;
    if (
      rateRefreshDecision({
        isSavedAwb: Boolean(editing?.id),
        loadedRateKey: loadedRateKeyRef.current,
        currentRateKey: customerRateKey,
      }) === "show-stored"
    ) {
      return;
    }
    if (!form.clientName.code.trim()) return;
    if (!form.shipper.origin.code.trim() && !form.shipper.origin.name.trim()) return;
    if (!form.consignee.origin.code.trim() && !form.consignee.origin.name.trim()) return;
    const timer = window.setTimeout(() => {
      void rateCustomerRef.current({ silent: true });
      if (form.vendor.code.trim()) void rateVendorRef.current({ silent: true });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [customerRateKey, editing?.id, authed, showForm, entryLocked]);

  const openAdd = () => {
    const existing = restoreDraft ?? readLocalAwbDraft(userKey);
    if (existing && isAwbDraftWorthKeeping(existing.form)) {
      setRestoreDraft(existing);
      return;
    }
    beginNewAwbEntry();
    pushFormPage();
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
        const formForDocs = await withStoredKyc(
          row.id,
          normalizeForm({ ...emptyForm(), ...rest } as AwbFullForm),
        );
        const lockDisplay = await lockDisplayFor(full);
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
          lockedByName: lockDisplay.lockedByName,
          lockedAt: lockDisplay.lockedAt,
          serverLocked: Boolean(full.is_locked),
        } as AwbRow);
        setForm(formForDocs);
        setRatingSummary(null);
        loadedAwbIdRef.current = null;
        if (authed && (formForDocs.clientName.id || formForDocs.clientName.code.trim())) {
          const seq = ++clientLoadSeqRef.current;
          void loadClientProfile({
            id: formForDocs.clientName.id,
            code: formForDocs.clientName.code,
            name: formForDocs.clientName.name,
          })
            .then((profile) => {
              if (seq !== clientLoadSeqRef.current) return;
              setLoadedClientProfile(profile);
            })
            .catch(() => undefined);
        }
        setPiecesDraft(emptyPiecesDraft());
        setEditingPiecesId(null);
        setEditingProformaId(null);
        setChargeDraft(emptyChargeDraft());
        setProformaDraft(emptyProformaDraft());
        setVendorChargeDraft(emptyVendorChargeDraft());
        setKycSearchInput("");
        setBookingErrors([]);
        setActiveTab("awb");
        pushFormPage();
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
    setEditingPiecesId(null);
    setEditingProformaId(null);
    setChargeDraft(emptyChargeDraft());
    setProformaDraft(emptyProformaDraft());
    setVendorChargeDraft(emptyVendorChargeDraft());
    setKycSearchInput("");
    setBookingErrors([]);
    setActiveTab("awb");
    pushFormPage();
  };

  const closeForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setRatingSummary(null);
    setBookingErrors([]);
    setActiveTab("awb");
    setPiecesDraft(emptyPiecesDraft());
    setEditingPiecesId(null);
    setEditingProformaId(null);
    setChargeDraft(emptyChargeDraft());
    setProformaDraft(emptyProformaDraft());
    setVendorChargeDraft(emptyVendorChargeDraft());
    setLoadedClientProfile(null);
    setClientLoading(false);
    setVendorMeta({});
    setVendorOtpOpen(false);
    setVendorOtpError(null);
    setVendorBookingBusy(false);
    allowLeaveRef.current = true;
    if (view === "form") window.history.back();
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

  const finishLeavePrompt = async (mode: "continue" | "discard") => {
    if (mode === "continue") {
      setLeavePromptOpen(false);
      if (leaveSource === "nav") navBlocker.reset?.();
      return;
    }

    await clearDraftState();

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

  const fieldError = useCallback(
    (order: number) => {
      for (const message of bookingErrors) {
        const field = awbErrorField(message);
        if (field && AWB_ERROR_NAV[field] === order) return message;
      }
      return undefined;
    },
    [bookingErrors],
  );

  const reportSaveErrors = useCallback((messages: string[]) => {
    const list = messages.map((message) => message.trim()).filter(Boolean);
    setBookingErrors(list);
    if (list.length === 0) return;
    toast.error(list[0]);
    const orders = list
      .map((message) => {
        const field = awbErrorField(message);
        return field ? AWB_ERROR_NAV[field] : undefined;
      })
      .filter((order): order is number => order != null);
    if (orders.length === 0) return;
    setNavInvalidOrders((prev) => {
      const next = new Set(prev);
      for (const order of orders) next.add(order);
      return next;
    });
    const first = Math.min(...orders);

    let targetTab: AwbTab = "awb";
    if (first >= 900 && first < 1000) targetTab = "proforma";
    else if (first >= 1000 && first < 1100) targetTab = "forwarding";
    else if (first >= 1100 && first < 1200) targetTab = "kyc";
    else if (first >= 1200 && first < 1300) targetTab = "notification";
    else if (first >= 2000) targetTab = "proforma";

    if (activeTab !== targetTab) {
      setActiveTab(targetTab);
    }

    window.setTimeout(() => {
      const container = awbFormNavRef.current;
      if (container) focusErpFieldByOrder(container, first);
    }, 50);
  }, [activeTab]);

  const handleSave = async (): Promise<boolean> => {
    if (saveLockRef.current) return false;
    saveLockRef.current = true;
    setSaving(true);
    try {
      return await persistAwb();
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  const persistAwb = async (): Promise<boolean> => {
    if (isTerminalStatus) return toast.error("Cancelled shipments cannot be edited"), false;
    if (persistedLocked) {
      toast.error("This AWB is locked. An admin has to unlock it before it can be saved.");
      return false;
    }
    const saveErrors = [
      ...collectAwbProductionErrors(form, loadedClientProfile),
      ...consigneeBookingErrors({
        companyName: form.consignee.companyName.name || form.consignee.companyName.code,
        address1: form.consignee.address1,
        city: form.consignee.city,
        postcode: form.consignee.pincode,
        country: form.consignee.country || form.consignee.origin.name || form.consignee.origin.code,
        phone: form.consignee.mobileNo || form.consignee.telephone,
      }),
    ];
    if (form.piecesLines.length === 0) {
      const isInch = (piecesDraft.measurementUnit || "").toUpperCase().startsWith("INCH");
      const hasDims = Number(piecesDraft.length) > 0 || Number(piecesDraft.width) > 0 || Number(piecesDraft.height) > 0;
      if (isInch && hasDims) {
        const div = Number(piecesDraft.division);
        if (!div || div === 5000) {
          saveErrors.push("No inch volumetric divisor (e.g. 305 or 166) is configured for this customer or vendor. Configure an inch divisor or enter dimensions in cm.");
        }
      }
    }
    if (authed && loadedClientProfile && !loadedClientProfile.billingStateCode.trim()) {
      saveErrors.push("Customer billing state is required. Set it on the customer before saving this AWB.");
    }
    if (authed && branchStateQuery.isFetched && !branchStateQuery.data?.trim()) {
      saveErrors.push("Branch state is required before GST can be calculated. Set the branch state and try again.");
    }
    if (saveErrors.length > 0) {
      reportSaveErrors(saveErrors);
      return false;
    }

    const awbValidation = validateAwbEntry({
      paymentType: form.paymentType,
      documentType: form.shipper.documentType,
      documentNo: form.shipper.documentNo,
      shipperContactName: form.shipper.contactName,
      shipperTelephone: form.shipper.telephone,
      shipperMobile: form.shipper.mobileNo,
    });

    if (!awbValidation.valid) {
      reportSaveErrors([awbValidation.message || "AWB details are incomplete"]);
      return false;
    }

    if (!authed && !form.awbNo.trim()) return reportSaveErrors(["AWB No is required"]), false;
    if (!form.clientName.code.trim() && !form.clientName.name.trim())
      return reportSaveErrors(["Client Name is required"]), false;
    if (!isAwbLookupSelected(form.shipper.origin)) return reportSaveErrors(["Origin is required"]), false;
    if (!isAwbLookupSelected(form.shipper.companyName))
      return reportSaveErrors(["Shipper Company Name is required"]), false;
    if (
      !formSetupSettings.consigneeNotRequired &&
      !form.consignee.origin.name.trim() &&
      !form.consignee.origin.code.trim()
    ) {
      return reportSaveErrors(["Destination is required"]), false;
    }
    if (
      !formSetupSettings.consigneeNotRequired &&
      !isAwbLookupSelected(form.consignee.companyName)
    ) {
      return reportSaveErrors(["Consignee Company Name is required"]), false;
    }
    if (!form.product.code.trim()) return reportSaveErrors(["Product is required"]), false;
    if (!isAwbLookupSelected(form.service)) return reportSaveErrors(["Service is required"]), false;
    if (!formSetupSettings.airlineNotRequired && !form.airline.trim())
      return toast.error("Airline is required"), false;
    const payload = normalizeForm({
      ...form,
      awbNo: form.awbNo.trim(),
      deliveryNo: form.forwarding.deliveryAwb.trim(),
      forwardingNo: form.forwarding.forwardingAwb.trim(),
    });

    if (authed && !editing && branchStockQuery.data?.is_exhausted) {
      return toast.error("Branch AWB stock quota is exhausted (Balance: 0). Cannot save new shipments."), false;
    }
    if (authed && !editing && awbMode === "MANUAL") {
      if (!payload.awbNo.trim()) {
        return toast.error("Manual AWB mode requires entering an AWB Number"), false;
      }
      try {
        const check = await validateManualAwb({
          branchId: activeBranchId || profile?.home_branch_id || undefined,
          awbNo: payload.awbNo,
        });
        if (!check.valid) {
          return reportSaveErrors([check.message || "Manual AWB is invalid or outside allotted series"]), false;
        }
      } catch (err) {
        return toast.error(`AWB validation error: ${toErrorMessage(err)}`), false;
      }
    }

    if (authed) {
      setSaving(true);
      setBookingErrors([]);
      try {
        const vendorServiceError = await validateVendorServicePair(payload);
        if (vendorServiceError) {
          toast.error(vendorServiceError);
          return false;
        }

        let carrierDocsToPersist: Array<{ docType: string; label: string; contentB64: string; mimeType: string }> = [];

        // Trigger World-First AWB Booking API if vendor is World Freight Transportation
        if (isWorldFirstVendor(payload.vendor)) {
          const wfPayload = buildWfBookingPayload(payload as unknown as Record<string, unknown>);
          const validation = validateWfBookingRequest(wfPayload);
          if (!validation.valid) {
            const msg = `World-First Validation Error: ${validation.errors.join("; ")}`;
            toast.error(msg);
            setBookingErrors(validation.errors);
            return false;
          }

          const wfResult = await callWorldFirstBookingApi(wfPayload);
          if (wfResult.apiStatus === "CARRIER_BOOKING_DISABLED") {
            toast.warning(
              wfResult.message ||
              "Carrier booking is temporarily disabled. The shipment will be saved without a carrier AWB.",
            );
          } else if (!wfResult.success) {
            const err = wfResult.message || wfResult.apiError || "World-First AWB Booking Failed";
            toast.error(`World-First API Error: ${err}`);
            console.error("World-First AWB Booking Failed:", wfResult);
            setBookingErrors([err]);
            return false; // Abort save if World-First booking fails
          }

          if (wfResult.awbNo) {
            payload.forwarding.forwardingAwb = wfResult.awbNo;
            payload.forwardingNo = wfResult.awbNo;
          }
          if (wfResult.documents?.length) {
            carrierDocsToPersist = wfResult.documents;
          }
          toast.success(`World-First AWB Booking Successful! (Ref: ${wfResult.awbNo || wfResult.refNo})`);
        } else if (isUpsVendor(payload.vendor)) {
          // Trigger UPS AWB Booking API if vendor is UPS
          const upsPayload = buildUpsBookingPayload(payload as unknown as Record<string, unknown>, {
            serviceName: payload.service.name || payload.service.code || "WORLDWIDE EXPRESS SAVER",
          });
          const validation = validateWfBookingRequest(upsPayload);
          if (!validation.valid) {
            const msg = `UPS Validation Error: ${validation.errors.join("; ")}`;
            toast.error(msg);
            setBookingErrors(validation.errors);
            return false;
          }

          const upsResult = await callWorldFirstBookingApi(upsPayload, getUpsClientConfig());
          if (upsResult.apiStatus === "CARRIER_BOOKING_DISABLED") {
            toast.warning(
              upsResult.message ||
              "Carrier booking is temporarily disabled. The shipment will be saved without a carrier AWB.",
            );
          } else if (!upsResult.success) {
            const err = upsResult.message || upsResult.apiError || "UPS AWB Booking Failed";
            toast.error(`UPS API Error: ${err}`);
            console.error("UPS AWB Booking Failed:", upsResult);
            setBookingErrors([err]);
            return false; // Abort save if UPS booking fails
          }

          if (upsResult.awbNo) {
            payload.forwarding.forwardingAwb = upsResult.awbNo;
            payload.forwardingNo = upsResult.awbNo;
          }
          if (upsResult.documents?.length) {
            carrierDocsToPersist = upsResult.documents;
          }
          toast.success(`UPS AWB Booking Successful! (AWB: ${upsResult.awbNo || upsResult.refNo})`);
        }
        const { fields, pieces, charges } = uiFormToShipmentPayload(
          {
            ...payload,
            pickupId: editing?.pickupId ?? payload.pickupId,
          },
          {
            manualAwbNo: awbMode === "MANUAL" ? payload.awbNo : null,
            branchId: activeBranchId || profile?.home_branch_id,
          },
        );
        const saved = await bookAwbShipment({
          id: editing?.id ?? null,
          rowVersion: editing?.rowVersion ?? null,
          fields,
          pieces,
          charges,
        });
        const fresh = (await getShipmentById(saved.id)) ?? saved;
        const children = await fetchShipmentChildren(saved.id);
        for (const doc of payload.kyc.documents) {
          if (!doc.contentB64 || doc.uploaded) continue;
          try {
            await saveShipmentDocument({
              shipmentId: saved.id,
              documentType: "KYC",
              source: "USER_UPLOAD",
              fileName: doc.fileName,
              contentB64: doc.contentB64,
              mimeType: doc.mimeType || "application/octet-stream",
              status: "AVAILABLE",
            });
          } catch (kycError) {
            toast.warning(toErrorMessage(kycError, "KYC file could not be stored"));
          }
        }
        if (carrierDocsToPersist.length > 0) {
          for (const doc of carrierDocsToPersist) {
            try {
              const vType = doc.docType === "INVOICE" ? "VENDOR_INVOICE" : "VENDOR_AWB";
              const cType = doc.docType === "INVOICE" ? "INVOICE" : "AWB_LABEL";
              await saveShipmentDocument({
                shipmentId: saved.id,
                documentType: vType as any,
                source: "VENDOR",
                vendor: payload.vendor.code || payload.vendor.name || "UPS",
                fileName: `${payload.vendor.code || "UPS"}_${doc.docType}_${saved.awb_no}.pdf`,
                contentB64: doc.contentB64,
                mimeType: doc.mimeType || "application/pdf",
                status: "AVAILABLE",
                rawMeta: { awbNo: saved.awb_no, forwardingAwb: payload.forwardingNo },
              });
              await saveShipmentDocument({
                shipmentId: saved.id,
                documentType: cType as any,
                source: "VENDOR",
                vendor: payload.vendor.code || payload.vendor.name || "UPS",
                fileName: `${payload.vendor.code || "UPS"}_${cType}_${saved.awb_no}.pdf`,
                contentB64: doc.contentB64,
                mimeType: doc.mimeType || "application/pdf",
                status: "AVAILABLE",
                rawMeta: { awbNo: saved.awb_no, forwardingAwb: payload.forwardingNo },
              });
            } catch (e) {
              console.warn("Could not save carrier document:", e);
            }
          }
        }
        await rememberPartiesAfterAwbSave({
          shipper: payload.shipper,
          consignee: payload.consignee,
        });
        await refreshLive();
        // Keep form open in saved/edit mode so the document-button row can appear.
        const allocatedAwb = fresh.awb_no || saved.awb_no || payload.awbNo;
        const money = (value: number | null | undefined) => (Number(value) || 0).toFixed(2);
        const weightText = (value: number | null | undefined) => (Number(value) || 0).toFixed(3);
        const customerLines = children.charges.filter((line) => line.side !== "VENDOR");
        const vendorLines = children.charges.filter((line) => line.side === "VENDOR");
        const gstOf = (key: "igst" | "cgst" | "sgst") =>
          customerLines.reduce((sum, line) => sum + (Number(line[key]) || 0), 0);
        const freightLine = customerLines.find((line) => /freight/i.test(line.description));
        const otherLines = customerLines.filter((line) => line !== freightLine);
        const otherAmount = otherLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
        const fuelAmount = customerLines.reduce((sum, line) => sum + (Number(line.fuel_amount) || 0), 0);
        const payable = Number(fresh.grand_total ?? fresh.customer_charges_total) || 0;
        const lockDisplay = await lockDisplayFor(fresh);
        setEditing((prev) => ({
          ...(prev ?? ({ ...payload, id: fresh.id } as AwbRow)),
          id: fresh.id,
          rowVersion: fresh.row_version,
          status: fresh.current_status || "BOOKED",
          awbNo: allocatedAwb,
          lockedByName: lockDisplay.lockedByName,
          lockedAt: lockDisplay.lockedAt,
          serverLocked: Boolean(fresh.is_locked),
        }));
        setRatingSummary({
          freight: money(freightLine?.amount),
          fuel: money(fuelAmount),
          tax: money(gstOf("igst") + gstOf("cgst") + gstOf("sgst")),
          otherCharges: money(otherAmount),
          vendorCost: money(fresh.vendor_charges_total),
          total: money(payable),
          contractCharges: money(freightLine?.amount),
          subTotal: money((Number(freightLine?.amount) || 0) + otherAmount),
          totalFuel: money(fuelAmount),
          igst: money(gstOf("igst")),
          cgst: money(gstOf("cgst")),
          sgst: money(gstOf("sgst")),
          totalAmount: money(payable),
        });
        setForm((f) => ({
          ...f,
          awbNo: allocatedAwb,
          lock: Boolean(fresh.is_locked),
          pieces: String(fresh.pieces ?? f.pieces),
          piecesUnit: fresh.pieces_unit || f.piecesUnit,
          actualWeight: weightText(fresh.actual_weight),
          volWeight: weightText(fresh.vol_weight),
          chargeWeight: weightText(fresh.charge_weight),
          customerChargesTotal: money(payable),
          vendorChargesTotal: money(fresh.vendor_charges_total),
          balanceAmount: fresh.balance_amount == null ? f.balanceAmount : money(fresh.balance_amount),
          piecesLines: children.pieces.map((piece, index) => ({
            id: `pc-${piece.seq || index}`,
            childAwb: piece.child_awb || (allocatedAwb ? `${allocatedAwb}-${piece.seq || index + 1}` : ""),
            actualWeightPerPc: weightText(piece.actual_weight_per_pc),
            pieces: String(piece.pieces ?? ""),
            length: piece.length == null ? "" : String(piece.length),
            breadth: piece.breadth == null ? "" : String(piece.breadth),
            height: piece.height == null ? "" : String(piece.height),
            volWeight: weightText(piece.vol_weight),
            chargeWeight: weightText(piece.charge_weight),
            division: piece.divisor == null ? "" : String(piece.divisor),
            measurementUnit: piece.measurement_unit || "Centimeter",
          })),
          chargeLines: customerLines.map((line, index) => ({
            id: `ch-${line.seq || index}`,
            description: line.description,
            rate: money(line.rate),
            amount: money(line.amount),
            fuelApply: line.fuel_applies ? "Yes" : "No",
            fuelAmt: money(line.fuel_amount),
            taxApply: line.tax_applies ? "Yes" : "No",
            taxOnFuel: line.tax_on_fuel ? "Yes" : "No",
            igst: money(line.igst),
            sgst: money(line.sgst),
            cgst: money(line.cgst),
            total: money(line.total),
            chargesType: line.charges_type || "SYSTEM",
          })),
          forwarding: {
            ...f.forwarding,
            vendorAmount: money(fresh.vendor_charges_total),
            vendorChargeLines: vendorLines.map((line, index) => ({
              id: `vch-${line.seq || index}`,
              description: line.description,
              rate: money(line.rate),
              amount: money(line.amount),
              fuelApply: line.fuel_applies ? "Yes" : "No",
              fuelAmt: money(line.fuel_amount),
              taxApply: line.tax_applies ? "Yes" : "No",
              taxOnFuel: line.tax_on_fuel ? "Yes" : "No",
              igst: money(line.igst),
              sgst: money(line.sgst),
              cgst: money(line.cgst),
              total: money(line.total),
              chargesType: line.charges_type || "SYSTEM",
            })),
          },
          kyc: {
            documents: f.kyc.documents.map((doc) => ({ ...doc, contentB64: undefined, uploaded: true })),
          },
        }));
        setLastSavedForm({ ...payload, awbNo: allocatedAwb });
        setVendorPanelKey((k) => k + 1);
        allowLeaveRef.current = true;
        await clearDraftState();
        void awbStatusQuery.refetch();
        void branchStockQuery.refetch();
        toast.success(`AWB ${allocatedAwb} booked`);
        await notifySavedAwb({ ...payload, awbNo: allocatedAwb });
        return true;
      } catch (e) {
        const message = toErrorMessage(e);
        const jsonMatch = message.match(/Booking validation failed:\s*(\[.+\])/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            const serverMsgs = parsed.map((item: { message?: string }) => item.message).filter(Boolean);
            if (serverMsgs.length > 0) {
              reportSaveErrors(serverMsgs);
              return false;
            }
          } catch {
            // fall through
          }
        }
        toast.error(message);
        if (message.includes(";")) setWeightErrorModal({ open: true, message: message.replaceAll("; ", "\n") });
        return false;
      }
    }

    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...payload, id: editing.id, rowVersion: r.rowVersion, status: r.status ?? "DRAFT" }
            : r,
        ),
      );
      setEditing((prev) =>
        prev
          ? { ...payload, id: prev.id, rowVersion: prev.rowVersion, status: prev.status ?? "DRAFT" }
          : prev,
      );
      toast.success("AWB entry updated");
      await notifySavedAwb(payload);
    } else {
      if (demoRows.some((r) => r.awbNo === payload.awbNo))
        return toast.error("AWB No already exists"), false;
      const id = crypto.randomUUID();
      const row: AwbRow = { id, status: "DRAFT", ...payload };
      setDemoRows((prev) => [row, ...prev]);
      setEditing(row);
      toast.success("AWB entry saved");
      await notifySavedAwb(payload);
    }
    setLastSavedForm(payload);
    setVendorPanelKey((k) => k + 1);
    allowLeaveRef.current = true;
    await clearDraftState();
    return true;
  };

  const collectClientBookingErrors = (): string[] => {
    const errors: string[] = [];
    if (authed && !editing && branchStockQuery.data?.is_exhausted) {
      errors.push("Branch AWB stock quota is exhausted (Balance: 0)");
    }
    if (awbMode === "MANUAL" && !editing && !form.awbNo.trim()) {
      errors.push("Manual AWB mode requires entering an AWB Number");
    }
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

    // Production & Compliance checks
    errors.push(...collectAwbProductionErrors(form, loadedClientProfile));
    if (form.piecesLines.length === 0) {
      const isInch = (piecesDraft.measurementUnit || "").toUpperCase().startsWith("INCH");
      const hasDims = Number(piecesDraft.length) > 0 || Number(piecesDraft.width) > 0 || Number(piecesDraft.height) > 0;
      if (isInch && hasDims) {
        const div = Number(piecesDraft.division);
        if (!div || div === 5000) {
          errors.push("No inch volumetric divisor (e.g. 305 or 166) is configured for this customer or vendor. Configure an inch divisor or enter dimensions in cm.");
        }
      }
    }

    const shipperDocErrors = validatePartyIdNumbers(form.shipper, "Shipper");
    const consigneeDocErrors = validatePartyIdNumbers(form.consignee, "Consignee");
    errors.push(...shipperDocErrors);
    errors.push(...consigneeDocErrors);

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
        if (awbMode === "MANUAL" && payload.awbNo.trim()) {
          const manualCheck = await validateManualAwb({
            branchId: activeBranchId || profile?.home_branch_id || undefined,
            awbNo: payload.awbNo,
          });
          if (!manualCheck.valid) {
            setBookingErrors([manualCheck.message || "Manual AWB number is invalid"]);
            toast.error(manualCheck.message || "Manual AWB number is invalid");
            return;
          }
        }

        const vendorServiceError = await validateVendorServicePair(payload);
        if (vendorServiceError) {
          setBookingErrors([vendorServiceError]);
          toast.error(vendorServiceError);
          return;
        }

        let carrierDocsToPersist: Array<{ docType: string; label: string; contentB64: string; mimeType: string }> = [];

        // Trigger World-First AWB Booking API if vendor is World Freight Transportation
        if (isWorldFirstVendor(payload.vendor)) {
          const wfPayload = buildWfBookingPayload(payload as unknown as Record<string, unknown>);
          const validation = validateWfBookingRequest(wfPayload);
          if (!validation.valid) {
            const msg = `World-First Validation Error: ${validation.errors.join("; ")}`;
            toast.error(msg);
            setBookingErrors(validation.errors);
            return;
          }

          const wfResult = await callWorldFirstBookingApi(wfPayload);
          if (wfResult.apiStatus === "CARRIER_BOOKING_DISABLED") {
            toast.warning(
              wfResult.message ||
              "Carrier booking is temporarily disabled. The shipment will be saved without a carrier AWB.",
            );
          } else if (!wfResult.success) {
            const err = wfResult.message || wfResult.apiError || "World-First AWB Booking Failed";
            toast.error(`World-First API Error: ${err}`);
            console.error("World-First AWB Booking Failed:", wfResult);
            setBookingErrors([err]);
            return; // Abort booking if World-First booking fails
          }

          if (wfResult.awbNo) {
            payload.forwarding.forwardingAwb = wfResult.awbNo;
            payload.forwardingNo = wfResult.awbNo;
          }
          if (wfResult.documents?.length) {
            carrierDocsToPersist = wfResult.documents;
          }
          toast.success(`World-First AWB Booking Successful! (Ref: ${wfResult.awbNo || wfResult.refNo})`);
        } else if (isUpsVendor(payload.vendor)) {
          // Trigger UPS AWB Booking API if vendor is UPS
          const upsPayload = buildUpsBookingPayload(payload as unknown as Record<string, unknown>, {
            serviceName: payload.service.name || payload.service.code || "WORLDWIDE EXPRESS SAVER",
          });
          const validation = validateWfBookingRequest(upsPayload);
          if (!validation.valid) {
            const msg = `UPS Validation Error: ${validation.errors.join("; ")}`;
            toast.error(msg);
            setBookingErrors(validation.errors);
            return;
          }

          const upsResult = await callWorldFirstBookingApi(upsPayload, getUpsClientConfig());
          if (upsResult.apiStatus === "CARRIER_BOOKING_DISABLED") {
            toast.warning(
              upsResult.message ||
              "Carrier booking is temporarily disabled. The shipment will be saved without a carrier AWB.",
            );
          } else if (!upsResult.success) {
            const err = upsResult.message || upsResult.apiError || "UPS AWB Booking Failed";
            toast.error(`UPS API Error: ${err}`);
            console.error("UPS AWB Booking Failed:", upsResult);
            setBookingErrors([err]);
            return; // Abort booking if UPS booking fails
          }

          if (upsResult.awbNo) {
            payload.forwarding.forwardingAwb = upsResult.awbNo;
            payload.forwardingNo = upsResult.awbNo;
          }
          if (upsResult.documents?.length) {
            carrierDocsToPersist = upsResult.documents;
          }
          toast.success(`UPS AWB Booking Successful! (AWB: ${upsResult.awbNo || upsResult.refNo})`);
        }
        const { fields, pieces, charges } = uiFormToShipmentPayload(
          {
            ...payload,
            pickupId: editing?.pickupId ?? payload.pickupId,
          },
          {
            manualAwbNo: awbMode === "MANUAL" ? payload.awbNo : null,
            branchId: activeBranchId || profile?.home_branch_id,
          },
        );
        const booked = await bookAwbShipment({
          id: editing?.id ?? null,
          rowVersion: editing?.rowVersion ?? null,
          fields,
          pieces,
          charges,
        });
        if (carrierDocsToPersist.length > 0) {
          for (const doc of carrierDocsToPersist) {
            try {
              const vType = doc.docType === "INVOICE" ? "VENDOR_INVOICE" : "VENDOR_AWB";
              const cType = doc.docType === "INVOICE" ? "INVOICE" : "AWB_LABEL";
              await saveShipmentDocument({
                shipmentId: booked.id,
                documentType: vType as any,
                source: "VENDOR",
                vendor: payload.vendor.code || payload.vendor.name || "UPS",
                fileName: `${payload.vendor.code || "UPS"}_${doc.docType}_${booked.awb_no}.pdf`,
                contentB64: doc.contentB64,
                mimeType: doc.mimeType || "application/pdf",
                status: "AVAILABLE",
                rawMeta: { awbNo: booked.awb_no, forwardingAwb: payload.forwardingNo },
              });
              await saveShipmentDocument({
                shipmentId: booked.id,
                documentType: cType as any,
                source: "VENDOR",
                vendor: payload.vendor.code || payload.vendor.name || "UPS",
                fileName: `${payload.vendor.code || "UPS"}_${cType}_${booked.awb_no}.pdf`,
                contentB64: doc.contentB64,
                mimeType: doc.mimeType || "application/pdf",
                status: "AVAILABLE",
                rawMeta: { awbNo: booked.awb_no, forwardingAwb: payload.forwardingNo },
              });
            } catch (e) {
              console.warn("Could not save carrier document:", e);
            }
          }
        }
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

        const lockDisplay = await lockDisplayFor(booked);
        setEditing((prev) => ({
          ...(prev ?? ({ ...payload, id: booked.id } as AwbRow)),
          id: booked.id,
          rowVersion: booked.row_version,
          status: booked.current_status ?? "BOOKED",
          awbNo: booked.awb_no || payload.awbNo,
          lockedByName: lockDisplay.lockedByName,
          lockedAt: lockDisplay.lockedAt,
          serverLocked: Boolean(booked.is_locked),
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
            setVendorLastResult(outcome.result);
            setVendorPanelKey((k) => k + 1);
            if (outcome.result.status === "OTP_REQUIRED") {
              const mobile =
                outcome.result.shipperMobileMasked ||
                (form.shipper.mobileNo.trim() || form.shipper.telephone.trim()
                  ? maskMobile(form.shipper.mobileNo.trim() || form.shipper.telephone.trim())
                  : null);
              setVendorOtpMobile(mobile);
              setVendorSandboxOtp(null);
              setVendorOtpError(null);
              setVendorOtpOpen(true);
              toast.message("OTP sent to the shipper mobile. Enter the code they received.");
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
      setVendorLastResult(outcome.result);
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
      setVendorLastResult(outcome.result);
      setVendorPanelKey((k) => k + 1);
      if (outcome.result.status === "OTP_REQUIRED") {
        const mobile =
          outcome.result.shipperMobileMasked ||
          (form.shipper.mobileNo.trim() || form.shipper.telephone.trim()
            ? maskMobile(form.shipper.mobileNo.trim() || form.shipper.telephone.trim())
            : null);
        setVendorOtpMobile(mobile);
        setVendorSandboxOtp(null);
        setVendorOtpError(null);
        setVendorOtpOpen(true);
        toast.message("OTP sent to the shipper mobile. Enter the code they received.");
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

  const downloadMtsTemplate = () => {
    void downloadAwbMtsTemplate()
      .then(() => toast.success("AWBMtsFormat.xlsx downloaded"))
      .catch((error) => toast.error(toErrorMessage(error, "Could not download the MTS template")));
  };

  const uploadMtsFile = async () => {
    const file = mtsFileRef.current?.files?.[0];
    if (!file) {
      toast.error("Select an Excel or CSV file");
      return;
    }
    if (!mtsFileAccepted(file.name)) {
      toast.error("Use an Excel (.xlsx, .xls) or CSV file");
      return;
    }
    try {
      const parsed = await parseTabularFile(file);
      const inchDivisor = Number.parseFloat(
        resolveDivision({
          measurementUnit: "Inch",
          productCode: form.product.code,
          productName: form.product.name,
          vendorCode: form.vendor.code,
          vendorName: form.vendor.name,
          serviceCode: form.service.code,
          serviceName: form.service.name,
          rows: volumetricRows,
        }),
      );
      const { lines, errors } = mtsPiecesFromRows(parsed.rows, {
        inchDivisor: inchDivisor > 0 && inchDivisor !== 5000 ? inchDivisor : undefined,
      });
      if (lines.length === 0) {
        toast.error(errors[0] ?? "No piece rows found in the file");
        return;
      }
      setForm((current) => ({ ...current, piecesLines: [...current.piecesLines, ...lines] }));
      if (mtsFileRef.current) mtsFileRef.current.value = "";
      if (errors.length > 0) {
        toast.warning(`Added ${lines.length} piece row${lines.length === 1 ? "" : "s"}. ${errors[0]}`);
        return;
      }
      toast.success(`Added ${lines.length} piece row${lines.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(toErrorMessage(error, "Could not read the MTS file"));
    }
  };

  const addPiecesLine = () => {
    if (!piecesDraft.noOfPieces.trim()) return toast.error("No. Of Pieces is required");
    const isInch = (piecesDraft.measurementUnit || "").toUpperCase().startsWith("INCH");
    const hasDims = Number(piecesDraft.length) > 0 || Number(piecesDraft.width) > 0 || Number(piecesDraft.height) > 0;
    if (isInch && hasDims) {
      const div = Number(piecesDraft.division);
      if (!div || div === 5000) {
        return toast.error("No inch volumetric divisor (e.g. 305 or 166) is configured for this customer or vendor. Configure an inch divisor or enter dimensions in cm.");
      }
    }
    const editedId = editingPiecesId;
    const updating = editedId != null && form.piecesLines.some((line) => line.id === editedId);
    setForm((f) => {
      if (updating && editedId) {
        return {
          ...f,
          piecesLines: f.piecesLines.map((line) =>
            line.id === editedId
              ? {
                ...line,
                actualWeightPerPc: piecesDraft.actualWeightPerPc,
                pieces: piecesDraft.noOfPieces,
                length: piecesDraft.length,
                breadth: piecesDraft.width,
                height: piecesDraft.height,
                volWeight: piecesDraft.volWeight,
                chargeWeight: piecesDraft.chargeWeight,
                division: piecesDraft.division,
                measurementUnit: piecesDraft.measurementUnit,
              }
              : line,
          ),
        };
      }
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
        division: piecesDraft.division,
        measurementUnit: piecesDraft.measurementUnit,
      };
      return { ...f, piecesLines: [...f.piecesLines, line] };
    });
    setEditingPiecesId(null);
    setPiecesDraft(emptyPiecesDraft());
    toast.success(updating ? "Piece line updated" : "Piece line added");
  };

  const editPiecesLine = (line: PiecesLine) => {
    const next: PiecesDraft = {
      measurementUnit: line.measurementUnit || piecesDraft.measurementUnit,
      actualWeightPerPc: line.actualWeightPerPc,
      noOfPieces: line.pieces,
      length: line.length,
      width: line.breadth,
      height: line.height,
      division: line.division || piecesDraft.division,
      volWeight: line.volWeight,
      chargeWeight: line.chargeWeight,
    };
    setPiecesDraft(next);
    setEditingPiecesId(line.id);
  };

  const commitPiecesLine = () => {
    if (!piecesDraft.noOfPieces.trim()) {
      toast.error("No. Of Pieces is required");
      return;
    }
    addPiecesLine();
    scheduleErpFocusAdvance(() => {
      const container = awbFormNavRef.current;
      if (container) focusErpFieldByOrder(container, AWB_NAV.PIECES_ACTUAL_WEIGHT_PCS);
    });
  };

  const removePiecesLine = (id: string) => {
    setForm((f) => ({ ...f, piecesLines: f.piecesLines.filter((l) => l.id !== id) }));
    if (editingPiecesId === id) {
      setEditingPiecesId(null);
      setPiecesDraft(emptyPiecesDraft());
    }
  };

  const priceChargeDraft = (draft: ChargeDraft) => {
    const applyFuel = draft.itemFuel === "Yes";
    const applyTaxOnFuel = draft.taxOnFuel === "Yes";
    const applyTax = draft.tax === "Yes";
    return manualChargeAmounts({
      itemAmount: Number.parseFloat(draft.itemAmount) || 0,
      applyFuel,
      applyTaxOnFuel,
      applyTax,
      fuelPct: fuelPercentFor({
        rows: fuelRows,
        vendorCode: form.vendor.code,
        vendorName: form.vendor.name,
        productCode: form.product.code,
        productName: form.product.name,
        destinationCode: form.consignee.origin.code,
        destinationName: form.consignee.origin.name,
        bookDate: form.bookDate,
      }),
      gstPct: awbGstPercent({ gstPercent: Number(taxRateQuery.data?.igst_pct ?? 18) }),
      intraState: awbIntraState(
        loadedClientProfile?.billingStateCode || "",
        branchStateQuery.data || "",
      ),
    });
  };

  const addChargeLine = () => {
    if (!chargeDraft.description) return toast.error("Description is required");
    if (!chargeDraft.itemAmount.trim()) return toast.error("Item Amount is required");
    const amount = chargeDraft.itemAmount;
    const priced = priceChargeDraft(chargeDraft);
    const line: ChargeLine = {
      id: crypto.randomUUID(),
      description: chargeDraft.description,
      rate: amount,
      amount,
      fuelApply: chargeDraft.itemFuel,
      fuelAmt: priced.fuelAmt,
      taxApply: chargeDraft.tax,
      taxOnFuel: chargeDraft.taxOnFuel,
      igst: priced.igst,
      sgst: priced.sgst,
      cgst: priced.cgst,
      total: priced.total,
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

  const addProformaLine = (): boolean => {
    const checked = validateProformaEntry({
      boxNo: proformaDraft.boxNo,
      packages: proformaDraft.packages,
      description: proformaDraft.description,
      hsnCode: proformaDraft.hsnCode,
      quantity: proformaDraft.quantity,
      weight: proformaDraft.weight,
      unit: proformaDraft.unit,
      rate: proformaDraft.rate,
      igstPercent: proformaDraft.igstPercent,
      units: proformaUnits,
      maxPiecesCount: Number.parseInt(form.pieces, 10) || form.piecesLines.length || 1,
    });
    if (!checked.line) {
      toast.error(checked.errors[0]?.message ?? "Proforma line is not valid");
      return false;
    }
    if (editingProformaId) {
      const lineId = editingProformaId;
      const updatedLine: ProformaLine = { ...checked.line, id: lineId, source: "Manual" };
      setForm((f) => {
        const lines = f.proforma.lines.map((l) => (l.id === lineId ? updatedLine : l));
        warnProformaInvoice(lines, f.shipmentValue, f.shipmentCurrency, f.proforma.currency);
        return { ...f, proforma: { ...f.proforma, lines } };
      });
      setEditingProformaId(null);
      setProformaDraft(emptyProformaDraft());
      toast.success("Proforma line updated");
      return true;
    }
    const line: ProformaLine = { ...checked.line, id: crypto.randomUUID(), source: "Manual" };
    setForm((f) => {
      const lines = [...f.proforma.lines, line];
      warnProformaInvoice(lines, f.shipmentValue, f.shipmentCurrency, f.proforma.currency);
      return { ...f, proforma: { ...f.proforma, lines } };
    });
    setProformaDraft(emptyProformaDraft());
    toast.success("Proforma line added");
    return true;
  };

  const commitProformaLine = () => {
    if (!addProformaLine()) return;
    scheduleErpFocusAdvance(() => {
      const container = awbFormNavRef.current;
      if (container) focusErpFieldByOrder(container, AWB_NAV.PROFORMA_BOX_NO);
    });
  };

  const removeProformaLine = (id: string) => {
    setForm((f) => ({
      ...f,
      proforma: { ...f.proforma, lines: f.proforma.lines.filter((l) => l.id !== id) },
    }));
    if (editingProformaId === id) {
      setEditingProformaId(null);
      setProformaDraft(emptyProformaDraft());
    }
  };

  const warnProformaInvoice = (
    lines: ProformaLine[],
    shipmentValue: string,
    shipmentCurrency: string,
    proformaCurrency: string,
  ) => {
    if (shipmentCurrency.trim().toUpperCase() !== proformaCurrency.trim().toUpperCase()) return;
    const invoice = Number.parseFloat(shipmentValue);
    if (!Number.isFinite(invoice) || invoice <= 0) return;
    const amount = lines.reduce((sum, line) => sum + (Number.parseFloat(line.amount) || 0), 0);
    if (Math.abs(amount - invoice) > 0.009) {
      toast.warning(
        `Proforma amount ${amount.toFixed(2)} does not match Shipment Value ${invoice.toFixed(2)}`,
      );
    }
  };

  const placeImportedProforma = (incoming: ProformaLine[]) => {
    if (form.proforma.lines.length > 0) {
      setProformaImportPending(incoming);
      return;
    }
    setForm((current) => {
      warnProformaInvoice(
        incoming,
        current.shipmentValue,
        current.shipmentCurrency,
        current.proforma.currency,
      );
      return { ...current, proforma: { ...current.proforma, lines: incoming } };
    });
    toast.success(`${incoming.length} proforma line${incoming.length === 1 ? "" : "s"} imported`);
  };

  const applyImportedProforma = (mode: "append" | "replace", incoming: ProformaLine[]) => {
    const lines = mode === "replace" ? incoming : [...form.proforma.lines, ...incoming];
    setForm((current) => ({
      ...current,
      proforma: {
        ...current.proforma,
        lines: mode === "replace" ? incoming : [...current.proforma.lines, ...incoming],
      },
    }));
    warnProformaInvoice(lines, form.shipmentValue, form.shipmentCurrency, form.proforma.currency);
    toast.success(`${incoming.length} proforma line${incoming.length === 1 ? "" : "s"} imported`);
    setProformaImportPending(null);
  };

  const uploadProformaFile = async () => {
    if (entryLocked) {
      toast.error("This AWB is locked and cannot be changed");
      return;
    }
    if (proformaUploading) return;
    const file = proformaFileRef.current?.files?.[0];
    if (!file) {
      toast.error("Please select a file");
      return;
    }
    const name = file.name.toLowerCase();
    const mime = file.type.toLowerCase();
    const mimeOk =
      mime === "" ||
      mime === "application/octet-stream" ||
      mime.includes("excel") ||
      mime.includes("spreadsheet");
    if ((!name.endsWith(".xls") && !name.endsWith(".xlsx")) || !mimeOk) {
      toast.error("Only .xls and .xlsx files can be imported");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be 5 MB or smaller");
      return;
    }
    setProformaUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("currency", form.proforma.currency);
      body.set("awbNo", form.awbNo);
      body.set("units", proformaUnits.join(","));
      const { authorizedFetch } = await import("@/lib/security/authorized-fetch");
      const res = await authorizedFetch("/api/awb-entry/proforma-import", { method: "POST", body });
      const data = (await res.json()) as {
        rows?: ProformaLine[];
        lines?: ProformaLine[];
        warnings?: string[];
        errors?: ProformaImportError[];
      };
      if (!res.ok || data.errors?.length) {
        setProformaImportErrors(
          data.errors?.length
            ? data.errors
            : [{ row: 0, column: "File", value: "", message: "Proforma import failed" }],
        );
        return;
      }
      const lines = (data.rows ?? data.lines ?? []).map((line) => ({ ...line, source: "Import" as const }));
      if (lines.length === 0) {
        toast.error("The file has no proforma rows");
        return;
      }
      if (proformaFileRef.current) proformaFileRef.current.value = "";
      if (data.warnings?.length) {
        setProformaPreview({ lines, warnings: data.warnings });
        return;
      }
      placeImportedProforma(lines);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setProformaUploading(false);
    }
  };

  const ensureVendorChargePrerequisites = useCallback((): boolean => {
    const errors = getVendorChargePrerequisiteErrors(form, {
      consigneeNotRequired: formSetupSettings.consigneeNotRequired,
    });
    if (errors.length === 0) return true;
    setVendorChargePrereqErrors(errors);
    return false;
  }, [form, formSetupSettings.consigneeNotRequired]);

  const addVendorChargeLine = () => {
    if (!ensureVendorChargePrerequisites()) return;
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
      igst: vendorChargeDraft.igst || "0.00",
      sgst: vendorChargeDraft.sgst || "0.00",
      cgst: vendorChargeDraft.cgst || "0.00",
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
      const calc = priceVendorChargeDraft(next);
      const fuelVal = Number.parseFloat(calc.fuelAmt) || 0;
      next.fuelAmt = calc.fuelAmt;
      next.taxOnFuelAmt =
        next.taxOnFuel === "Yes" && fuelVal > 0 && vendorGstPct > 0
          ? ((fuelVal * vendorGstPct) / 100).toFixed(2)
          : "0.00";
      const taxTotal =
        (Number.parseFloat(calc.igst) || 0) +
        (Number.parseFloat(calc.cgst) || 0) +
        (Number.parseFloat(calc.sgst) || 0);
      next.taxAmt = taxTotal.toFixed(2);
      next.igst = calc.igst;
      next.cgst = calc.cgst;
      next.sgst = calc.sgst;
      next.total = calc.total;
      return next;
    });
  };

  const withStoredKyc = async (shipmentId: string, source: AwbFullForm): Promise<AwbFullForm> => {
    const stored = await getShipmentDocument(shipmentId, "KYC").catch(() => null);
    if (!stored?.contentB64) return source;
    const docs = source.kyc.documents;
    const match = docs.find((doc) => doc.fileName === stored.fileName) ?? docs[0];
    const hydrated: KycDocument = {
      id: match?.id || stored.id || crypto.randomUUID(),
      fileName: stored.fileName || match?.fileName || "kyc",
      entryType: match?.entryType || "KYC",
      entryDate: match?.entryDate || "",
      contentB64: stored.contentB64,
      mimeType: stored.mimeType || match?.mimeType || "application/octet-stream",
      uploaded: true,
    };
    const documents =
      docs.length === 0
        ? [hydrated]
        : docs.map((doc) =>
          doc.id === hydrated.id || doc.fileName === hydrated.fileName
            ? {
              ...doc,
              contentB64: stored.contentB64 || undefined,
              mimeType: stored.mimeType || doc.mimeType,
              uploaded: true,
            }
            : doc,
        );
    return { ...source, kyc: { documents } };
  };

  const downloadKycDocument = (doc: KycDocument) => {
    if (!doc.contentB64) {
      toast.error("This KYC file is not stored on the shipment");
      return;
    }
    const href = documentObjectUrl({
      id: doc.id,
      type: "KYC",
      title: "KYC",
      status: "AVAILABLE",
      available: true,
      contentB64: doc.contentB64,
      mimeType: doc.mimeType,
      fileName: doc.fileName,
    });
    if (!href) {
      toast.error("This KYC file could not be opened");
      return;
    }
    const link = document.createElement("a");
    link.href = href;
    link.download = doc.fileName || "kyc";
    link.click();
    window.setTimeout(() => revokeDocumentObjectUrl(href), 1500);
  };

  const addKycDocument = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const doc: KycDocument = {
      id: crypto.randomUUID(),
      fileName: file.name,
      entryType: kycDocType,
      entryDate: formatDisplayDate(todayIso()),
      contentB64: btoa(binary),
      mimeType: file.type || "application/octet-stream",
      uploaded: false,
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

  const handleClientNameDraft = (v: LookupPair) => {
    const cleared = !v.id && !v.code.trim() && !v.name.trim();
    if (cleared) {
      clientLoadSeqRef.current += 1;
      setLoadedClientProfile(null);
      setClientLoading(false);
      setForm((f) => ({ ...f, clientName: emptyPair(), paymentType: "" }));
      return;
    }
    setForm((f) => ({ ...f, clientName: v }));
  };

  const handleClientSelect = async (v: LookupPair) => {
    setForm((f) => ({
      ...f,
      clientName: v,
      shipper: {
        ...f.shipper,
        companyName: {
          id: v.id,
          code: v.code,
          name: v.name,
        },
      },
    }));

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
        product:
          !f.product.code.trim() && !f.product.name.trim() && profile.defaults.preferredProduct.code
            ? profile.defaults.preferredProduct
            : f.product,
        vendor:
          !f.vendor.code.trim() && !f.vendor.name.trim() && profile.defaultVendor.code
            ? profile.defaultVendor
            : f.vendor,
        shipper: fillEmptyPartyFields(f.shipper, {
          ...hydrate.shipper,
          origin:
            hydrate.shipper.origin.code || hydrate.shipper.origin.name
              ? hydrate.shipper.origin
              : f.shipper.origin.code.trim()
                ? f.shipper.origin
                : DEFAULT_SHIPPER_ORIGIN,
        }),
        proforma: {
          ...(f.proforma ?? emptyProforma()),
          currency: profile.defaults.currency || f.proforma?.currency || "INR",
          adCode: f.proforma?.adCode || profile.bankAdCode || "",
          lutNo: f.proforma?.lutNo || profile.lutNumber || "",
          lutExpiry: f.proforma?.lutExpiry || profile.lutExpiryDate || "",
        },
      }));
    } catch (e) {
      if (seq !== clientLoadSeqRef.current) return;
      toast.error(toErrorMessage(e, "Failed to load client profile"));
    } finally {
      if (seq === clientLoadSeqRef.current) setClientLoading(false);
    }
  };

  const clientSelected = Boolean(form.clientName.id || form.clientName.code.trim());

  const paymentTypeReadOnly =
    !formSetupSettings.allowPaymentTypeOverride &&
    clientSelected &&
    Boolean(loadedClientProfile?.paymentType?.trim());

  const consigneeFieldsRequired = !formSetupSettings.consigneeNotRequired;

  const validateAwbNavAdvance = useCallback(
    (anchor: HTMLElement) => {
      const container = awbFormNavRef.current;
      if (!container) return true;
      const order = getErpNavOrderFromElement(anchor, container);
      if (order == null || !AWB_REQUIRED_NAV_ORDERS.has(order)) return true;
      return validateAwbNavField(order, form, {
        consigneeNotRequired: formSetupSettings.consigneeNotRequired,
      });
    },
    [form, formSetupSettings.consigneeNotRequired],
  );

  const handleAwbNavAdvanceBlocked = useCallback((anchor: HTMLElement) => {
    const container = awbFormNavRef.current;
    if (!container) return;
    const order = getErpNavOrderFromElement(anchor, container);
    if (order == null) return;
    setNavInvalidOrders((prev) => {
      if (prev.has(order)) return prev;
      const next = new Set(prev);
      next.add(order);
      return next;
    });
  }, []);

  useEffect(() => {
    setNavInvalidOrders((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const order of prev) {
        if (
          validateAwbNavField(order, form, {
            consigneeNotRequired: formSetupSettings.consigneeNotRequired,
          })
        ) {
          next.delete(order);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [form, formSetupSettings.consigneeNotRequired]);

  useEffect(() => {
    setForm((f) => {
      const patch = syncForwardingDeliveryFromShipment(
        f.forwarding,
        f.product,
        f.vendor,
        f.service,
      );
      if (!patch) return f;
      return { ...f, forwarding: { ...f.forwarding, ...patch } };
    });
  }, [form.product, form.vendor, form.service]);

  const chargePreview = priceChargeDraft(chargeDraft);
  const chargeFuelPct = fuelPercentFor({
    rows: fuelRows,
    vendorCode: form.vendor.code,
    vendorName: form.vendor.name,
    productCode: form.product.code,
    productName: form.product.name,
    destinationCode: form.consignee.origin.code,
    destinationName: form.consignee.origin.name,
    bookDate: form.bookDate,
  });
  const chargeGstPct = awbGstPercent({ gstPercent: Number(taxRateQuery.data?.igst_pct ?? 18) });
  const chargeFuelAmount = Number.parseFloat(chargePreview.fuelAmt) || 0;
  const chargeTaxOnFuelOn = chargeDraft.taxOnFuel === "Yes";
  const chargeTaxOn = chargeDraft.tax === "Yes";
  const chargeTaxOnFuelAmount = chargeTaxOnFuelOn ? (chargeFuelAmount * chargeGstPct) / 100 : 0;
  const chargeTaxAmount = chargeTaxOn
    ? ((Number.parseFloat(chargeDraft.itemAmount) || 0) * chargeGstPct) / 100
    : 0;
  const chargeDescriptionItems =
    chargeHeads.length > 0 ? chargeHeads.map((row) => row.name || row.code) : CHARGE_DESCRIPTIONS;
  const proformaTotalIgst = form.proforma.lines
    .reduce((sum, line) => sum + (Number.parseFloat(line.igstAmount) || 0), 0)
    .toFixed(2);
  const displayAwbUserId =
    awbStatusQuery.data?.awbUserId ||
    (profile?.username ? profile.username.toUpperCase() : profile?.full_name?.toUpperCase()) ||
    "—";
  const displayPodUserId =
    awbStatusQuery.data?.podUserId ||
    (profile as unknown as { pod_user_id?: string })?.pod_user_id ||
    "";
  const displayManifestNo = awbStatusQuery.data?.manifestNo ?? form.manifestNo ?? "0";
  const displayManifestDate = awbStatusQuery.data?.manifestDate || form.manifestDate || "";
  const displayInvoiceNo = awbStatusQuery.data?.invoiceNo || form.invoiceNo || "";
  const displayDebitNoteNo = awbStatusQuery.data?.debitNoteNo ?? form.debitNoteNo ?? "0";
  const displayCreditNoteNo = awbStatusQuery.data?.creditNoteNo ?? form.creditNoteNo ?? "0";
  const displayFlightNo = awbStatusQuery.data?.flightNo || form.flightNo || "";
  const awbStatusItems: { label: string; value: string }[] = [
    { label: "AWB No:", value: form.awbNo },
    { label: "Status:", value: editing?.status ?? "" },
    { label: "AWB UserID:", value: displayAwbUserId },
    { label: "POD UserID:", value: displayPodUserId },
    { label: "Manifest No:", value: displayManifestNo },
    {
      label: "Manifest Date",
      value: displayManifestDate ? formatDisplayDate(displayManifestDate) : "",
    },
    { label: "Invoice No:", value: displayInvoiceNo },
    { label: "Debit Note No:", value: displayDebitNoteNo },
    { label: "Credit Note No:", value: displayCreditNoteNo },
    { label: "Flight No.", value: displayFlightNo },
  ];

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 px-3 py-2 md:gap-2 md:px-4 md:py-3">
      {showForm ? null : (
        <MasterBreadcrumb trail={["Transaction", "AWB Entry List"]} />
      )}

      {showForm ? (
        <Card className="min-w-0 border shadow-none p-0">
          <Tabs
            value={AWB_TABS.includes(activeTab as AwbTab) ? activeTab : "awb"}
            onValueChange={setActiveTab}
          >
            <div className="flex flex-col gap-1.5 border-b bg-muted/30 px-2.5 py-1.5 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="h-auto gap-1 rounded-full bg-muted p-1.5">
                {AWB_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="rounded-full border-0 bg-transparent px-4 py-1.5 text-base font-normal text-muted-foreground shadow-none hover:text-foreground data-[state=active]:bg-sidebar data-[state=active]:font-bold data-[state=active]:text-sidebar-foreground data-[state=active]:shadow-none"
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
                  <IconButton label="Form Setup" onClick={openFormSetup}>
                    <Settings className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Clone Entry" onClick={openEntry}>
                    <Copy className="h-4 w-4" />
                  </IconButton>
                  <Select
                    value={toolbarSearchField}
                    onValueChange={(value) => setToolbarSearchField(value as AwbLookupField)}
                  >
                    <SelectTrigger className="h-8 w-[9.75rem] text-xs" aria-label="Search by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AWB_LOOKUP_FIELDS.map((item) => (
                        <SelectItem key={item.value} value={item.value} className="text-xs">
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={formToolbarSearch}
                    onChange={(e) => setFormToolbarSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleFormToolbarSearch();
                    }}
                    aria-label={
                      AWB_LOOKUP_FIELDS.find((item) => item.value === toolbarSearchField)?.label ??
                      "AWB No"
                    }
                    className="h-8 w-36 text-xs"
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground"
                    onClick={() => void handleFormToolbarSearch()}
                    aria-label="Search AWB"
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TooltipProvider>
            </div>

            <div
              ref={awbFormNavRef}
              className="erp-form-nav text-[13px] [&_.erp-field-shell]:h-9 [&_.erp-field-shell_input]:h-9 [&_.erp-field-shell_input]:min-h-9 [&_.erp-field-shell_input]:px-2 [&_.erp-field-shell_input]:text-[13px] [&_.erp-field-shell_button[role=combobox]]:h-9 [&_.erp-field-shell_button[role=combobox]]:px-2 [&_.erp-field-shell_button[role=combobox]]:text-[13px] [&_.erp-field-shell_button[aria-label=Search]]:h-9 [&_.erp-field-shell_button[aria-label=Search]]:w-9 [&_.erp-field-shell_label]:text-[12px] [&_.lookup-name]:min-h-9 [&_.lookup-name_input]:h-9 [&_.lookup-name_input]:min-h-9 [&_.lookup-name_input]:text-[13px] [&_input]:h-9 [&_input]:min-h-9 [&_input]:text-[13px] [&_button[role=combobox]]:h-9 [&_button[role=combobox]]:text-[13px] [&_button[aria-label=Search]]:h-9 [&_button[aria-label=Search]]:w-9"
              data-erp-form-nav
            >
              <ErpFormNavProvider
                containerRef={awbFormNavRef}
                enabled={!entryLocked}
                validateBeforeAdvance={validateAwbNavAdvance}
                onAdvanceBlocked={handleAwbNavAdvanceBlocked}
              >
                <TabsContent value="awb" className="mt-0">
                  <section
                    aria-label="AWB booking status"
                    className={cn(
                      "mt-3 grid w-full grid-cols-4 gap-x-3 gap-y-1 border-y bg-muted/30 px-3 py-2 text-[12px] leading-tight text-muted-foreground lg:grid-cols-8",
                      awbStatusQuery.isFetching && "animate-pulse opacity-80",
                    )}
                  >
                    {awbStatusItems.map((item) => (
                      <span key={item.label} className="min-w-0 truncate whitespace-nowrap">
                        {item.label}
                        {item.value ? (
                          <>
                            {" "}
                            <span className="font-medium text-foreground">{item.value}</span>
                          </>
                        ) : null}
                      </span>
                    ))}
                  </section>
                  <fieldset disabled={entryLocked} className="min-w-0 border-0 p-0 disabled:opacity-90">
                    <div className="p-2 md:p-2.5">
                      <div className="mb-2 rounded border border-border bg-card p-2 pt-2.5">
                        <div className="grid grid-cols-1 items-start gap-1.5 md:grid-cols-2 lg:grid-cols-12 lg:gap-x-2">
                          <div className="flex flex-col lg:col-span-2">
                            <FieldWrapper borderLabel label={`AWB No. [${awbMode}]`} error={fieldError(AWB_NAV.AWB_NO)}>
                              <div className="relative flex items-center w-full">
                                <ErpNavInput
                                  order={AWB_NAV.AWB_NO}
                                  value={form.awbNo}
                                  disabled={awbMode === "AUTO" || !!editing || isReadOnly || clientSelected}
                                  inputMode="numeric"
                                  maxLength={6}
                                  onValueChange={(v) =>
                                    setForm((f) => ({ ...f, awbNo: v.replace(/\D/g, "").slice(0, 6) }))
                                  }
                                  onBlur={async () => {
                                    if (awbMode === "MANUAL" && form.awbNo.trim() && authed) {
                                      try {
                                        const res = await validateManualAwb({
                                          branchId: activeBranchId || profile?.home_branch_id || undefined,
                                          awbNo: form.awbNo,
                                        });
                                        if (!res.valid) {
                                          toast.error(res.message || "Invalid manual AWB number");
                                        } else {
                                          toast.success(res.message);
                                        }
                                      } catch (err) {
                                        toast.error(`AWB validation error: ${toErrorMessage(err)}`);
                                      }
                                    }
                                  }}
                                  className="h-8 pr-12 px-1.5 text-[13px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editing || isReadOnly) return;
                                    const nextMode = awbMode === "AUTO" ? "MANUAL" : "AUTO";
                                    setAwbMode(nextMode);
                                    toast.info(
                                      nextMode === "MANUAL"
                                        ? "Switched to MANUAL AWB mode"
                                        : "Switched to AUTO AWB mode",
                                    );
                                    if (nextMode === "AUTO") {
                                      setForm((f) => ({ ...f, awbNo: "" }));
                                    }
                                  }}
                                  disabled={!!editing || isReadOnly}
                                  className={cn(
                                    "absolute right-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors border",
                                    awbMode === "AUTO"
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300"
                                      : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
                                  )}
                                  title="Toggle Auto/Manual AWB mode (Alt+~)"
                                >
                                  {awbMode}
                                </button>
                              </div>
                            </FieldWrapper>
                          </div>
                          <FieldWrapper borderLabel label="Book Date" className="lg:col-span-2">
                            <ErpNavDateInput
                              order={AWB_NAV.BOOK_DATE}
                              readOnly={!canModifyAwb}
                              max={todayIso()}
                              value={form.bookDate}
                              onValueChange={(v) => setForm((f) => ({ ...f, bookDate: v }))}
                              className="h-8 px-1.5 text-[13px]"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Time" className="lg:col-span-1">
                            <ErpNavInput
                              order={AWB_NAV.TIME}
                              readOnly={!canModifyAwb}
                              value={form.bookTime}
                              onValueChange={(v) =>
                                setForm((f) => ({
                                  ...f,
                                  bookTime: v.replace(/\D/g, "").slice(0, 4),
                                }))
                              }
                              className="h-8 px-1.5 text-[13px]"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Reference No." className="lg:col-span-2" error={fieldError(AWB_NAV.REFERENCE)}>
                            <ErpNavInput
                              order={AWB_NAV.REFERENCE}
                              value={form.referenceNo}
                              maxLength={30}
                              onValueChange={(v) => setForm((f) => ({ ...f, referenceNo: clipText(v, 30) }))}
                              className="h-8 px-1.5 text-[13px]"
                            />
                          </FieldWrapper>
                          <div className="min-w-0 lg:col-span-3">
                            <FieldWrapper
                              borderLabel
                              lookupSplit
                              label="Client Name"
                              required
                              invalid={navInvalidOrders.has(AWB_NAV.CLIENT)}
                              error={fieldError(AWB_NAV.CLIENT)}
                            >
                              <ClientNameField
                                value={form.clientName}
                                onDraftChange={handleClientNameDraft}
                                onSelect={(v) => void handleClientSelect(v)}
                                disabled={clientLoading}
                              />
                            </FieldWrapper>
                            {clientLoading ? (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">Loading client profile…</p>
                            ) : loadedClientProfile?.paymentType ? (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                Payment Type from Client Master: {loadedClientProfile.paymentType}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                    </div>
                  </fieldset>

                  {isSaved && editing?.id ? (
                    <div className="px-2 md:px-2.5">
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
                    </div>
                  ) : null}

                  <fieldset disabled={entryLocked} className="min-w-0 border-0 p-0 disabled:opacity-90">
                    <div className="p-2 md:p-2.5">
                      <div className="mt-0.5 grid grid-cols-1 items-start gap-2 pt-2 md:grid-cols-2 xl:grid-cols-3 xl:gap-2.5">
                        <PartySection
                          title="Shipper Details"
                          party={form.shipper}
                          onChange={(p) => patchParty("shipper", p)}
                          originLookup="destination"
                          originRequired
                          addressRequired
                          invalidNavOrders={navInvalidOrders}
                          fieldError={fieldError}
                          onValidationError={(msg) => setWeightErrorModal({ open: true, message: msg })}
                        />
                        <PartySection
                          title="Consignee Details"
                          party={form.consignee}
                          onChange={(p) => patchParty("consignee", p)}
                          originLookup="internationalDestination"
                          originRequired={consigneeFieldsRequired}
                          companyRequired={consigneeFieldsRequired}
                          addressRequired
                          phoneRequired
                          pincodeCountryCode={
                            !form.consignee.country.trim() ||
                              form.consignee.country.trim().toLowerCase() === "india"
                              ? "IN"
                              : /^[A-Za-z]{2}$/.test(form.consignee.origin.code.trim())
                                ? form.consignee.origin.code.trim().toUpperCase()
                                : "XX"
                          }
                          invalidNavOrders={navInvalidOrders}
                          fieldError={fieldError}
                          onValidationError={(msg) => setWeightErrorModal({ open: true, message: msg })}
                        />
                        <ServicesSection
                          form={form}
                          setForm={setForm}
                          airlineRequired={!formSetupSettings.airlineNotRequired}
                          invalidNavOrders={navInvalidOrders}
                          fieldError={fieldError}
                        />
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-8 shrink-0 rounded-full bg-emerald-600 px-4 text-xs text-white hover:bg-emerald-600/90"
                              {...erpNavSkip()}
                              disabled={ratingBusy !== null}
                              onClick={() => {
                                void handleCheckRateCombination();
                              }}
                            >
                              Customer Charges
                            </Button>
                            <span className="text-sm text-foreground">Total Amount</span>
                            <span className="min-w-16 text-sm font-medium tabular-nums text-foreground">
                              {Number.parseFloat(payableFromLines(form)) > 0
                                ? payableFromLines(form)
                                : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-8 shrink-0 rounded-full bg-emerald-600 px-4 text-xs text-white hover:bg-emerald-600/90"
                              {...erpNavSkip()}
                              disabled={ratingBusy !== null}
                              onClick={() => {
                                void handleVendorCharges();
                              }}
                            >
                              Vendor Charges
                            </Button>
                            <span className="text-sm text-foreground">Total Amount</span>
                            <span className="min-w-16 text-sm font-medium tabular-nums text-foreground">
                              {Number.parseFloat(form.vendorChargesTotal) > 0
                                ? Number.parseFloat(form.vendorChargesTotal).toFixed(2)
                                : ""}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            className="h-8 rounded-full bg-emerald-600 px-4 text-xs text-white hover:bg-emerald-600/90"
                            {...erpNavSkip()}
                            disabled={ratingBusy !== null}
                            onClick={() => {
                              void handleRateCompare();
                            }}
                          >
                            Rate Compare
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-foreground">
                          <span>
                            Customer Contract:{" "}
                            {chargeRefs.customerContract ? (
                              <Link
                                to="/master/customer/customer-rate"
                                className="text-blue-600 underline"
                              >
                                {chargeRefs.customerContract}
                              </Link>
                            ) : null}
                          </span>
                          <span>
                            Vendor Contract:{" "}
                            {chargeRefs.vendorContract ? (
                              <Link
                                to="/master/vendor/vendor-contract"
                                className="text-blue-600 underline"
                              >
                                {chargeRefs.vendorContract}
                              </Link>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            className="text-blue-600 underline"
                            onClick={() => {
                              void handleCheckRateCombination();
                              if (form.vendor.code.trim()) void handleVendorCharges();
                            }}
                          >
                            Check Rate Combination
                          </button>
                          <span>
                            Customer Zone:{" "}
                            {chargeRefs.customerZone ? (
                              <Link to="/master/sales/zone" className="text-blue-600 underline">
                                {chargeRefs.customerZone}
                              </Link>
                            ) : null}
                          </span>
                          <span>
                            Vendor Zone:{" "}
                            {chargeRefs.vendorZone ? (
                              <Link to="/master/sales/zone" className="text-blue-600 underline">
                                {chargeRefs.vendorZone}
                              </Link>
                            ) : null}
                          </span>
                        </div>
                      </div>

                      <Collapsible open={piecesOpen} onOpenChange={setPiecesOpen} className="mt-4">
                        <CollapsibleTrigger
                          className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60"
                          {...erpNavSkip()}
                        >
                          Click here to enter Pieces details Or Press [Alt + u]
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform", piecesOpen && "rotate-180")}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border border-t-0 bg-card">
                          <div className="relative mx-3 mt-3 rounded border border-border bg-card p-3 pt-5">
                            <span className="absolute left-2.5 top-0 z-20 inline-flex h-6 -translate-y-1/2 items-center whitespace-nowrap rounded-full bg-sidebar px-3 text-[13px] font-semibold leading-none text-sidebar-foreground">
                              Import MTS
                            </span>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto gap-1.5 p-0 text-sm font-normal text-red-600 hover:text-red-700"
                                {...erpNavSkip()}
                                onClick={downloadMtsTemplate}
                              >
                                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                                Download Excel File Format
                              </Button>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm text-foreground">Select File</span>
                                <Input
                                  ref={mtsFileRef}
                                  type="file"
                                  accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                                  className="h-8 max-w-[220px] text-[13px]"
                                  {...erpNavSkip()}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 bg-emerald-600 px-4 text-white hover:bg-emerald-600/90"
                                  {...erpNavSkip()}
                                  onClick={() => {
                                    void uploadMtsFile();
                                  }}
                                >
                                  Upload
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3 py-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-[minmax(7.5rem,1.2fr)_minmax(5.25rem,0.85fr)_minmax(4.75rem,0.8fr)_repeat(3,minmax(3.75rem,0.72fr))_minmax(4.5rem,0.78fr)_minmax(11.5rem,1.35fr)_minmax(5.25rem,0.85fr)_auto] xl:items-end [&_label]:whitespace-nowrap [&_label]:text-[11px]">
                            <FieldWrapper borderLabel label="Measurement Unit">
                              <ErpNavSelect
                                order={AWB_NAV.PIECES_MEASUREMENT_UNIT}
                                value={piecesDraft.measurementUnit}
                                onValueChange={(v) => patchPiecesDraft({ measurementUnit: v })}
                                items={MEASUREMENT_UNITS}
                                triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Actl Weight/PCS">
                              <ErpNavInput
                                order={AWB_NAV.PIECES_ACTUAL_WEIGHT_PCS}
                                inputMode="decimal"
                                className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                value={piecesDraft.actualWeightPerPc}
                                onValueChange={(v) => patchPiecesDraft({ actualWeightPerPc: decimalNumber(v) })}
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="No. Of Pieces">
                              <ErpNavInput
                                order={AWB_NAV.PIECES_NO_OF_PIECES}
                                inputMode="numeric"
                                className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                value={piecesDraft.noOfPieces}
                                onValueChange={(v) => patchPiecesDraft({ noOfPieces: digitsOnly(v) })}
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Length">
                              <ErpNavInput
                                order={AWB_NAV.PIECES_LENGTH}
                                inputMode="decimal"
                                className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                value={piecesDraft.length}
                                onValueChange={(v) => patchPiecesDraft({ length: decimalNumber(v) })}
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Width">
                              <ErpNavInput
                                order={AWB_NAV.PIECES_WIDTH}
                                inputMode="decimal"
                                className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                value={piecesDraft.width}
                                onValueChange={(v) => patchPiecesDraft({ width: decimalNumber(v) })}
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Height">
                              <ErpNavInput
                                order={AWB_NAV.PIECES_HEIGHT}
                                inputMode="decimal"
                                className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                value={piecesDraft.height}
                                onValueChange={(v) => patchPiecesDraft({ height: decimalNumber(v) })}
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Division">
                              <div {...{ [ERP_MANUAL_SEARCH]: "" }}>
                                <ErpNavInput
                                  order={AWB_NAV.PIECES_DIVISION}
                                  inputMode="decimal"
                                  className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                  value={piecesDraft.division}
                                  onValueChange={(v) => patchPiecesDraft({ division: decimalNumber(v) })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.shiftKey) {
                                      e.preventDefault();
                                      const container = awbFormNavRef.current;
                                      if (container) {
                                        focusPrevBeforeOrder(container, AWB_NAV.PIECES_DIVISION);
                                      }
                                      return;
                                    }
                                    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
                                      e.preventDefault();
                                      commitPiecesLine();
                                    }
                                  }}
                                />
                              </div>
                            </FieldWrapper>
                            <FieldWrapper
                              borderLabel
                              label="Vol Weight"
                              className="sm:col-span-2 md:col-span-2 lg:col-span-2 xl:col-span-1"
                            >
                              <Input
                                value={piecesDraft.volWeight}
                                readOnly
                                {...erpNavOrder(AWB_NAV.PIECES_VOL_WEIGHT)}
                                className="h-8 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Chrg Weight">
                              <div {...{ [ERP_MANUAL_SEARCH]: "" }}>
                                <Input
                                  value={piecesDraft.chargeWeight}
                                  readOnly
                                  {...erpNavOrder(AWB_NAV.PIECES_CHARGE_WEIGHT)}
                                  className="h-8 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.shiftKey) {
                                      e.preventDefault();
                                      const container = awbFormNavRef.current;
                                      if (container) {
                                        focusPrevBeforeOrder(container, AWB_NAV.PIECES_CHARGE_WEIGHT);
                                      }
                                      return;
                                    }
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      commitPiecesLine();
                                    }
                                  }}
                                />
                              </div>
                            </FieldWrapper>
                            <div className="col-span-2 flex items-end justify-end sm:col-span-1 lg:col-span-1 xl:col-span-1">
                              <Button
                                type="button"
                                className="h-8 w-full bg-sidebar px-5 text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground sm:w-auto"
                                {...erpNavSkip()}
                                onClick={addPiecesLine}
                              >
                                <Plus className="mr-1 h-4 w-4" />
                                {editingPiecesId ? "Update" : "Add"}
                              </Button>
                            </div>
                          </div>

                          <div className="max-h-80 overflow-auto border-t">
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
                                        <div className="flex items-center">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8"
                                            onClick={() => editPiecesLine(l)}
                                            aria-label="Edit piece line"
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-destructive"
                                            onClick={() => removePiecesLine(l.id)}
                                            aria-label="Delete piece line"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
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
                        <CollapsibleTrigger
                          className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60"
                          {...erpNavSkip()}
                        >
                          Click here to enter Charge details Or Press [Alt + c]
                          <ChevronDown
                            className={cn("h-4 w-4 transition-transform", chargesOpen && "rotate-180")}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border border-t-0 bg-card">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-b px-3 py-3 sm:grid-cols-4 xl:grid-cols-8 [&_label]:whitespace-nowrap [&_label]:text-[11px]">
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
                              <FieldWrapper key={label} borderLabel label={label}>
                                <Input
                                  value={val}
                                  readOnly
                                  className="h-8 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                />
                              </FieldWrapper>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2 border-b px-3 py-2.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              {...erpNavSkip()}
                              disabled={saving || isReadOnly}
                              onClick={() => {
                                void handleCheckRateCombination();
                              }}
                            >
                              Check Rate Combination
                            </Button>
                            {authed && editing?.id ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  {...erpNavSkip()}
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
                                  className="h-8"
                                  {...erpNavSkip()}
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
                              </>
                            ) : null}
                            {ratingSummary ? (
                              <span className="self-center text-xs text-muted-foreground">
                                Server rating: freight {ratingSummary.freight} · fuel{" "}
                                {ratingSummary.fuel} · tax {ratingSummary.tax} · total{" "}
                                {ratingSummary.totalAmount}
                              </span>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3 py-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-[minmax(9rem,1.25fr)_minmax(5.5rem,0.85fr)_repeat(3,minmax(7.25rem,1fr))_minmax(4.75rem,0.8fr)_auto] xl:items-end [&_label]:whitespace-nowrap [&_label]:text-[11px]">
                            <FieldWrapper borderLabel label="Description" required>
                              <ErpNavSelect
                                order={AWB_NAV.CHARGE_DESCRIPTION}
                                value={chargeDraft.description || undefined}
                                onValueChange={(v) => {
                                  const head = chargeHeads.find((row) => row.name === v || row.code === v);
                                  setChargeDraft((d) => ({
                                    ...d,
                                    description: head?.name || v,
                                    itemFuel: head ? (head.apply_fuel ? "Yes" : "No") : d.itemFuel,
                                    taxOnFuel: "Yes",
                                    tax: head ? (head.apply_tax ? "Yes" : "No") : d.tax,
                                    itemAmount:
                                      d.itemAmount ||
                                      (head && head.charge_rate > 0 ? String(head.charge_rate) : d.itemAmount),
                                  }));
                                }}
                                items={chargeDescriptionItems}
                                triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Item Amount" required>
                              <ErpNavInput
                                order={AWB_NAV.CHARGE_ITEM_AMOUNT}
                                className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                value={chargeDraft.itemAmount}
                                onValueChange={(v) =>
                                  setChargeDraft((d) => ({
                                    ...d,
                                    itemAmount: v,
                                    itemTotal: v || "0",
                                  }))
                                }
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label={`Item Fuel (${chargeFuelPct}%)`}>
                              <div className="flex w-full min-w-0 items-stretch">
                                <ErpNavSelect
                                  order={AWB_NAV.CHARGE_ITEM_FUEL}
                                  value={chargeDraft.itemFuel}
                                  onValueChange={(v) => setChargeDraft((d) => ({ ...d, itemFuel: v }))}
                                  items={YES_NO}
                                  triggerClassName="h-8 w-[4.25rem] shrink-0 rounded-none border-0 border-r border-input bg-transparent px-1 text-[13px] shadow-none focus:ring-0"
                                />
                                <Input
                                  value={chargePreview.fuelAmt}
                                  readOnly
                                  className="h-8 min-w-0 flex-1 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                />
                              </div>
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Tax On Fuel">
                              <div className="flex w-full min-w-0 items-stretch">
                                <ErpNavSelect
                                  order={AWB_NAV.CHARGE_TAX_ON_FUEL}
                                  value={chargeDraft.taxOnFuel}
                                  onValueChange={(v) => setChargeDraft((d) => ({ ...d, taxOnFuel: v }))}
                                  items={YES_NO}
                                  triggerClassName="h-8 w-[4.25rem] shrink-0 rounded-none border-0 border-r border-input bg-transparent px-1 text-[13px] shadow-none focus:ring-0"
                                />
                                <Input
                                  value={chargeTaxOnFuelAmount.toFixed(2)}
                                  readOnly
                                  className="h-8 min-w-0 flex-1 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                />
                              </div>
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Tax">
                              <div className="flex w-full min-w-0 items-stretch">
                                <ErpNavSelect
                                  order={AWB_NAV.CHARGE_TAX}
                                  value={chargeDraft.tax}
                                  onValueChange={(v) => setChargeDraft((d) => ({ ...d, tax: v }))}
                                  items={YES_NO}
                                  triggerClassName="h-8 w-[4.25rem] shrink-0 rounded-none border-0 border-r border-input bg-transparent px-1 text-[13px] shadow-none focus:ring-0"
                                />
                                <Input
                                  value={chargeTaxAmount.toFixed(2)}
                                  readOnly
                                  className="h-8 min-w-0 flex-1 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                />
                              </div>
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Item Total">
                              <Input
                                value={chargePreview.total}
                                readOnly
                                className="h-8 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              />
                            </FieldWrapper>
                            <div className="col-span-2 flex items-end justify-end sm:col-span-1 xl:col-span-1">
                              <Button
                                type="button"
                                className="h-8 w-full bg-sidebar px-5 text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground sm:w-auto"
                                {...erpNavOrder(AWB_NAV.CHARGE_ADD)}
                                onClick={addChargeLine}
                              >
                                <Plus className="mr-1 h-4 w-4" />
                                Add
                              </Button>
                            </div>
                          </div>
                          <div className="overflow-x-auto border-t">
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
                        <ShipmentDetailsFields
                          form={form}
                          setForm={setForm}
                          paymentTypeReadOnly={paymentTypeReadOnly}
                          clientLoading={clientLoading}
                          isReadOnly={isReadOnly}
                          executiveBranchId={activeBranchId}
                          executiveLocation={form.shipper.origin.code}
                          fieldError={fieldError}
                        />
                      </FormSection>
                    </div>
                  </fieldset>
                  <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
                    <Checkbox
                      id="lock"
                      checked={form.lock}
                      disabled={isTerminalStatus || persistedLocked || !canModifyAwb}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, lock: checked === true }))}
                      {...erpNavOrder(AWB_NAV.LOCK)}
                    />
                    <label htmlFor="lock" className="text-sm text-muted-foreground">
                      Lock
                    </label>
                    {persistedLocked ? (
                      <span className="text-sm text-muted-foreground">
                        {lockedByCaption(editing?.lockedByName, editing?.lockedAt) ?? "Locked"}
                      </span>
                    ) : null}
                    {persistedLocked && canUnlockAwb ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8"
                        disabled={saving}
                        onClick={() => {
                          if (!editing?.id) return;
                          setSaving(true);
                          void unlockShipment(editing.id)
                            .then((row) => {
                              setForm((current) => ({ ...current, lock: false }));
                              setEditing((current) =>
                                current
                                  ? {
                                    ...current,
                                    rowVersion: row.row_version,
                                    status: row.current_status,
                                    lockedByName: null,
                                    lockedAt: null,
                                    serverLocked: false,
                                  }
                                  : current,
                              );
                              toast.success(`AWB ${row.awb_no} unlocked`);
                            })
                            .catch((error) => toast.error(toErrorMessage(error)))
                            .finally(() => setSaving(false));
                        }}
                      >
                        Unlock
                      </Button>
                    ) : null}
                  </div>
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
                            lastResult={vendorLastResult}
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
                      <div role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {bookingErrors.map((msg) => (
                          <div key={msg}>{msg}</div>
                        ))}
                      </div>
                    ) : null}
                    <AwbFormFooter
                      showPrevious={false}
                      readOnly={isReadOnly}
                      saving={saving}
                      onSave={handleSave}
                      saveLabel={isSaved ? "Update" : "Save"}
                      onNext={goNextTab}
                      onCancel={requestCloseForm}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="proforma" className="mt-0">
                  <div className="p-4 md:p-6">
                    <div className={cn(entryLocked && "pointer-events-none opacity-90")}>
                      <FormSection title="Manifest GST Detail">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4 [&_label]:whitespace-nowrap [&_label]:text-[11px]">
                          <FieldWrapper borderLabel label="CSB_Type">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_CSB_TYPE}
                              value={form.proforma.csbType}
                              onValueChange={(v) => {
                                const isComm = v === "CSB 5" || v === "COMMERCIAL" || v === "CBE XIII";
                                const isGiftCSB = v === "CSB 4" || v === "CSB 3" || v === "ECM SPX";
                                setForm((f) => {
                                  let exportReason = f.proforma.exportReason;
                                  if (isComm && (exportReason.toUpperCase().includes("GIFT") || !exportReason)) {
                                    exportReason = "SALE";
                                  } else if (isGiftCSB && exportReason === "SALE") {
                                    exportReason = "";
                                  }
                                  return {
                                    ...f,
                                    commercial: isComm ? true : isGiftCSB ? false : f.commercial,
                                    proforma: {
                                      ...f.proforma,
                                      csbType: v,
                                      exportReason,
                                    },
                                  };
                                });
                              }}
                              items={CSB_TYPES}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Term Of Invoice">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_TERM_OF_INVOICE}
                              value={form.proforma.termOfInvoice || undefined}
                              onValueChange={(v) => patchProforma({ termOfInvoice: v })}
                              items={TERM_OF_INVOICE}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="GST Invoice">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_GST_INVOICE}
                              value={form.proforma.gstInvoice ? "Yes" : "No"}
                              onValueChange={(v) => patchProforma({ gstInvoice: v === "Yes" })}
                              items={YES_NO}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Invoice No">
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_INVOICE_NO}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={form.proforma.invoiceNo}
                              onValueChange={(v) => patchProforma({ invoiceNo: v })}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Invoice Date">
                            <ErpNavDateInput
                              order={AWB_NAV.PROFORMA_INVOICE_DATE}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={form.proforma.invoiceDate}
                              onValueChange={(v) => patchProforma({ invoiceDate: v })}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Department No">
                            <Input
                              readOnly
                              className="h-8 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={form.proforma.departmentNo}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Export Reason">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_EXPORT_REASON}
                              value={form.proforma.exportReason}
                              onValueChange={(v) => patchProforma({ exportReason: v })}
                              items={
                                form.commercial || form.proforma.csbType === "CSB 5" || form.proforma.csbType === "COMMERCIAL"
                                  ? CSB5_EXPORT_REASONS
                                  : CSB4_EXPORT_REASONS
                              }
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Format">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_FORMAT}
                              value={form.proforma.format || undefined}
                              onValueChange={(v) => patchProforma({ format: v })}
                              items={PROFORMA_FORMATS}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper
                            borderLabel
                            label="Ad Code"
                            required={form.proforma.csbType.trim().toUpperCase() === "CSB 5" || form.commercial}
                          >
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_AD_CODE}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={form.proforma.adCode}
                              onValueChange={(v) => patchProforma({ adCode: v })}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Total IGST">
                            <Input
                              readOnly
                              className="h-8 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={proformaTotalIgst}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Bond / UT">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_BOND_UT}
                              value={form.proforma.bondUt || "No"}
                              onValueChange={(v) =>
                                patchProforma({
                                  bondUt: v,
                                  payOfIgst: v === "Yes" ? "No" : form.proforma.payOfIgst,
                                })
                              }
                              items={YES_NO}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Pay of IGST">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_PAY_IGST}
                              value={form.proforma.payOfIgst || "No"}
                              onValueChange={(v) =>
                                patchProforma({
                                  payOfIgst: v,
                                  bondUt: v === "Yes" ? "No" : form.proforma.bondUt,
                                })
                              }
                              items={YES_NO}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          {form.proforma.bondUt === "Yes" ? (
                            <>
                              <FieldWrapper borderLabel label="LUT No" required>
                                <ErpNavInput
                                  order={AWB_NAV.PROFORMA_LUT_NO}
                                  className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                  value={form.proforma.lutNo}
                                  onValueChange={(v) => patchProforma({ lutNo: v })}
                                  placeholder={loadedClientProfile?.lutNumber || "Enter LUT No"}
                                />
                              </FieldWrapper>
                              <FieldWrapper borderLabel label="LUT Expiry Date" required>
                                <ErpNavDateInput
                                  order={AWB_NAV.PROFORMA_LUT_EXPIRY}
                                  className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                  value={form.proforma.lutExpiry}
                                  onValueChange={(v) => patchProforma({ lutExpiry: v })}
                                  placeholder="YYYY-MM-DD"
                                />
                              </FieldWrapper>
                            </>
                          ) : null}
                          <FieldWrapper borderLabel label="Ecommerce">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_ECOMMERCE}
                              value={form.proforma.ecommerce || "No"}
                              onValueChange={(v) => patchProforma({ ecommerce: v })}
                              items={YES_NO}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="MEIS">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_MEIS}
                              value={form.proforma.meis || "No"}
                              onValueChange={(v) => patchProforma({ meis: v })}
                              items={YES_NO}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Type of Invoice">
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_INVOICE_TYPE}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={form.proforma.invoiceType}
                              onValueChange={(v) => patchProforma({ invoiceType: v })}
                            />
                          </FieldWrapper>
                        </div>
                      </FormSection>

                      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                        <div className="relative rounded border border-border bg-card p-3 pt-5">
                          <span className="absolute left-2.5 top-0 z-20 inline-flex h-6 -translate-y-1/2 items-center whitespace-nowrap rounded-full bg-sidebar px-3 text-[13px] font-semibold leading-none text-sidebar-foreground">
                            Import Proforma
                          </span>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto gap-1.5 p-0 text-sm font-normal text-red-600 hover:text-red-700"
                              {...erpNavSkip()}
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = "/ExcelFormat/AWBPerforma.xls?v=1.3";
                                link.download = "AWBPerforma.xls";
                                link.click();
                              }}
                            >
                              <FileSpreadsheet className="h-4 w-4 shrink-0" />
                              Download Excel File Format
                            </Button>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-foreground">Select File</span>
                              <Input
                                ref={proformaFileRef}
                                type="file"
                                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                className="h-8 max-w-[220px] text-[13px]"
                                {...erpNavSkip()}
                              />
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 bg-emerald-600 px-4 text-white hover:bg-emerald-600/90"
                                {...erpNavSkip()}
                                disabled={proformaUploading || entryLocked}
                                onClick={() => void uploadProformaFile()}
                              >
                                {proformaUploading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5" />
                                )}
                                Upload
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-[12rem]">
                          <FormSection title="Currency">
                            <ErpNavSelect
                              order={AWB_NAV.PROFORMA_CURRENCY}
                              value={form.proforma.currency}
                              onValueChange={(v) => patchProforma({ currency: v })}
                              items={PROFORMA_CURRENCIES}
                              triggerClassName="h-8 text-[13px]"
                              contentClassName="max-h-64"
                            />
                          </FormSection>
                        </div>
                      </div>

                      {form.proforma.currency !== "INR" ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
                          <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                          <span>
                            Customs Exchange Rate: 1 {form.proforma.currency} = ₹{getCustomsExchangeRate(form.proforma.currency).toFixed(2)} INR.
                            {" "}Proforma Value: {form.proforma.currency} {proformaSummary.amount} (≈ ₹{(Number(proformaSummary.amount) * getCustomsExchangeRate(form.proforma.currency)).toFixed(2)} INR).
                            {Number(proformaSummary.amount) * getCustomsExchangeRate(form.proforma.currency) > 100000 && !form.commercial && form.proforma.csbType !== "CSB 5" && (
                              <Badge variant="destructive" className="ml-2 text-[10px]">
                                Exceeds CSB-IV Limit (₹1,00,000) — CSB-V Commercial Required
                              </Badge>
                            )}
                          </span>
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-md border bg-card">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3 py-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-[minmax(4rem,0.72fr)_minmax(4.5rem,0.78fr)_minmax(8rem,1.35fr)_minmax(5rem,0.9fr)_minmax(3.75rem,0.68fr)_minmax(3.75rem,0.68fr)_minmax(6.75rem,1fr)_minmax(3.75rem,0.68fr)_minmax(4.25rem,0.75fr)_minmax(3.5rem,0.65fr)_auto] xl:items-end [&_label]:whitespace-nowrap [&_label]:text-[11px]">
                          <FieldWrapper borderLabel label="Box No">
                            <ErpNavSelect
                              key={`proforma-box-${proformaBoxNumbers.join("-") || "none"}`}
                              order={AWB_NAV.PROFORMA_BOX_NO}
                              value={
                                proformaBoxNumbers.includes(proformaDraft.boxNo)
                                  ? proformaDraft.boxNo
                                  : undefined
                              }
                              onValueChange={(v) => patchProformaDraft({ boxNo: v })}
                              items={proformaBoxNumbers}
                              disabled={proformaBoxNumbers.length === 0}
                              triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Packages">
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_PACKAGES}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={proformaDraft.packages}
                              onValueChange={(v) => patchProformaDraft({ packages: v })}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Description">
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_DESCRIPTION}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={proformaDraft.description}
                              onValueChange={(v) => patchProformaDraft({ description: v })}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="HSN Code">
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_HSN_CODE}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={proformaDraft.hsnCode}
                              onValueChange={(v) => patchProformaDraft({ hsnCode: v })}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Quantity">
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_QUANTITY}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={proformaDraft.quantity}
                              onValueChange={(v) => patchProformaDraft({ quantity: v })}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Weight">
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_WEIGHT}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={proformaDraft.weight}
                              onValueChange={(v) => patchProformaDraft({ weight: v })}
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Unit">
                            <div className="flex w-full min-w-0 items-stretch">
                              <ErpNavSelect
                                order={AWB_NAV.PROFORMA_UNIT}
                                value={proformaDraft.unit}
                                onValueChange={(v) => patchProformaDraft({ unit: v })}
                                items={proformaUnits}
                                triggerClassName="h-8 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                title="Add custom unit"
                                aria-label="Add custom unit"
                                className="h-8 w-8 shrink-0 rounded-none border-0 border-l border-input px-0 shadow-none"
                                {...erpNavSkip()}
                                onClick={() => {
                                  setNewUnitInput("");
                                  setAddUnitOpen(true);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Rate">
                            <div {...{ [ERP_MANUAL_SEARCH]: "" }}>
                              <ErpNavInput
                                order={AWB_NAV.PROFORMA_RATE}
                                className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                value={proformaDraft.rate}
                                onValueChange={(v) => patchProformaDraft({ rate: v })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && e.shiftKey) {
                                    e.preventDefault();
                                    const container = awbFormNavRef.current;
                                    if (container) {
                                      focusPrevBeforeOrder(container, AWB_NAV.PROFORMA_RATE);
                                    }
                                    return;
                                  }
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitProformaLine();
                                  }
                                }}
                              />
                            </div>
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="Amount">
                            <Input
                              value={proformaDraft.amount}
                              readOnly
                              className="h-8 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                            />
                          </FieldWrapper>
                          <FieldWrapper borderLabel label="IGST %">
                            <ErpNavInput
                              order={AWB_NAV.PROFORMA_IGST_PCT}
                              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              value={proformaDraft.igstPercent}
                              onValueChange={(v) => patchProformaDraft({ igstPercent: v })}
                            />
                          </FieldWrapper>
                          <div className="col-span-2 flex items-end justify-end gap-1.5 sm:col-span-1 xl:col-span-1">
                            <Button
                              type="button"
                              className="h-8 w-full bg-sidebar px-4 text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground sm:w-auto"
                              {...erpNavSkip()}
                              onClick={addProformaLine}
                            >
                              <Plus className="mr-1 h-4 w-4" />
                              {editingProformaId ? "Update line" : "Add line"}
                            </Button>
                            {editingProformaId ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  setEditingProformaId(null);
                                  setProformaDraft(emptyProformaDraft());
                                }}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 border-t px-3 py-2.5 text-sm">
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

                        <div className="overflow-x-auto border-t">
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
                                      <div className="flex items-center gap-1">
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8 text-primary"
                                          onClick={() => {
                                            setEditingProformaId(l.id);
                                            setProformaDraft({
                                              boxNo: l.boxNo,
                                              packages: l.packages,
                                              description: l.description,
                                              hsnCode: l.hsCode,
                                              quantity: l.quantity,
                                              weight: l.weight,
                                              unit: l.unit,
                                              rate: l.rate,
                                              amount: l.amount,
                                              igstPercent: l.igstPercent || "0",
                                            });
                                          }}
                                          aria-label="Edit proforma line"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8 text-destructive"
                                          onClick={() => removeProformaLine(l.id)}
                                          aria-label="Delete proforma line"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
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
                        saving={saving}
                        onSave={handleSave}
                        saveLabel={isSaved ? "Update" : "Save"}
                        onNext={goNextTab}
                        onCancel={requestCloseForm}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="forwarding" className="mt-0">
                  <div className="p-4 md:p-6">
                    <fieldset disabled={entryLocked} className={cn("min-w-0 border-0 p-0", entryLocked && "pointer-events-none opacity-90")}>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4 [&_label]:whitespace-nowrap [&_label]:text-[11px]">
                        <FieldWrapper borderLabel label="Delivery AWB">
                          <ErpNavInput
                            order={AWB_NAV.FWD_DELIVERY_AWB}
                            className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                            value={form.forwarding.deliveryAwb}
                            onValueChange={(v) => patchForwarding({ deliveryAwb: v })}
                          />
                        </FieldWrapper>
                        <FieldWrapper borderLabel label="Forwarding AWB">
                          <ErpNavInput
                            order={AWB_NAV.FWD_FORWARDING_AWB}
                            className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                            value={form.forwarding.forwardingAwb}
                            onValueChange={(v) => patchForwarding({ forwardingAwb: v })}
                          />
                        </FieldWrapper>
                        <FieldWrapper borderLabel lookupSplit label="Delivery Product">
                          <LookupPairInput
                            lookup="product"
                            value={form.forwarding.deliveryProduct}
                            onChange={(v) => patchForwarding({ deliveryProduct: v })}
                            navOrder={AWB_NAV.FWD_DELIVERY_PRODUCT}
                          />
                        </FieldWrapper>
                        <FieldWrapper borderLabel lookupSplit label="Delivery Vendor">
                          <LookupPairInput
                            lookup="vendor"
                            value={form.forwarding.deliveryVendor}
                            onChange={(v) => patchForwarding({ deliveryVendor: v })}
                            navOrder={AWB_NAV.FWD_DELIVERY_VENDOR}
                          />
                        </FieldWrapper>
                        <FieldWrapper borderLabel lookupSplit label="Delivery Service">
                          <VendorServiceLookup
                            vendor={form.forwarding.deliveryVendor}
                            value={form.forwarding.deliveryService}
                            onChange={(v) => patchForwarding({ deliveryService: v })}
                            productId={form.forwarding.deliveryProduct.id || form.product.id}
                            destinationId={form.consignee.origin.id}
                            navOrder={AWB_NAV.FWD_DELIVERY_SERVICE}
                            compact
                            splitCode
                            manualSearch
                          />
                        </FieldWrapper>
                        <FieldWrapper borderLabel label="Vendor Weight">
                          <ErpNavInput
                            order={AWB_NAV.FWD_VENDOR_WEIGHT}
                            className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                            value={form.forwarding.vendorWeight}
                            onValueChange={(v) => patchForwarding({ vendorWeight: v })}
                          />
                        </FieldWrapper>
                        <FieldWrapper borderLabel label="Vendor Amount">
                          <ErpNavInput
                            order={AWB_NAV.FWD_VENDOR_AMOUNT}
                            className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                            value={form.forwarding.vendorAmount}
                            onValueChange={(v) => patchForwarding({ vendorAmount: v })}
                          />
                        </FieldWrapper>
                        <FieldWrapper borderLabel label="Vendor Invoice">
                          <ErpNavInput
                            order={AWB_NAV.FWD_VENDOR_INVOICE}
                            className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                            value={form.forwarding.vendorInvoice}
                            onValueChange={(v) => patchForwarding({ vendorInvoice: v })}
                          />
                        </FieldWrapper>
                      </div>

                      <Collapsible
                        open={vendorChargesOpen}
                        onOpenChange={setVendorChargesOpen}
                        className="mt-4"
                      >
                        <CollapsibleTrigger
                          className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60"
                          {...erpNavSkip()}
                        >
                          Click here to enter Vendor Charge details Or Press [Alt + w]
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              vendorChargesOpen && "rotate-180",
                            )}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border border-t-0 bg-card">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-b px-3 py-3 sm:grid-cols-3 xl:grid-cols-6 [&_label]:whitespace-nowrap [&_label]:text-[11px]">
                            {(
                              [
                                ["Contract", vendorChargeSummary.contractCharges, "fwd-summary-contract"],
                                ["Fuel", vendorChargeSummary.totalFuel, "fwd-summary-fuel"],
                                ["Manual", vendorChargeSummary.manualCharges, "fwd-summary-manual"],
                                ["Vendor GST", vendorChargeSummary.vendorGst, "fwd-summary-vendor-gst"],
                                ["Vendor Total (incl. GST)", vendorChargeSummary.vendorTotalInclGst, "fwd-summary-vendor-total"],
                                ["Margin", vendorChargeSummary.margin, "fwd-summary-margin"],
                              ] as const
                            ).map(([label, val, testId]) => (
                              <FieldWrapper key={label} borderLabel label={label}>
                                <Input
                                  data-testid={testId}
                                  value={val}
                                  readOnly
                                  className={cn(
                                    "h-8 rounded-none border-0 px-1.5 text-[13px] shadow-none focus-visible:ring-0",
                                    label === "Vendor Total (incl. GST)" && "bg-muted/40 font-semibold",
                                    label === "Margin" && (Number.parseFloat(val) >= 0 ? "bg-emerald-50 font-bold text-emerald-700" : "bg-red-50 font-bold text-red-700"),
                                    label !== "Margin" && label !== "Vendor Total (incl. GST)" && "bg-muted/30",
                                  )}
                                />
                              </FieldWrapper>
                            ))}
                          </div>
                          {vendorMissingStateWarning ? (
                            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="fwd-vendor-state-warning">
                              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                              <span>{vendorMissingStateWarning}</span>
                            </div>
                          ) : null}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3 py-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-[minmax(9rem,1.25fr)_minmax(5.5rem,0.85fr)_repeat(3,minmax(7.25rem,1fr))_minmax(4.75rem,0.8fr)_auto] xl:items-end [&_label]:whitespace-nowrap [&_label]:text-[11px]">
                            <FieldWrapper borderLabel label="Description" required>
                              <ErpNavSelect
                                order={AWB_NAV.VENDOR_CHARGE_DESCRIPTION}
                                value={vendorChargeDraft.description || undefined}
                                onValueChange={(v) => patchVendorChargeDraft({ description: v })}
                                beforeOpen={ensureVendorChargePrerequisites}
                                items={VENDOR_CHARGE_DESCRIPTIONS}
                                triggerClassName="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Amount" required>
                              <ErpNavInput
                                order={AWB_NAV.VENDOR_CHARGE_AMOUNT}
                                className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                value={vendorChargeDraft.amount}
                                onValueChange={(v) => patchVendorChargeDraft({ amount: v })}
                                onFocus={() => {
                                  if (!ensureVendorChargePrerequisites()) {
                                    (document.activeElement as HTMLElement | null)?.blur();
                                  }
                                }}
                              />
                            </FieldWrapper>
                            <FieldWrapper borderLabel label={`Fuel (${vendorFuelPct}%)`}>
                              <div className="flex w-full min-w-0 items-stretch">
                                <ErpNavSelect
                                  order={AWB_NAV.VENDOR_CHARGE_FUEL}
                                  value={vendorChargeDraft.fuel}
                                  onValueChange={(v) => patchVendorChargeDraft({ fuel: v })}
                                  beforeOpen={ensureVendorChargePrerequisites}
                                  items={YES_NO}
                                  triggerClassName="h-8 w-[4.25rem] shrink-0 rounded-none border-0 border-r border-input bg-transparent px-1 text-[13px] shadow-none focus:ring-0"
                                />
                                <Input
                                  value={vendorChargeDraft.fuelAmt}
                                  readOnly
                                  className="h-8 min-w-0 flex-1 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                />
                              </div>
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Tax On Fuel">
                              <div className="flex w-full min-w-0 items-stretch">
                                <ErpNavSelect
                                  order={AWB_NAV.VENDOR_CHARGE_TAX_ON_FUEL}
                                  value={vendorChargeDraft.taxOnFuel}
                                  onValueChange={(v) => patchVendorChargeDraft({ taxOnFuel: v })}
                                  beforeOpen={ensureVendorChargePrerequisites}
                                  items={YES_NO}
                                  triggerClassName="h-8 w-[4.25rem] shrink-0 rounded-none border-0 border-r border-input bg-transparent px-1 text-[13px] shadow-none focus:ring-0"
                                />
                                <Input
                                  value={vendorChargeDraft.taxOnFuelAmt}
                                  readOnly
                                  className="h-8 min-w-0 flex-1 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                />
                              </div>
                            </FieldWrapper>
                            <FieldWrapper borderLabel label={`Tax (${vendorGstPct}%)`}>
                              <div className="flex w-full min-w-0 items-stretch">
                                <ErpNavSelect
                                  order={AWB_NAV.VENDOR_CHARGE_TAX}
                                  value={vendorChargeDraft.tax}
                                  onValueChange={(v) => patchVendorChargeDraft({ tax: v })}
                                  beforeOpen={ensureVendorChargePrerequisites}
                                  items={YES_NO}
                                  triggerClassName="h-8 w-[4.25rem] shrink-0 rounded-none border-0 border-r border-input bg-transparent px-1 text-[13px] shadow-none focus:ring-0"
                                />
                                <Input
                                  value={vendorChargeDraft.taxAmt}
                                  readOnly
                                  className="h-8 min-w-0 flex-1 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                                />
                              </div>
                            </FieldWrapper>
                            <FieldWrapper borderLabel label="Total">
                              <Input
                                value={vendorChargeDraft.total}
                                readOnly
                                className="h-8 rounded-none border-0 bg-muted/30 px-1.5 text-[13px] shadow-none focus-visible:ring-0"
                              />
                            </FieldWrapper>
                            <div className="col-span-2 flex items-end justify-end sm:col-span-1 xl:col-span-1">
                              <Button
                                type="button"
                                className="h-8 w-full bg-sidebar px-5 text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground sm:w-auto"
                                {...erpNavOrder(AWB_NAV.VENDOR_CHARGE_ADD)}
                                onClick={addVendorChargeLine}
                              >
                                <Plus className="mr-1 h-4 w-4" />
                                Add
                              </Button>
                            </div>
                          </div>
                          <div className="overflow-x-auto border-t">
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
                    </fieldset>
                    <div className="mt-6">
                      <AwbFormFooter
                        showPrevious
                        onPrevious={goPrevTab}
                        readOnly={isReadOnly}
                        saving={saving}
                        onSave={handleSave}
                        saveLabel={isSaved ? "Update" : "Save"}
                        onNext={goNextTab}
                        onCancel={requestCloseForm}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="kyc" className="mt-0">
                  <div className="p-4 md:p-6">
                    <div className={cn(entryLocked && "pointer-events-none opacity-90")}>
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
                        <ErpNavSelect
                          order={AWB_NAV.KYC_SEARCH_FIELD}
                          value={kycSearchField}
                          onValueChange={(v) => setKycSearchField(v as SearchField)}
                          items={SEARCH_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
                          triggerClassName="h-9 w-[8.5rem]"
                        />
                        <ErpNavInput
                          order={AWB_NAV.KYC_SEARCH_INPUT}
                          value={kycSearchInput}
                          onValueChange={setKycSearchInput}
                          className="h-9 w-40"
                        />
                        <Button
                          size="icon"
                          className="h-9 w-9 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground"
                          aria-label="Search KYC"
                          {...erpNavSkip()}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
                        <div className="flex flex-col gap-4">
                          <FieldWrapper label="Type">
                            <ErpNavSelect
                              order={AWB_NAV.KYC_TYPE}
                              value={kycDocType}
                              onValueChange={setKycDocType}
                              items={KYC_TYPES}
                            />
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
                                      <div className="flex items-center gap-1">
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8"
                                          disabled={!d.contentB64}
                                          onClick={() => downloadKycDocument(d)}
                                          aria-label="Download KYC document"
                                        >
                                          <Download className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8 text-destructive"
                                          onClick={() => removeKycDocument(d.id)}
                                          aria-label="Delete KYC document"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
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
                        saving={saving}
                        onSave={handleSave}
                        saveLabel={isSaved ? "Update" : "Save"}
                        onNext={goNextTab}
                        onCancel={requestCloseForm}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="notification" className="mt-0">
                  <div className="p-4 md:p-6">
                    <div className={cn(entryLocked && "pointer-events-none opacity-90")}>
                      <FormSection title="Notification">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="notify-email"
                              checked={form.notifyEmail}
                              onCheckedChange={(checked) =>
                                setForm((current) => ({ ...current, notifyEmail: checked === true }))
                              }
                              {...erpNavOrder(AWB_NAV.NOTIFY_EMAIL)}
                            />
                            <label htmlFor="notify-email" className="text-sm">
                              Email shipper and consignee after save
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="notify-sms"
                              checked={form.notifySms}
                              onCheckedChange={(checked) =>
                                setForm((current) => ({ ...current, notifySms: checked === true }))
                              }
                              {...erpNavOrder(AWB_NAV.NOTIFY_SMS)}
                            />
                            <label htmlFor="notify-sms" className="text-sm">
                              SMS shipper and consignee after save
                            </label>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            A failed email or SMS leaves the saved AWB in place and shows a warning.
                          </p>
                        </div>
                      </FormSection>
                    </div>
                    <div className="mt-6">
                      <AwbFormFooter
                        showPrevious
                        onPrevious={goPrevTab}
                        readOnly={isReadOnly}
                        saving={saving}
                        onSave={handleSave}
                        saveLabel={isSaved ? "Update" : "Save"}
                        onCancel={requestCloseForm}
                      />
                    </div>
                  </div>
                </TabsContent>
              </ErpFormNavProvider>
            </div>
          </Tabs>

          <Dialog open={rateCompareOpen} onOpenChange={setRateCompareOpen}>
            <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl">
              <div className="bg-sidebar px-4 py-3">
                <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                  Vendor Rate Compare
                </DialogTitle>
              </div>
              <div className="max-h-[70vh] overflow-auto p-4">
                {rateCompareMessage ? (
                  <p className="mb-3 text-sm text-muted-foreground">{rateCompareMessage}</p>
                ) : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origin</TableHead>
                      <TableHead>Vendor Name</TableHead>
                      <TableHead>Service Type</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                      <TableHead className="text-right">Rate/Kg</TableHead>
                      <TableHead className="text-right">Final Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateCompareRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          {ratingBusy === "compare" ? "Comparing vendor tariffs…" : "No rates to show"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      rateCompareRows.map((row) => (
                        <TableRow key={`${row.contractId}-${row.service}`}>
                          <TableCell>{row.origin || "—"}</TableCell>
                          <TableCell>{row.vendorName}</TableCell>
                          <TableCell>{row.service || "—"}</TableCell>
                          <TableCell className="text-right">{row.weight.toFixed(3)}</TableCell>
                          <TableCell className="text-right">{row.ratePerKg.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.totalAmount.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                              onClick={() => selectComparedVendor(row)}
                            >
                              Select
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>

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
                    className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground"
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
                  className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground"
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleEntrySearch();
                    }}
                  />
                </FieldWrapper>
              </div>
              <div className="flex justify-end gap-2 px-6 pb-6">
                <Button
                  onClick={() => void handleEntrySearch()}
                  disabled={saving}
                  className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground"
                >
                  {saving ? "Loading…" : "Search"}
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
                  className="h-9 w-full min-w-[10rem] sm:w-48"
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground"
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
                        ["awbNo", awbCol.awbNoFilter],
                        ["bookDate", awbCol.bookDate],
                        ["shipperName", awbCol.shipperName],
                        ["customerCode", awbCol.customerCode],
                        ["customerName", awbCol.customerName],
                        ["consigneeName", awbCol.consigneeName],
                        ["destination", awbCol.destination],
                        ["product", awbCol.product],
                        ["vendor", awbCol.vendor],
                        ["actualWeight", awbCol.actualWeight],
                        ["chargeWeight", awbCol.chargeWeight],
                        ["pieces", awbCol.pieces],
                        ["deliveryVendor", awbCol.deliveryVendor],
                      ] as const
                    ).map(([key, colClass]) => (
                      <TableHead key={key} className={cn("py-2", colClass)}>
                        <Input
                          value={colFilters[key]}
                          onChange={(e) => {
                            setColFilters((f) => ({ ...f, [key]: e.target.value }));
                            setPage(1);
                          }}
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

      <AlertDialog
        open={weightErrorModal.open}
        onOpenChange={(open) => {
          if (!open) setWeightErrorModal({ open: false, message: "" });
        }}
      >
        <AlertDialogContent className="max-w-md p-6">
          <AlertDialogHeader className="items-center text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <AlertTriangle className="h-8 w-8" aria-hidden />
            </div>
            <AlertDialogTitle className="text-center text-lg font-semibold text-foreground">
              Weight Out of Range
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 text-center text-sm font-medium text-destructive">
              {weightErrorModal.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 sm:justify-center">
            <AlertDialogAction
              onClick={() => setWeightErrorModal({ open: false, message: "" })}
              className="w-28 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={proformaImportErrors.length > 0}
        onOpenChange={(open) => {
          if (!open) setProformaImportErrors([]);
        }}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Proforma import</AlertDialogTitle>
            <AlertDialogDescription>Fix these rows and upload the file again.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-72 overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-1">Row #</th>
                  <th className="px-2 py-1">Column</th>
                  <th className="px-2 py-1">Value</th>
                  <th className="px-2 py-1">Message</th>
                </tr>
              </thead>
              <tbody>
                {proformaImportErrors.map((error, index) => (
                  <tr key={`${error.row}-${error.column}-${index}`} className="border-b">
                    <td className="px-2 py-1">{error.row}</td>
                    <td className="px-2 py-1">{error.column}</td>
                    <td className="px-2 py-1">{error.value}</td>
                    <td className="px-2 py-1">{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                const blob = new Blob([proformaErrorReportCsv(proformaImportErrors)], {
                  type: "text/csv;charset=utf-8",
                });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = "proforma-import-errors.csv";
                link.click();
                URL.revokeObjectURL(link.href);
              }}
            >
              Download error report
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setProformaImportErrors([])}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={proformaPreview != null}
        onOpenChange={(open) => {
          if (!open) setProformaPreview(null);
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm proforma import</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap text-left">
              {proformaPreview?.warnings.join("\n")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm">
            {proformaPreview?.lines.length ?? 0} rows are ready. Amount{" "}
            {(proformaPreview?.lines ?? [])
              .reduce((sum, line) => sum + (Number.parseFloat(line.amount) || 0), 0)
              .toFixed(2)}
            .
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!proformaPreview) return;
                const lines = proformaPreview.lines;
                setProformaPreview(null);
                placeImportedProforma(lines);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={proformaImportPending != null}
        onOpenChange={(open) => {
          if (!open) setProformaImportPending(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Proforma lines already exist</AlertDialogTitle>
            <AlertDialogDescription>
              Append the imported rows to the grid, or replace the rows that are already there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (proformaImportPending) applyImportedProforma("append", proformaImportPending);
              }}
            >
              Append
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (proformaImportPending) applyImportedProforma("replace", proformaImportPending);
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={vendorChargePrereqErrors != null}
        onOpenChange={(open) => {
          if (!open) setVendorChargePrereqErrors(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle className="h-8 w-8" aria-hidden />
            </div>
            <AlertDialogTitle className="sr-only">Vendor charge validation</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="list-disc space-y-1 pl-5 text-left text-sm text-foreground">
                {vendorChargePrereqErrors?.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setVendorChargePrereqErrors(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leavePromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have an unfinished AWB entry.</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave? Any unsaved changes will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => void finishLeavePrompt("continue")}>
              Continue Editing
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
    <div
      className={cn(
        "relative min-w-0 rounded border border-border bg-card p-2.5 pt-5 shadow-none",
        className,
      )}
    >
      {/* Centered on the top border — do not use nested <fieldset>/<legend> (breaks inside the page fieldset). */}
      <span className="absolute left-2.5 top-1 z-20 inline-flex h-6 -translate-y-1/2 items-center whitespace-nowrap rounded-full bg-sidebar px-3 text-sm font-semibold leading-none text-sidebar-foreground">
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
  originRequired,
  companyRequired = true,
  addressRequired = false,
  phoneRequired = false,
  pincodeCountryCode = "IN",
  invalidNavOrders,
  fieldError,
  onValidationError,
}: {
  title: string;
  party: PartyDetails;
  onChange: (patch: Partial<PartyDetails>) => void;
  originLookup: LookupKey;
  originRequired?: boolean;
  companyRequired?: boolean;
  addressRequired?: boolean;
  phoneRequired?: boolean;
  pincodeCountryCode?: string;
  invalidNavOrders?: Set<number>;
  fieldError?: (order: number) => string | undefined;
  onValidationError?: (message: string) => void;
}) {
  const isConsignee = title.includes("Consignee");
  const originLabel = isConsignee ? "Destination" : "Origin";
  const nav = isConsignee
    ? {
      origin: AWB_NAV.CONSIGNEE_DESTINATION,
      company: AWB_NAV.CONSIGNEE_COMPANY,
      contact: AWB_NAV.CONSIGNEE_CONTACT,
      address1: AWB_NAV.CONSIGNEE_ADDRESS1,
      address2: AWB_NAV.CONSIGNEE_ADDRESS2,
      pincode: AWB_NAV.CONSIGNEE_PINCODE,
      city: AWB_NAV.CONSIGNEE_CITY,
      state: AWB_NAV.CONSIGNEE_STATE,
      telephone: AWB_NAV.CONSIGNEE_TELEPHONE,
      mobile: AWB_NAV.CONSIGNEE_MOBILE,
      email: AWB_NAV.CONSIGNEE_EMAIL,
      country: AWB_NAV.CONSIGNEE_COUNTRY,
      iec: AWB_NAV.CONSIGNEE_IEC,
      docType: AWB_NAV.CONSIGNEE_DOC_TYPE,
      docNo: AWB_NAV.CONSIGNEE_DOC_NO,
    }
    : {
      origin: AWB_NAV.SHIPPER_ORIGIN,
      company: AWB_NAV.SHIPPER_COMPANY,
      contact: AWB_NAV.SHIPPER_CONTACT,
      address1: AWB_NAV.SHIPPER_ADDRESS1,
      address2: AWB_NAV.SHIPPER_ADDRESS2,
      pincode: AWB_NAV.SHIPPER_PINCODE,
      city: AWB_NAV.SHIPPER_CITY,
      state: AWB_NAV.SHIPPER_STATE,
      telephone: AWB_NAV.SHIPPER_TELEPHONE,
      mobile: AWB_NAV.SHIPPER_MOBILE,
      email: AWB_NAV.SHIPPER_EMAIL,
      country: AWB_NAV.SHIPPER_COUNTRY,
      iec: AWB_NAV.SHIPPER_IEC,
      docType: AWB_NAV.SHIPPER_DOC_TYPE,
      docNo: AWB_NAV.SHIPPER_DOC_NO,
    };
  const onCommit = useErpNavCommit();
  const onPincodeCommit = useErpNavCommit(nav.pincode);
  const inputClass = "h-9 px-2 text-[13px]";
  const destinationCountrySeq = useRef(0);
  const applyOriginCountry = (destinationId: string | undefined) => {
    if (!destinationId) return;
    const seq = ++destinationCountrySeq.current;
    void destinationCountryName(destinationId).then((country) => {
      if (seq !== destinationCountrySeq.current || !country) return;
      onChange({ country });
    });
  };

  return (
    <FormSection title={title}>
      <div className="grid grid-cols-1 content-start gap-1.5">
        <FieldWrapper
          borderLabel
          lookupSplit
          label={originLabel}
          required={originRequired}
          invalid={invalidNavOrders?.has(nav.origin)}
          error={fieldError?.(nav.origin)}
        >
          <LookupPairInput
            lookup={originLookup}
            value={party.origin}
            onChange={(v) => onChange({ origin: v })}
            onSelect={(v) => applyOriginCountry(v.id)}
            navOrder={nav.origin}
          />
        </FieldWrapper>
        <FieldWrapper
          borderLabel
          lookupSplit
          label="Company Name"
          required={companyRequired}
          invalid={invalidNavOrders?.has(nav.company)}
          error={fieldError?.(nav.company)}
        >
          <PartyContactLookup
            role={isConsignee ? "consignee" : "shipper"}
            value={party.companyName}
            onCompanyChange={(v) => onChange({ companyName: { ...v, name: clipText(v.name, 100) } })}
            compact
            splitCode
            manualSearch
            emptySearchMessage="Please enter a company name."
            noResultsMessage={AWB_LOOKUP_NO_RESULTS}
            navOrder={nav.company}
            onCommit={onCommit}
            onSelectContact={(c) => {
              const origin =
                c.origin.code || c.origin.name
                  ? { id: c.origin.id, code: c.origin.code, name: c.origin.name }
                  : party.origin;
              onChange({
                companyName: { id: c.id, code: c.code, name: c.name },
                contactName: c.contactName || c.name,
                address1: c.address1,
                address2: c.address2,
                pincode: c.pincode,
                city: c.city,
                state: c.state,
                telephone: c.telephone,
                mobileNo: c.mobileNo,
                email: c.email,
                documentType: c.documentType,
                documentNo: c.documentNo,
                iecNo: c.iecNo,
                origin,
              });
              applyOriginCountry(origin.id);
            }}
          />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper borderLabel label="Contact Name">
            <ErpNavInput
              order={nav.contact}
              className={inputClass}
              value={party.contactName}
              maxLength={100}
              onValueChange={(v) => onChange({ contactName: clipText(v, 100) })}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="Address 1" required={addressRequired} error={fieldError?.(nav.address1)}>
            <ErpNavInput
              order={nav.address1}
              className={inputClass}
              value={party.address1}
              maxLength={100}
              onValueChange={(v) => onChange({ address1: clipText(v, 100) })}
            />
          </FieldWrapper>
        </div>
        <FieldWrapper borderLabel label="Address 2">
          <ErpNavInput
            order={nav.address2}
            className={inputClass}
            value={party.address2}
            maxLength={100}
            onValueChange={(v) => onChange({ address2: clipText(v, 100) })}
          />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper borderLabel label="Pincode" required={addressRequired} error={fieldError?.(nav.pincode)}>
            <PincodeAutocomplete
              navOrder={nav.pincode}
              className={inputClass}
              placeholder=""
              value={party.pincode}
              countryCode={pincodeCountryCode}
              onValueChange={(v) => onChange({ pincode: v })}
              onSelect={(item) =>
                onChange({
                  pincode: item.pincode,
                  city: item.city,
                  state: item.state,
                })
              }
              onCommit={onPincodeCommit}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="City" required={addressRequired} error={fieldError?.(nav.city)}>
            <ErpNavInput
              order={nav.city}
              className={inputClass}
              value={party.city}
              maxLength={50}
              onValueChange={(v) => onChange({ city: clipText(v, 50) })}
            />
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper borderLabel label="State" required={addressRequired} error={fieldError?.(nav.state)}>
            <ErpNavInput
              order={nav.state}
              className={inputClass}
              value={party.state}
              maxLength={50}
              onValueChange={(v) => onChange({ state: clipText(v, 50) })}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="Telephone">
            <ErpNavInput
              order={nav.telephone}
              className={inputClass}
              value={party.telephone}
              maxLength={15}
              onValueChange={(v) => onChange({ telephone: clipText(v, 15) })}
            />
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper borderLabel label="Mobile No." required={phoneRequired} error={fieldError?.(nav.mobile)}>
            <ErpNavInput
              order={nav.mobile}
              className={inputClass}
              value={party.mobileNo}
              maxLength={15}
              onValueChange={(v) => onChange({ mobileNo: clipText(v, 15) })}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="E-Mail" error={fieldError?.(nav.email)}>
            <ErpNavInput
              order={nav.email}
              className={inputClass}
              value={party.email}
              maxLength={100}
              onValueChange={(v) => onChange({ email: clipText(v, 100) })}
            />
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper borderLabel label="Country" required={phoneRequired}>
            <ErpNavInput
              order={nav.country}
              className={`cursor-default bg-muted/40 ${inputClass}`}
              value={party.country}
              readOnly
              onValueChange={(v) => onChange({ country: v })}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="IEC No" error={fieldError?.(nav.iec)}>
            <ErpNavInput
              order={nav.iec}
              className={inputClass}
              value={party.iecNo}
              maxLength={10}
              onValueChange={(v) => onChange({ iecNo: clipText(v.toUpperCase(), 10) })}
              onBlur={() => {
                if (party.iecNo && party.iecNo.trim()) {
                  const res = validateDocumentId("IEC", party.iecNo, `${isConsignee ? "Consignee" : "Shipper"} IEC`);
                  if (!res.valid && res.message) {
                    toast.error(res.message);
                  }
                }
              }}
            />
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper borderLabel label="Document Type">
            <ErpNavSelect
              order={nav.docType}
              value={party.documentType || undefined}
              onValueChange={(v) => onChange({ documentType: v })}
              items={DOCUMENT_TYPES}
              nextOrder={nav.docNo}
              triggerClassName={inputClass}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="Document No.">
            <ErpNavInput
              order={nav.docNo}
              className={inputClass}
              value={party.documentNo}
              onValueChange={(v) => onChange({ documentNo: v.toUpperCase() })}
              onBlur={() => {
                if (party.documentType && party.documentNo && party.documentNo.trim()) {
                  const check = validateDocumentNoFormat(party.documentType, party.documentNo);
                  if (!check.valid && check.message) {
                    if (onValidationError) {
                      onValidationError(check.message);
                    } else {
                      toast.error(check.message);
                    }
                  } else {
                    const res = validateDocumentId(party.documentType, party.documentNo, `${isConsignee ? "Consignee" : "Shipper"} ${party.documentType}`);
                    if (!res.valid && res.message) {
                      toast.error(res.message);
                    }
                  }
                }
              }}
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
  invalidNavOrders,
  fieldError,
}: {
  form: AwbFullForm;
  setForm: React.Dispatch<React.SetStateAction<AwbFullForm>>;
  airlineRequired?: boolean;
  invalidNavOrders?: Set<number>;
  fieldError?: (order: number) => string | undefined;
}) {
  const onCommit = useErpNavCommit();
  const onVendorCommit = useErpNavCommit(AWB_NAV.VENDOR);
  const hasVendor = Boolean(
    form.vendor.id || form.vendor.code.trim() || form.vendor.name.trim(),
  );
  const inputClass = "h-9 px-2 text-[13px]";
  const skip = erpNavSkip();

  return (
    <FormSection title="Services Details">
      <div className="grid grid-cols-1 content-start gap-1.5">
        <FieldWrapper
          borderLabel
          lookupSplit
          label="Product"
          required
          invalid={invalidNavOrders?.has(AWB_NAV.PRODUCT)}
          error={fieldError?.(AWB_NAV.PRODUCT)}
        >
          <LookupPairInput
            lookup="product"
            value={form.product}
            onChange={(v) => setForm((f) => ({ ...f, product: v }))}
            navOrder={AWB_NAV.PRODUCT}
          />
        </FieldWrapper>
        <FieldWrapper
          borderLabel
          lookupSplit
          label="Vendor"
          required
          invalid={invalidNavOrders?.has(AWB_NAV.VENDOR)}
          error={fieldError?.(AWB_NAV.VENDOR)}
        >
          <LookupPairInput
            lookup="vendor"
            value={form.vendor}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                vendor: v,
                service: emptyPair(),
              }))
            }
            navOrder={AWB_NAV.VENDOR}
            onCommit={onVendorCommit}
          />
        </FieldWrapper>
        <FieldWrapper borderLabel lookupSplit label="Airline" required={airlineRequired}>
          <LookupPairInput
            lookup="airline"
            value={{ code: form.airline, name: form.airline }}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                airline: (v.name || v.code || "").trim(),
              }))
            }
          />
        </FieldWrapper>
        <div className="min-w-0">
          <FieldWrapper
            borderLabel
            lookupSplit
            label="Service"
            required
            invalid={invalidNavOrders?.has(AWB_NAV.SERVICE)}
            error={fieldError?.(AWB_NAV.SERVICE)}
          >
            <VendorServiceLookup
              vendor={form.vendor}
              value={form.service}
              onChange={(v) => setForm((f) => ({ ...f, service: v }))}
              productId={form.product.id}
              destinationId={form.consignee.origin.id}
              compact
              splitCode
              manualSearch
              noResultsMessage={AWB_LOOKUP_NO_RESULTS}
              navOrder={AWB_NAV.SERVICE}
              onCommit={onCommit}
            />
          </FieldWrapper>
          {hasVendor ? null : (
            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
              Select a Vendor to load mapped services.
            </p>
          )}
        </div>
        <FieldWrapper borderLabel label="Shipment Value">
          <div className="flex w-full min-w-0 items-stretch">
            <ErpNavInput
              order={AWB_NAV.SHIPMENT_VALUE}
              className={`min-w-0 flex-1 ${inputClass}`}
              value={form.shipmentValue}
              onValueChange={(v) => setForm((f) => ({ ...f, shipmentValue: decimalNumber(v) }))}
              onBlur={() => setForm((f) => ({ ...f, shipmentValue: formatMoney2(f.shipmentValue) }))}
            />
            <Select
              value={form.shipmentCurrency}
              onValueChange={(v) => setForm((f) => ({ ...f, shipmentCurrency: v }))}
            >
              <SelectTrigger
                className="h-8 w-16 shrink-0 rounded-none border-0 border-l border-input px-1 text-[13px] shadow-none focus:ring-0"
                {...skip}
              >
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
          </div>
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper borderLabel label="Pieces">
            <div className="flex w-full min-w-0 items-stretch">
              <ErpNavInput
                order={AWB_NAV.PIECES}
                className={`min-w-0 flex-1 ${inputClass}`}
                value={form.pieces}
                onValueChange={(v) => setForm((f) => ({ ...f, pieces: v }))}
              />
              <Select
                value={form.piecesUnit}
                onValueChange={(v) => setForm((f) => ({ ...f, piecesUnit: v }))}
              >
                <SelectTrigger
                  className="h-8 w-16 shrink-0 rounded-none border-0 border-l border-input px-1 text-[13px] shadow-none focus:ring-0"
                  {...skip}
                >
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
            </div>
          </FieldWrapper>
          <FieldWrapper borderLabel label="Actual Weight">
            <div className="flex w-full min-w-0 items-stretch">
              <ErpNavInput
                order={AWB_NAV.ACTUAL_WEIGHT}
                className={`min-w-0 flex-1 ${inputClass}`}
                value={form.actualWeight}
                onValueChange={(v) => setForm((f) => ({ ...f, actualWeight: v }))}
              />
              <Select
                value={form.weightUnit}
                onValueChange={(v) => setForm((f) => ({ ...f, weightUnit: v }))}
              >
                <SelectTrigger
                  className="h-8 w-14 shrink-0 rounded-none border-0 border-l border-input px-1 text-[13px] shadow-none focus:ring-0"
                  {...skip}
                >
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
            </div>
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldWrapper borderLabel label="Volumetric Weight">
            <ErpNavInput
              order={AWB_NAV.VOL_WEIGHT}
              className={inputClass}
              value={form.volWeight}
              onValueChange={(v) => setForm((f) => ({ ...f, volWeight: v }))}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="Charge Weight">
            <ErpNavInput
              order={AWB_NAV.CHARGE_WEIGHT}
              className={inputClass}
              value={form.chargeWeight}
              onValueChange={(v) => setForm((f) => ({ ...f, chargeWeight: v }))}
            />
          </FieldWrapper>
        </div>
        <div className="flex flex-nowrap items-center gap-2 pt-0.5">
          {(
            [
              ["commercial", "Commercial", AWB_NAV.COMMERCIAL],
              ["oda", "ODA", AWB_NAV.ODA],
              ["medicalCharges", "Medical Charges", AWB_NAV.MEDICAL],
            ] as const
          ).map(([key, label, order]) => {
            const checked = form[key];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={checked}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded border px-2.5 text-[12px] font-medium",
                  checked
                    ? "border-foreground bg-foreground text-background"
                    : "border-input bg-background text-foreground hover:bg-muted/40",
                )}
                onClick={() => {
                  if (key === "commercial") {
                    const nextCommercial = !form.commercial;
                    setForm((f) => {
                      let exportReason = f.proforma.exportReason;
                      let csbType = f.proforma.csbType;
                      if (nextCommercial) {
                        csbType = "CSB 5";
                        if (exportReason.toUpperCase().includes("GIFT") || !exportReason) {
                          exportReason = "SALE";
                        }
                      } else {
                        // When Commercial is unticked, do not auto-fill CSB 4 or gift defaults.
                        // Leave blank and require operator to choose.
                        csbType = "";
                        exportReason = "";
                      }
                      return {
                        ...f,
                        commercial: nextCommercial,
                        proforma: {
                          ...f.proforma,
                          csbType,
                          exportReason,
                        },
                      };
                    });
                  } else {
                    setForm((f) => ({ ...f, [key]: !f[key] }));
                  }
                }}
                {...erpNavOrder(order)}
              >
                <span
                  className={cn(
                    "grid h-3.5 w-3.5 place-content-center rounded-sm border",
                    checked ? "border-background bg-background text-foreground" : "border-input bg-background",
                  )}
                >
                  {checked ? <Check className="h-3 w-3" /> : null}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </FormSection>
  );
}

function ShipmentDetailsFields({
  form,
  setForm,
  paymentTypeReadOnly,
  clientLoading,
  isReadOnly,
  executiveBranchId,
  executiveLocation,
  fieldError,
}: {
  form: AwbFullForm;
  setForm: React.Dispatch<React.SetStateAction<AwbFullForm>>;
  paymentTypeReadOnly: boolean;
  clientLoading: boolean;
  isReadOnly: boolean;
  executiveBranchId?: string | null;
  executiveLocation?: string | null;
  fieldError?: (order: number) => string | undefined;
}) {
  const { onValueChange: onPaymentTypeChange, contentProps: paymentTypeSelectContentProps, itemProps: paymentTypeSelectItemProps } =
    useErpSelectNav((v: string) => setForm((f) => ({ ...f, paymentType: v })), {
      fromOrder: AWB_NAV.PAYMENT_TYPE,
    });
  const inputClass = "h-9 px-2 text-[13px]";

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4 [&_label]:whitespace-nowrap [&_label]:text-[11px]">
      <div className="min-w-0">
        <FieldWrapper borderLabel label="Payment Type">
          <Select
            value={form.paymentType || undefined}
            onValueChange={onPaymentTypeChange}
            disabled={isReadOnly || paymentTypeReadOnly || clientLoading}
          >
            <SelectTrigger
              {...erpNavOrder(AWB_NAV.PAYMENT_TYPE)}
              className="h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent {...paymentTypeSelectContentProps}>
              {PAYMENT_TYPES.map((p) => (
                <SelectItem key={p} value={p} {...paymentTypeSelectItemProps}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
        {paymentTypeReadOnly ? (
          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
            Locked to Client Master. Enable “Allow Payment Type Override” in Form Setup to edit.
          </p>
        ) : null}
      </div>
      <FieldWrapper borderLabel label="Content">
        <ErpNavInput
          order={AWB_NAV.CONTENT}
          className={inputClass}
          value={form.content}
          onValueChange={(v) => setForm((f) => ({ ...f, content: v }))}
        />
      </FieldWrapper>
      <FieldWrapper borderLabel label="Instruction">
        <ErpNavInput
          order={AWB_NAV.INSTRUCTION}
          className={inputClass}
          value={form.instruction}
          onValueChange={(v) => setForm((f) => ({ ...f, instruction: v }))}
        />
      </FieldWrapper>
      <FieldWrapper borderLabel lookupSplit label="Field Executive">
        <LookupPairInput
          lookup="fieldExecutive"
          value={form.fieldExecutive}
          onChange={(v) => setForm((f) => ({ ...f, fieldExecutive: v }))}
          navOrder={AWB_NAV.FIELD_EXECUTIVE}
          branchId={executiveBranchId}
          locationCode={executiveLocation}
        />
      </FieldWrapper>
      <FieldWrapper borderLabel label="Cash Receipt No." error={fieldError?.(AWB_NAV.CASH_RECEIPT_NO)}>
        <ErpNavInput
          order={AWB_NAV.CASH_RECEIPT_NO}
          className={inputClass}
          value={form.cashReceiptNo}
          onValueChange={(v) => setForm((f) => ({ ...f, cashReceiptNo: v }))}
        />
      </FieldWrapper>
      <FieldWrapper borderLabel label="Amount Received" error={fieldError?.(AWB_NAV.AMOUNT_RECEIVED)}>
        <ErpNavInput
          order={AWB_NAV.AMOUNT_RECEIVED}
          className={inputClass}
          value={form.amountReceived}
          onValueChange={(v) => setForm((f) => ({ ...f, amountReceived: decimalNumber(v) }))}
          onBlur={() => setForm((f) => ({ ...f, amountReceived: formatMoney2(f.amountReceived) }))}
        />
      </FieldWrapper>
      <FieldWrapper borderLabel label="Balance Amount">
        <ErpNavInput
          order={AWB_NAV.BALANCE_AMOUNT}
          readOnly
          className={inputClass}
          value={form.balanceAmount}
          onValueChange={() => undefined}
        />
      </FieldWrapper>
      <FieldWrapper borderLabel label="Cash Receipt Date" error={fieldError?.(AWB_NAV.CASH_RECEIPT_DATE)}>
        <ErpNavDateInput
          order={AWB_NAV.CASH_RECEIPT_DATE}
          className={inputClass}
          value={form.cashReceiptDate}
          onValueChange={(v) => setForm((f) => ({ ...f, cashReceiptDate: v }))}
        />
      </FieldWrapper>
      <FieldWrapper borderLabel label="Expected Delivery Date" error={fieldError?.(AWB_NAV.EXPECTED_DELIVERY)}>
        <ErpNavDateInput
          order={AWB_NAV.EXPECTED_DELIVERY}
          className={inputClass}
          value={form.expectedDeliveryDate}
          onValueChange={(v) => setForm((f) => ({ ...f, expectedDeliveryDate: v }))}
        />
      </FieldWrapper>
    </div>
  );
}

function AwbFormFooter({
  showPrevious = true,
  onPrevious,
  onSave,
  onNext,
  onCancel,
  readOnly = false,
  saving = false,
  saveLabel = "Save",
}: {
  showPrevious?: boolean;
  onPrevious?: () => void;
  onSave: () => void;
  onNext?: () => void;
  onCancel: () => void;
  readOnly?: boolean;
  saving?: boolean;
  saveLabel?: "Save" | "Update";
}) {
  const showSave = saveLabel === "Update" || !readOnly;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {showPrevious && onPrevious ? (
          <Button className="h-11 min-w-32 rounded-full bg-amber-600 px-8 text-sm text-white shadow-sm hover:bg-amber-700" onClick={onPrevious} disabled={saving}>
            Previous
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        {showSave ? (
          <Button
            onClick={onSave}
            disabled={saving || readOnly}
            title={readOnly ? "Unlock this AWB before saving it" : undefined}
            className="h-11 min-w-32 rounded-full bg-emerald-600 px-8 text-sm text-white shadow-sm hover:bg-emerald-600/90"
            {...erpNavOrder(AWB_NAV.FOOTER_SAVE)}
          >
            {saveLabel}
          </Button>
        ) : null}
        {onNext ? (
          <Button
            className="h-11 min-w-32 rounded-full bg-sidebar px-8 text-sm text-sidebar-foreground shadow-sm hover:bg-sidebar/90 hover:text-sidebar-foreground"
            onClick={onNext}
            disabled={saving}
            {...erpNavOrder(AWB_NAV.FOOTER_NEXT)}
          >
            Next
          </Button>
        ) : null}
        <Button
          variant="destructive"
          className="h-11 min-w-32 rounded-full px-8 text-sm shadow-sm"
          onClick={onCancel}
          disabled={saving}
          {...erpNavOrder(AWB_NAV.FOOTER_CLOSE)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  borderLabel,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  borderLabel?: boolean;
}) {
  const toggle = (
    <div
      className={cn(
        "flex w-full min-w-0 items-stretch overflow-hidden",
        !borderLabel && "h-9 rounded-md border",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "h-8 flex-1 rounded-none px-2 text-[13px]",
          !borderLabel && "h-9",
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
          "h-8 flex-1 rounded-none border-l px-2 text-[13px]",
          !borderLabel && "h-9",
          !value
            ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
            : "text-muted-foreground hover:bg-muted/60",
        )}
        onClick={() => onChange(false)}
      >
        No
      </Button>
    </div>
  );

  if (borderLabel) {
    return (
      <FieldWrapper borderLabel label={label}>
        {toggle}
      </FieldWrapper>
    );
  }

  return <FieldWrapper label={label}>{toggle}</FieldWrapper>;
}

function LookupPairInput({
  value,
  onChange,
  lookup,
  disabled,
  navOrder,
  onCommit: onCommitProp,
  onSelect,
  emptySearchMessage,
  noResultsMessage = AWB_LOOKUP_NO_RESULTS,
  minChars = 1,
  displayVariant,
  branchId,
  locationCode,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
  disabled?: boolean;
  navOrder?: number;
  onCommit?: () => void;
  onSelect?: (v: LookupPair) => void;
  emptySearchMessage?: string;
  noResultsMessage?: string;
  minChars?: number;
  displayVariant?: LookupDisplayVariant;
  branchId?: string | null;
  locationCode?: string | null;
}) {
  const defaultCommit = useErpNavCommit();
  const onCommit = onCommitProp ?? defaultCommit;
  return (
    <SearchableLookupPair
      value={value}
      onChange={onChange}
      onSelect={onSelect}
      lookup={lookup}
      disabled={disabled}
      compact
      splitCode
      manualSearch
      minChars={minChars}
      branchId={branchId}
      locationCode={locationCode}
      navOrder={navOrder}
      onCommit={onCommit}
      emptySearchMessage={emptySearchMessage}
      noResultsMessage={noResultsMessage}
      displayVariant={displayVariant}
      namePlaceholder=""
      codePlaceholder=""
      searchPlaceholder=""
    />
  );
}

