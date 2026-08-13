import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Filter,
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  Printer,
  MoreVertical,
  ChevronDown,
  FilePlus,
  Mail,
  FileImage,
  Tag,
  UserRound,
  Radio,
  CloudDownload,
  Loader2,
  Paperclip,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { parseTabularFile } from "@/lib/io/tableIo";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import {
  FieldWrapper,
  IconButton,
  IconTooltipBubble,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
  downloadCsv,
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import {
  cancelManifest,
  closeManifest,
  fetchManifestChildren,
  fetchShipmentForManifestScan,
  listManifests,
  recordManifestProgress,
  saveManifest,
  uploadManifestAttachment,
} from "@/lib/transactions/resources/manifests";
import {
  dbManifestToListRow,
  uiFormToManifestPayload,
} from "@/lib/transactions/manifestUiMap";

type LookupPair = { code: string; name: string };

type ManifestLine = {
  id: string;
  shipmentId?: string;
  awbNo: string;
  refNo: string;
  forwardingNo: string;
  crnMhbsNo: string;
  bagNo: string;
  pieces: string;
  chargeWeight: string;
  bookDate: string;
  origin: string;
  destination: string;
  code: string;
  customer: string;
  consignee: string;
  instruction: string;
};

type ManifestAttachmentItem = {
  fileId: string;
  label: string;
  originalName?: string | null;
  sizeBytes?: number | null;
};

type ManifestForm = {
  manifestNo: string;
  manifestDate: string;
  manifestTime: string;
  manifestToServiceCenter: boolean;
  destinationServiceCenter: LookupPair;
  vendor: LookupPair;
  setupMode: string;
  masterAwbNo: string;
  obcName: LookupPair;
  cdNo: string;
  totalNoOfBags: string;
  vendorWeight: string;
  referenceNo: string;
  flight1: LookupPair;
  flight2: LookupPair;
  departure: string;
  arrival: string;
  remark: string;
  flight: LookupPair;
  location: string;
  serviceCentre: string;
  connectStation: string;
  lines: ManifestLine[];
  attachments: ManifestAttachmentItem[];
};

type ManifestRow = ManifestForm & { id: string; rowVersion?: number; status?: string };

type LineDraft = {
  bagNo: string;
  bagType: "Bags" | "Cartoon";
  crnMhbsNo: string;
  forwardingNo: string;
  awbNo: string;
  repeat: boolean;
};

type ColFilterKey =
  | "manifestNo"
  | "masterAwbNo"
  | "date"
  | "location"
  | "serviceCentre"
  | "connectStation"
  | "vendor";

type ReportFilters = {
  product: LookupPair;
  vendor: LookupPair;
  format: string;
  excel: boolean;
};

type GenerateFilters = {
  fromDate: string;
  toDate: string;
  origin: LookupPair;
  serviceCentre: LookupPair;
  product: LookupPair;
  vendor: LookupPair;
  service: LookupPair;
  destination: LookupPair;
  customer: LookupPair;
};

type GenerateHeader = {
  manifestNo: string;
  manifestDate: string;
  manifestToServiceCenter: boolean;
  serviceCentre: LookupPair;
  vendor: LookupPair;
};

type AwbCandidate = {
  id: string;
  awbNo: string;
  refNo: string;
  bagNo: string;
  bookDate: string;
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  code: string;
  customer: string;
  consignee: string;
  pieces: string;
  chargeWeight: string;
  instruction: string;
  productCode: string;
  vendorCode: string;
  customerCode: string;
};

type CrnLabelForm = {
  date: string;
  flightNo: LookupPair;
  origin: string;
  destination: LookupPair;
  fromName: LookupPair;
  fromAddress1: string;
  fromAddress2: string;
  fromCity: string;
  fromState: string;
  fromPinCode: string;
  fromMobile: string;
  fromTel: string;
  toName: LookupPair;
  toAddress1: string;
  toAddress2: string;
  toCity: string;
  toState: string;
  toPinCode: string;
  toMobile: string;
  toTel: string;
  masterAwbNo: string;
  cdNo: string;
  remarks: string;
  noOfBags: string;
};

type ProgressForm = {
  bagNo: string;
  progressDate: string;
  progressTime: string;
  serviceCentre: LookupPair;
  exception: LookupPair;
};

type ProgressMode = "add" | "delete";

type DownloadAllForm = {
  selectType: string;
  fromBagNo: string;
  toBagNo: string;
};

const DOWNLOAD_ALL_TYPES = ["AWBNo", "Forwarding No 1", "Forwarding No 2"] as const;

const FORMAT_OPTIONS = ["Single Line", "MultiLine"] as const;
const SETUP_OPTIONS = ["Select", "Forwarding No.", "AWB No."] as const;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => new Date().toISOString().slice(0, 10);

const nowManifestTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const emptyLineDraft = (prev?: Partial<LineDraft>): LineDraft => ({
  bagNo: prev?.repeat ? prev.bagNo ?? "" : "",
  bagType: prev?.repeat ? prev.bagType ?? "Bags" : "Bags",
  crnMhbsNo: prev?.repeat ? prev.crnMhbsNo ?? "" : "",
  forwardingNo: "",
  awbNo: "",
  repeat: prev?.repeat ?? false,
});

const emptyForm = (branchCode = "HYD"): ManifestForm => ({
  manifestNo: "0",
  manifestDate: todayIso(),
  manifestTime: nowManifestTime(),
  manifestToServiceCenter: true,
  destinationServiceCenter: emptyPair(),
  vendor: emptyPair(),
  setupMode: "Select",
  masterAwbNo: "",
  obcName: emptyPair(),
  cdNo: "",
  totalNoOfBags: "0",
  vendorWeight: "0.000",
  referenceNo: "",
  flight1: emptyPair(),
  flight2: emptyPair(),
  departure: "",
  arrival: "",
  remark: "",
  flight: emptyPair(),
  location: branchCode,
  serviceCentre: "",
  connectStation: "",
  lines: [],
  attachments: [],
});

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  manifestNo: "",
  masterAwbNo: "",
  date: "",
  location: "",
  serviceCentre: "",
  connectStation: "",
  vendor: "",
});

const emptyReportFilters = (): ReportFilters => ({
  product: emptyPair(),
  vendor: emptyPair(),
  format: "Single Line",
  excel: false,
});

const emptyGenerateFilters = (branchCode = "HYD", branchName = "HYDERABAD"): GenerateFilters => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  origin: { code: branchCode, name: branchName },
  serviceCentre: { code: branchCode, name: branchName },
  product: emptyPair(),
  vendor: emptyPair(),
  service: emptyPair(),
  destination: emptyPair(),
  customer: emptyPair(),
});

const emptyGenerateHeader = (): GenerateHeader => ({
  manifestNo: "",
  manifestDate: todayIso(),
  manifestToServiceCenter: true,
  serviceCentre: emptyPair(),
  vendor: emptyPair(),
});

const emptyCrnForm = (): CrnLabelForm => ({
  date: todayIso(),
  flightNo: emptyPair(),
  origin: "HYD",
  destination: emptyPair(),
  fromName: emptyPair(),
  fromAddress1: "",
  fromAddress2: "",
  fromCity: "",
  fromState: "",
  fromPinCode: "",
  fromMobile: "",
  fromTel: "",
  toName: emptyPair(),
  toAddress1: "",
  toAddress2: "",
  toCity: "",
  toState: "",
  toPinCode: "",
  toMobile: "",
  toTel: "",
  masterAwbNo: "",
  cdNo: "",
  remarks: "",
  noOfBags: "",
});

const emptyProgressForm = (): ProgressForm => ({
  bagNo: "",
  progressDate: todayIso(),
  progressTime: nowManifestTime(),
  serviceCentre: emptyPair(),
  exception: emptyPair(),
});

const emptyDownloadAllForm = (): DownloadAllForm => ({
  selectType: "AWBNo",
  fromBagNo: "",
  toBagNo: "",
});

const crnFormFromRow = (row: ManifestRow): CrnLabelForm => ({
  ...emptyCrnForm(),
  date: row.manifestDate,
  origin: row.location || "HYD",
  destination: {
    code: row.destinationServiceCenter.code,
    name: row.connectStation || row.destinationServiceCenter.name,
  },
  fromName: { code: row.location, name: row.destinationServiceCenter.name || row.location },
  toName: { code: row.vendor.code, name: row.vendor.name },
  masterAwbNo: row.masterAwbNo,
  noOfBags: String(row.lines.length || ""),
});

const SEED_AWB_CANDIDATES: Omit<AwbCandidate, "id">[] = [
  { awbNo: "30403918", refNo: "REF30403918", bagNo: "", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "AUSTRALIA", destinationCode: "AU", code: "TPCADDA", customer: "TPC ADDANKI", consignee: "ELURI SIVARAMAKRISHNA", pieces: "1", chargeWeight: "36.0", instruction: "", productCode: "SPX", vendorCode: "DTAU", customerCode: "TPCADDA" },
  { awbNo: "30403919", refNo: "REF30403919", bagNo: "", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "USA", destinationCode: "US", code: "UDAYEXP", customer: "FEDEX INTERNATIONAL COURIER", consignee: "JOHN SMITH", pieces: "1", chargeWeight: "26.8", instruction: "", productCode: "SPX", vendorCode: "UPS", customerCode: "UDAYEXP" },
  { awbNo: "30403920", refNo: "REF30403920", bagNo: "", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "AUSTRALIA", destinationCode: "AU", code: "HYDEXP", customer: "HYDERABAD EXPORTS", consignee: "DAVID WILSON", pieces: "2", chargeWeight: "18.5", instruction: "", productCode: "SPX", vendorCode: "DHE", customerCode: "HYDEXP" },
  { awbNo: "30403921", refNo: "REF30403921", bagNo: "BAG001", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "USA", destinationCode: "US", code: "METRO01", customer: "METRO LOGISTICS", consignee: "ANNE MARTIN", pieces: "1", chargeWeight: "42.3", instruction: "Handle with care", productCode: "SPX", vendorCode: "DHL1", customerCode: "METRO01" },
  { awbNo: "30403922", refNo: "REF30403922", bagNo: "", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "AUSTRALIA", destinationCode: "AU", code: "SUNRISE", customer: "SUNRISE COURIER CLIENT", consignee: "MICHAEL BROWN", pieces: "1", chargeWeight: "15.2", instruction: "", productCode: "SPX", vendorCode: "DTAU", customerCode: "SUNRISE" },
  { awbNo: "30403923", refNo: "REF30403923", bagNo: "", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "USA", destinationCode: "US", code: "AIHAN01", customer: "AIHAN ENTERPRISES", consignee: "SARAH JOHNSON", pieces: "3", chargeWeight: "31.0", instruction: "", productCode: "SPX", vendorCode: "UPS", customerCode: "AIHAN01" },
  { awbNo: "30403924", refNo: "REF30403924", bagNo: "BAG002", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "AUSTRALIA", destinationCode: "AU", code: "GLOBAL1", customer: "GLOBAL TRADERS PVT LTD", consignee: "ROBERT TAYLOR", pieces: "1", chargeWeight: "22.7", instruction: "", productCode: "SPX", vendorCode: "DHE", customerCode: "GLOBAL1" },
  { awbNo: "30403925", refNo: "REF30403925", bagNo: "", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "USA", destinationCode: "US", code: "TPCADDA", customer: "TPC ADDANKI", consignee: "LINDA DAVIS", pieces: "1", chargeWeight: "19.4", instruction: "", productCode: "SPX", vendorCode: "DHL1", customerCode: "TPCADDA" },
  { awbNo: "30403926", refNo: "REF30403926", bagNo: "", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "AUSTRALIA", destinationCode: "AU", code: "UDAYEXP", customer: "FEDEX INTERNATIONAL COURIER", consignee: "JAMES ANDERSON", pieces: "2", chargeWeight: "28.6", instruction: "", productCode: "SPX", vendorCode: "DTAU", customerCode: "UDAYEXP" },
  { awbNo: "30403927", refNo: "REF30403927", bagNo: "", bookDate: "2026-07-04", origin: "HYDERABAD", originCode: "HYD", destination: "USA", destinationCode: "US", code: "HYDEXP", customer: "HYDERABAD EXPORTS", consignee: "PATRICIA WHITE", pieces: "1", chargeWeight: "33.1", instruction: "", productCode: "SPX", vendorCode: "UPS", customerCode: "HYDEXP" },
];

const seedAwbCandidates = (): AwbCandidate[] =>
  SEED_AWB_CANDIDATES.map((r) => ({ id: crypto.randomUUID(), ...r }));

const manifestCol = {
  manifestNo: "max-w-0 truncate",
  masterAwbNo: "max-w-0 truncate",
  date: "max-w-0 truncate whitespace-nowrap",
  location: "max-w-0 truncate",
  serviceCentre: "max-w-0 truncate",
  connectStation: "max-w-0 truncate",
  vendor: "max-w-0 truncate",
  action: "w-[138px] whitespace-nowrap text-center",
  actionCell: "whitespace-nowrap text-center px-1",
  filter: "h-7 w-full min-w-0 text-xs",
} as const;

const SEED_MANIFESTS: ManifestForm[] = [
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1001", manifestDate: "2026-07-04", manifestTime: "1432", manifestToServiceCenter: false, destinationServiceCenter: { code: "HYD", name: "HYD" }, vendor: { code: "WFT", name: "WORLD FRIEGT TRANSPORTATION" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "DESTINATION", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1002", manifestDate: "2026-07-04", manifestTime: "1610", manifestToServiceCenter: true, destinationServiceCenter: { code: "HYD", name: "HYDERABAD" }, vendor: { code: "FEDEX", name: "FEDEX" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "HYDERABAD", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1003", manifestDate: "2026-07-04", manifestTime: "1555", manifestToServiceCenter: true, destinationServiceCenter: { code: "USA", name: "USA" }, vendor: { code: "DHL1", name: "DHL LSPS" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "USA", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1004", manifestDate: "2026-07-04", manifestTime: "1540", manifestToServiceCenter: false, destinationServiceCenter: { code: "UK", name: "UNITED KINGDOM" }, vendor: { code: "DHE", name: "FEDEX DL" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "UNITED KINGDOM", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1005", manifestDate: "2026-07-04", manifestTime: "1525", manifestToServiceCenter: true, destinationServiceCenter: { code: "HYD", name: "HYD" }, vendor: { code: "DTAU", name: "DTDC AUSTRALIA" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "DESTINATION", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1006", manifestDate: "2026-07-04", manifestTime: "1510", manifestToServiceCenter: true, destinationServiceCenter: { code: "BOM", name: "MUMBAI" }, vendor: { code: "BLUE", name: "BLUEDART" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "HYDERABAD", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1007", manifestDate: "2026-07-04", manifestTime: "1455", manifestToServiceCenter: true, destinationServiceCenter: { code: "SYD", name: "SYDNEY" }, vendor: { code: "DHL", name: "DHL EXPRESS (I) PVT LTD" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "USA", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1008", manifestDate: "2026-07-04", manifestTime: "1440", manifestToServiceCenter: true, destinationServiceCenter: { code: "HYD", name: "HYD" }, vendor: { code: "COUR", name: "COURIERWALA" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "DESTINATION", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1009", manifestDate: "2026-07-04", manifestTime: "1425", manifestToServiceCenter: false, destinationServiceCenter: { code: "MEL", name: "MELBOURNE" }, vendor: { code: "ARX", name: "ARAMEX" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "UNITED KINGDOM", lines: [] },
  { ...emptyForm(), manifestNo: "HYD/HYD/2026/1010", manifestDate: "2026-07-04", manifestTime: "1410", manifestToServiceCenter: true, destinationServiceCenter: { code: "HYD", name: "HYD" }, vendor: { code: "CAPI", name: "CAPTAIN INDIA" }, setupMode: "Select", masterAwbNo: "", location: "HYD", serviceCentre: "", connectStation: "HYDERABAD", lines: [] },
];

const seedRows = (): ManifestRow[] =>
  SEED_MANIFESTS.map((r) => ({ id: crypto.randomUUID(), ...r }));

const candidateToLine = (a: Omit<AwbCandidate, "id">): ManifestLine => ({
  id: crypto.randomUUID(),
  awbNo: a.awbNo,
  refNo: a.refNo,
  forwardingNo: `FWD${a.awbNo}`,
  crnMhbsNo: "",
  bagNo: a.bagNo,
  pieces: a.pieces,
  chargeWeight: a.chargeWeight,
  bookDate: formatDisplayDate(a.bookDate),
  origin: a.originCode,
  destination: a.destination,
  code: a.code,
  customer: a.customer,
  consignee: a.consignee,
  instruction: a.instruction,
});

const seedEditLines = (): ManifestLine[] =>
  Array.from({ length: 4 }, () => SEED_AWB_CANDIDATES.map(candidateToLine)).flat();

const formLineCols = [
  "AWB No.", "Ref No.", "Forwarding No.", "CRN MHBS No", "Bag No.", "Pieces",
  "Charge Weight", "Book Date", "Origin", "Destination", "Code", "Customer", "Consignee", "Instruction",
] as const;

const listDisplay = (r: ManifestRow) => ({
  manifestNo: r.manifestNo,
  masterAwbNo: r.masterAwbNo,
  date: formatDisplayDate(r.manifestDate),
  location: r.location,
  serviceCentre: r.serviceCentre,
  connectStation: r.connectStation,
  vendor: r.vendor.name || r.vendor.code,
});

export const Route = createFileRoute("/transaction/manifest-scan")({
  head: () => ({
    meta: [
      { title: "Manifest Scan — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage outbound manifest scans." },
    ],
  }),
  component: ManifestScanPage,
});

function ManifestScanPage() {
  const { isAuthenticated: authed, profile } = useAuth();
  const queryClient = useQueryClient();

  const userBranchQuery = useQuery({
    queryKey: ["userBranch", profile?.home_branch_id],
    queryFn: async () => {
      if (!profile?.home_branch_id) return null;
      const { data, error } = await supabase
        .from("branches")
        .select("id, code, name")
        .eq("id", profile.home_branch_id)
        .maybeSingle();
      if (error || !data) return null;
      return data as { id: string; code: string; name: string };
    },
    enabled: Boolean(authed && profile?.home_branch_id),
  });

  const defaultBranchCode =
    userBranchQuery.data?.code ||
    (profile as unknown as { branchCode?: string })?.branchCode ||
    "HYD";
  const defaultBranchName =
    userBranchQuery.data?.name || defaultBranchCode;

  const [demoRows, setDemoRows] = useState<ManifestRow[]>(seedRows);
  const [colFilters, setColFilters] = useState(emptyColFilters());
  const [reportFilters, setReportFilters] = useState<ReportFilters>(emptyReportFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editing, setEditing] = useState<ManifestRow | null>(null);
  const [form, setForm] = useState<ManifestForm>(() => emptyForm(defaultBranchCode));
  const [lineDraft, setLineDraft] = useState<LineDraft>(emptyLineDraft);
  const [scanning, setScanning] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ManifestRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [generateHeader, setGenerateHeader] = useState<GenerateHeader>(emptyGenerateHeader);
  const [generateFilters, setGenerateFilters] = useState<GenerateFilters>(() =>
    emptyGenerateFilters(defaultBranchCode, defaultBranchName),
  );
  const [generateResults, setGenerateResults] = useState<AwbCandidate[]>([]);
  const [selectedAwbs, setSelectedAwbs] = useState<Set<string>>(new Set());
  const [crnOpen, setCrnOpen] = useState(false);
  const [crnForm, setCrnForm] = useState<CrnLabelForm>(emptyCrnForm);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressManifest, setProgressManifest] = useState<ManifestRow | null>(null);
  const [progressMode, setProgressMode] = useState<ProgressMode>("add");
  const [progressForm, setProgressForm] = useState<ProgressForm>(emptyProgressForm);
  const [downloadAllOpen, setDownloadAllOpen] = useState(false);
  const [downloadAllRow, setDownloadAllRow] = useState<ManifestRow | null>(null);
  const [downloadAllForm, setDownloadAllForm] = useState<DownloadAllForm>(emptyDownloadAllForm);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    open: boolean;
    total: number;
    accepted: number;
    skipped: { awb: string; reason: string }[];
  } | null>(null);

  const liveQuery = useQuery({
    queryKey: ["manifests", "list", search],
    queryFn: () => listManifests({ pageSize: 500, search: search.trim() || undefined }),
    enabled: authed,
  });

  const rows: ManifestRow[] = authed
    ? (liveQuery.data?.rows ?? []).map((r) => dbManifestToListRow(r) as ManifestRow)
    : demoRows;

  const refreshLive = async () => {
    await queryClient.invalidateQueries({ queryKey: ["manifests"] });
  };

  const formStatus = editing?.status ?? (showForm && !editing ? "DRAFT" : undefined);
  const isReadOnly = Boolean(formStatus && formStatus !== "DRAFT");
  const canCloseManifest = Boolean(editing && formStatus === "DRAFT");

  const nextManifestNo = useMemo(() => {
    const nums = rows
      .map((r) => {
        const part = r.manifestNo.split("/").pop();
        return part ? Number.parseInt(part, 10) : NaN;
      })
      .filter((n) => !Number.isNaN(n));
    const next = nums.length === 0 ? 1001 : Math.max(...nums) + 1;
    return `HYD/HYD/2026/${next}`;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const display = listDisplay(r);
      if (q && !Object.values(display).join(" ").toLowerCase().includes(q)) return false;
      for (const key of Object.keys(colFilters) as ColFilterKey[]) {
        const val = colFilters[key].trim().toLowerCase();
        if (val && !display[key].toLowerCase().includes(val)) return false;
      }
      if (reportFilters.product.code && r.destinationServiceCenter.code !== reportFilters.product.code) return false;
      if (reportFilters.vendor.code && r.vendor.code !== reportFilters.vendor.code) return false;
      return true;
    });
  }, [rows, search, colFilters, reportFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(defaultBranchCode));
    setLineDraft(emptyLineDraft());
    setDetailsOpen(true);
    setShowForm(true);
  };

  const openEdit = async (row: ManifestRow) => {
    if (authed) {
      try {
        const full = (liveQuery.data?.rows ?? []).find((r) => r.id === row.id);
        if (!full) {
          toast.error("Manifest not found");
          return;
        }
        const children = await fetchManifestChildren(row.id);
        const mapped = dbManifestToListRow(full);
        mapped.lines = children.lines.map((l, i) => ({
          id: `${row.id}-${i}`,
          shipmentId: l.shipment_id,
          awbNo: l.awb_no,
          refNo: l.reference_no ?? "",
          forwardingNo: l.forwarding_no ?? "",
          crnMhbsNo: l.crn_mhbs_no ?? "",
          bagNo: l.bag_no ?? "",
          pieces: String(l.pieces ?? ""),
          chargeWeight: String(l.charge_weight ?? ""),
          bookDate: l.book_date ?? "",
          origin: l.origin_name || l.origin_code || "",
          destination: l.destination_name || l.destination_code || "",
          code: l.customer_code ?? "",
          customer: l.customer_name ?? "",
          consignee: l.consignee_name ?? "",
          instruction: l.instruction ?? "",
        }));
        mapped.attachments = children.attachments.map((a) => ({
          fileId: a.file_id,
          label: a.label || "Signed Manifest Copy",
          originalName: a.original_name,
          sizeBytes: a.size_bytes,
        }));
        setEditing(mapped as ManifestRow);
        const { id: _id, rowVersion: _rv, status: _st, ...rest } = mapped;
        setForm({ ...emptyForm(), ...rest });
        setLineDraft(emptyLineDraft());
        setDetailsOpen(true);
        setShowForm(true);
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      return;
    }
    setEditing(row);
    const { id: _id, ...rest } = row;
    const lines = rest.lines.length > 0 ? rest.lines : seedEditLines();
    setForm({
      ...emptyForm(),
      ...rest,
      lines,
      totalNoOfBags: rest.totalNoOfBags || "0",
      vendorWeight: rest.vendorWeight || "0.000",
    });
    setLineDraft(emptyLineDraft());
    setDetailsOpen(true);
    setShowForm(true);
  };

  const openClone = (row: ManifestRow) => {
    setEditing(null);
    const { id: _id, manifestNo: _no, ...rest } = row;
    setForm({ ...rest, manifestNo: "0", lines: row.lines.map((l) => ({ ...l, id: crypto.randomUUID() })) });
    setLineDraft(emptyLineDraft());
    setDetailsOpen(true);
    setShowForm(true);
    toast.success("Manifest cloned — save to create new record");
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    setLineDraft(emptyLineDraft());
  };

  const handleSave = async () => {
    if (isReadOnly) return toast.error("Only DRAFT manifests can be edited");
    if (!form.manifestDate) return toast.error("Manifest Date is required");

    if (authed) {
      setSaving(true);
      try {
        const { fields, lines, attachments } = uiFormToManifestPayload(form);
        const saved = await saveManifest({
          id: editing?.id ?? null,
          rowVersion: editing?.rowVersion ?? null,
          fields,
          lines,
          attachments,
        });
        await refreshLive();
        toast.success(editing ? "Manifest updated" : `Manifest ${saved.manifest_no} saved (DRAFT)`);
        closeForm();
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    const manifestNo = editing ? form.manifestNo : nextManifestNo;
    const payload: ManifestForm = {
      ...form,
      manifestNo,
      location: form.location || "HYD",
      connectStation: form.connectStation || form.destinationServiceCenter.name,
      serviceCentre: form.destinationServiceCenter.code,
    };
    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...payload, id: editing.id, rowVersion: r.rowVersion, status: r.status ?? "DRAFT" }
            : r,
        ),
      );
      toast.success("Manifest updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), status: "DRAFT", ...payload }, ...prev]);
      toast.success("Manifest saved");
    }
    closeForm();
  };

  const handleCloseManifest = async () => {
    if (!editing?.id || !canCloseManifest) return;
    if (authed) {
      setSaving(true);
      try {
        const { fields, lines, attachments } = uiFormToManifestPayload(form);
        const saved = await saveManifest({
          id: editing.id,
          rowVersion: editing.rowVersion ?? null,
          fields,
          lines,
          attachments,
        });
        const closed = await closeManifest({ id: saved.id, rowVersion: saved.row_version });
        await refreshLive();
        toast.success(`Manifest ${closed.manifest_no} closed`);
        closeForm();
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }
    setDemoRows((prev) =>
      prev.map((r) => (r.id === editing.id ? { ...r, ...form, status: "CLOSED" } : r)),
    );
    toast.success("Manifest closed");
    closeForm();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (authed) {
      try {
        await cancelManifest({
          id: deleteTarget.id,
          rowVersion: deleteTarget.rowVersion ?? 1,
          reason: "Cancelled from Manifest Scan",
        });
        await refreshLive();
        toast.success(`Cancelled manifest ${deleteTarget.manifestNo}`);
      } catch (e) {
        toast.error(toErrorMessage(e));
        return;
      } finally {
        setDeleteTarget(null);
      }
      return;
    }
    setDemoRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted manifest ${deleteTarget.manifestNo}`);
    setDeleteTarget(null);
  };

  const exportManifestRowCsv = (row: ManifestRow, linesOverride?: ManifestLine[]) => {
    const d = listDisplay(row);
    const safeName = row.manifestNo.replace(/\//g, "-");
    const lineHeaders = [...formLineCols];
    const lines = linesOverride ?? (row.lines.length > 0 ? row.lines : []);

    if (lines.length > 0) {
      downloadCsv(
        `${safeName}.csv`,
        lineHeaders,
        lines.map((l) => [
          l.awbNo, l.refNo, l.forwardingNo, l.crnMhbsNo, l.bagNo, l.pieces, l.chargeWeight,
          l.bookDate, l.origin, l.destination, l.code, l.customer, l.consignee, l.instruction,
        ]),
      );
    } else {
      downloadCsv(
        `${safeName}.csv`,
        ["Manifest No", "Master AWBNo", "Date", "Location", "Service Centre", "Connect Station", "Vendor"],
        [[d.manifestNo, d.masterAwbNo, d.date, d.location, d.serviceCentre, d.connectStation, d.vendor]],
      );
    }
    toast.success(`Exported ${safeName}.csv`);
  };

  const openDownloadAll = (row: ManifestRow) => {
    setDownloadAllRow(row.lines.length > 0 ? row : { ...row, lines: seedEditLines() });
    setDownloadAllForm(emptyDownloadAllForm());
    setDownloadAllOpen(true);
  };

  const closeDownloadAll = () => {
    setDownloadAllOpen(false);
    setDownloadAllRow(null);
    setDownloadAllForm(emptyDownloadAllForm());
  };

  const handleDownloadAllExport = () => {
    if (!downloadAllRow) return;
    let lines = downloadAllRow.lines.length > 0 ? downloadAllRow.lines : [];
    const { fromBagNo, toBagNo, selectType } = downloadAllForm;

    if (fromBagNo.trim() || toBagNo.trim()) {
      lines = lines.filter((l) => {
        const bag = l.bagNo.trim();
        if (fromBagNo.trim() && bag.localeCompare(fromBagNo.trim(), undefined, { numeric: true }) < 0) return false;
        if (toBagNo.trim() && bag.localeCompare(toBagNo.trim(), undefined, { numeric: true }) > 0) return false;
        return true;
      });
    }

    if (selectType === "Forwarding No 1" || selectType === "Forwarding No 2") {
      lines = lines.filter((l) => l.forwardingNo.trim());
    }

    exportManifestRowCsv(downloadAllRow, lines);
    closeDownloadAll();
  };

  const clearColFilters = (silent = false) => {
    setColFilters(emptyColFilters());
    setPage(1);
    if (!silent) toast.success("Column filters cleared");
  };

  const handleRefresh = async () => {
    setSearch("");
    clearColFilters(true);
    setReportFilters(emptyReportFilters());
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

  const addManifestLine = async () => {
    const scanInput = lineDraft.awbNo.trim() || lineDraft.forwardingNo.trim();
    if (!scanInput) return toast.error("AWB No or Forwarding No is required");

    if (authed) {
      setScanning(true);
      try {
        const res = await fetchShipmentForManifestScan({
          scanInput,
          currentManifestId: editing?.id ?? null,
          existingShipmentIds: form.lines.map((l) => l.shipmentId).filter(Boolean) as string[],
          existingAwbNos: form.lines.map((l) => l.awbNo),
          bagNo: lineDraft.bagNo,
          crnMhbsNo: lineDraft.crnMhbsNo,
          forwardingNo: lineDraft.forwardingNo,
        });

        if (!res.valid || !res.line) {
          toast.error(res.error || "Shipment could not be added to manifest");
          return;
        }

        const line = res.line as unknown as ManifestLine;
        setForm((f) => {
          const nextLines = [...f.lines, line];
          const uniqueBags = new Set(nextLines.map((x) => x.bagNo).filter(Boolean)).size;
          const totalWeight = nextLines
            .reduce((acc, cur) => acc + (Number(cur.chargeWeight) || 0), 0)
            .toFixed(3);
          return {
            ...f,
            lines: nextLines,
            totalNoOfBags: String(uniqueBags || "1"),
            vendorWeight: totalWeight,
          };
        });

        setLineDraft((prev) => ({
          ...prev,
          bagNo: prev.repeat ? prev.bagNo : "",
          bagType: prev.repeat ? prev.bagType : "Bags",
          crnMhbsNo: prev.repeat ? prev.crnMhbsNo : "",
          awbNo: "",
          forwardingNo: "",
        }));

        toast.success(`Added AWB ${line.awbNo} (${line.pieces} pcs, ${line.chargeWeight} kg)`);
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        setScanning(false);
      }
      return;
    }

    // Demo Mode Simulation
    const existingAwb = form.lines.find(
      (l) => l.awbNo.toLowerCase() === scanInput.toLowerCase() || l.forwardingNo.toLowerCase() === scanInput.toLowerCase(),
    );
    if (existingAwb) {
      return toast.error(`Shipment ${scanInput} is already added to this manifest`);
    }

    const candidate = SEED_AWB_CANDIDATES.find(
      (c) =>
        c.awbNo.toLowerCase() === scanInput.toLowerCase() ||
        c.refNo.toLowerCase() === scanInput.toLowerCase() ||
        `FWD${c.awbNo}`.toLowerCase() === scanInput.toLowerCase() ||
        (lineDraft.forwardingNo && `FWD${c.awbNo}`.toLowerCase() === lineDraft.forwardingNo.trim().toLowerCase()),
    );

    if (!candidate) {
      return toast.error(`Shipment not found for "${scanInput}"`);
    }

    // Hold simulation for demo
    if (candidate.instruction.toLowerCase().includes("hold") || candidate.awbNo === "30403925") {
      return toast.error(`Shipment is on HOLD (reason: Address Verification) and cannot be manifested (AWB ${candidate.awbNo})`);
    }

    // International KYC simulation for demo
    if (candidate.destinationCode === "AU" && candidate.awbNo === "30403926") {
      return toast.error(`International shipment must have at least one valid KYC document attached before it can be manifested (AWB ${candidate.awbNo})`);
    }

    const line: ManifestLine = {
      id: crypto.randomUUID(),
      shipmentId: candidate.awbNo,
      awbNo: candidate.awbNo,
      refNo: candidate.refNo,
      forwardingNo: lineDraft.forwardingNo.trim() || `FWD${candidate.awbNo}`,
      crnMhbsNo: lineDraft.crnMhbsNo.trim(),
      bagNo: lineDraft.bagNo.trim() || candidate.bagNo,
      pieces: candidate.pieces,
      chargeWeight: candidate.chargeWeight,
      bookDate: formatDisplayDate(candidate.bookDate),
      origin: candidate.originCode,
      destination: candidate.destination,
      code: candidate.code,
      customer: candidate.customer,
      consignee: candidate.consignee,
      instruction: candidate.instruction,
    };

    setForm((f) => {
      const nextLines = [...f.lines, line];
      const uniqueBags = new Set(nextLines.map((x) => x.bagNo).filter(Boolean)).size;
      const totalWeight = nextLines
        .reduce((acc, cur) => acc + (Number(cur.chargeWeight) || 0), 0)
        .toFixed(3);
      return {
        ...f,
        lines: nextLines,
        totalNoOfBags: String(uniqueBags || "1"),
        vendorWeight: totalWeight,
      };
    });

    setLineDraft((prev) => ({
      ...prev,
      bagNo: prev.repeat ? prev.bagNo : "",
      bagType: prev.repeat ? prev.bagType : "Bags",
      crnMhbsNo: prev.repeat ? prev.crnMhbsNo : "",
      awbNo: "",
      forwardingNo: "",
    }));

    toast.success(`Added AWB ${line.awbNo} (${line.pieces} pcs, ${line.chargeWeight} kg)`);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const parsed = await parseTabularFile(file);
      if (parsed.rows.length === 0) {
        toast.error("Spreadsheet is empty");
        return;
      }

      setSaving(true);
      const accepted: ManifestLine[] = [];
      const skipped: { awb: string; reason: string }[] = [];

      const runningShipmentIds = form.lines.map((l) => l.shipmentId).filter(Boolean) as string[];
      const runningAwbNos = form.lines.map((l) => l.awbNo);

      for (const row of parsed.rows) {
        const awbCandidate =
          row.awb_no ||
          row.awb ||
          row.awbno ||
          row.airwaybill ||
          row["awb no"] ||
          row["awb no."] ||
          row.forwarding_no ||
          row.forwarding_awb ||
          row.forwardingno ||
          row.ref_no ||
          Object.values(row)[0];

        const scanInput = String(awbCandidate ?? "").trim();
        if (!scanInput) continue;

        const bagVal = String(row.bag_no || row.bag || row.bagno || row["bag no"] || lineDraft.bagNo || "").trim();
        const crnVal = String(row.crn_mhbs_no || row.crn || row.mhbs || lineDraft.crnMhbsNo || "").trim();
        const fwdVal = String(row.forwarding_no || row.forwarding_awb || "").trim();

        if (authed) {
          try {
            const res = await fetchShipmentForManifestScan({
              scanInput,
              currentManifestId: editing?.id ?? null,
              existingShipmentIds: runningShipmentIds,
              existingAwbNos: runningAwbNos,
              bagNo: bagVal,
              crnMhbsNo: crnVal,
              forwardingNo: fwdVal,
            });

            if (res.valid && res.line) {
              const line = res.line as unknown as ManifestLine;
              accepted.push(line);
              if (line.shipmentId) runningShipmentIds.push(line.shipmentId);
              runningAwbNos.push(line.awbNo);
            } else {
              skipped.push({ awb: scanInput, reason: res.error || "Failed validation" });
            }
          } catch (err) {
            skipped.push({ awb: scanInput, reason: toErrorMessage(err) });
          }
        } else {
          const cand = SEED_AWB_CANDIDATES.find(
            (c) =>
              c.awbNo.toLowerCase() === scanInput.toLowerCase() ||
              c.refNo.toLowerCase() === scanInput.toLowerCase() ||
              `FWD${c.awbNo}`.toLowerCase() === scanInput.toLowerCase(),
          );
          if (!cand) {
            skipped.push({ awb: scanInput, reason: "Shipment not found" });
          } else if (runningAwbNos.some((a) => a.toLowerCase() === cand.awbNo.toLowerCase())) {
            skipped.push({ awb: scanInput, reason: "Already added to manifest" });
          } else if (cand.instruction.toLowerCase().includes("hold") || cand.awbNo === "30403925") {
            skipped.push({ awb: scanInput, reason: "Shipment on HOLD" });
          } else if (cand.destinationCode === "AU" && cand.awbNo === "30403926") {
            skipped.push({ awb: scanInput, reason: "Missing KYC document" });
          } else {
            const line: ManifestLine = {
              id: crypto.randomUUID(),
              shipmentId: cand.awbNo,
              awbNo: cand.awbNo,
              refNo: cand.refNo,
              forwardingNo: fwdVal || `FWD${cand.awbNo}`,
              crnMhbsNo: crnVal,
              bagNo: bagVal || cand.bagNo,
              pieces: cand.pieces,
              chargeWeight: cand.chargeWeight,
              bookDate: formatDisplayDate(cand.bookDate),
              origin: cand.originCode,
              destination: cand.destination,
              code: cand.code,
              customer: cand.customer,
              consignee: cand.consignee,
              instruction: cand.instruction,
            };
            accepted.push(line);
            runningAwbNos.push(line.awbNo);
          }
        }
      }

      if (accepted.length > 0) {
        setForm((f) => {
          const nextLines = [...f.lines, ...accepted];
          const uniqueBags = new Set(nextLines.map((x) => x.bagNo).filter(Boolean)).size;
          const totalWeight = nextLines
            .reduce((acc, cur) => acc + (Number(cur.chargeWeight) || 0), 0)
            .toFixed(3);
          return {
            ...f,
            lines: nextLines,
            totalNoOfBags: String(uniqueBags || "1"),
            vendorWeight: totalWeight,
          };
        });
      }

      if (skipped.length > 0) {
        setImportSummary({
          open: true,
          total: accepted.length + skipped.length,
          accepted: accepted.length,
          skipped,
        });
        toast.warning(`Imported ${accepted.length} shipments. ${skipped.length} skipped.`);
      } else {
        toast.success(`Successfully imported all ${accepted.length} shipments`);
      }
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to parse spreadsheet"));
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (authed && editing?.id) {
      setUploadingAttachment(true);
      try {
        const fileExt = file.name.split(".").pop() || "pdf";
        const storageKey = `tenants/manifests/${editing.id}/${crypto.randomUUID()}.${fileExt}`;
        const res = await uploadManifestAttachment({
          manifestId: editing.id,
          originalName: file.name,
          mime: file.type || "application/octet-stream",
          sizeBytes: file.size,
          storageKey,
          label: "Signed Manifest Copy",
        });
        setForm((f) => ({
          ...f,
          attachments: [
            ...f.attachments,
            {
              fileId: res.file_id,
              label: "Signed Manifest Copy",
              originalName: file.name,
              sizeBytes: file.size,
            },
          ],
        }));
        toast.success(`Attached ${file.name}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Failed to upload attachment"));
      } finally {
        setUploadingAttachment(false);
      }
      return;
    }

    const fileId = crypto.randomUUID();
    setForm((f) => ({
      ...f,
      attachments: [
        ...f.attachments,
        {
          fileId,
          label: "Signed Manifest Copy",
          originalName: file.name,
          sizeBytes: file.size,
        },
      ],
    }));
    toast.success(`Attached ${file.name} (will persist on save)`);
  };

  const removeAttachment = (fileId: string) => {
    if (isReadOnly) return;
    setForm((f) => ({
      ...f,
      attachments: f.attachments.filter((a) => a.fileId !== fileId),
    }));
    toast.success("Attachment removed");
  };

  const removeManifestLine = (lineId: string) => {
    if (isReadOnly) return;
    setForm((f) => {
      const remaining = f.lines.filter((l) => l.id !== lineId);
      const uniqueBags = new Set(remaining.map((x) => x.bagNo).filter(Boolean)).size;
      const totalWeight = remaining
        .reduce((acc, cur) => acc + (Number(cur.chargeWeight) || 0), 0)
        .toFixed(3);
      return {
        ...f,
        lines: remaining,
        totalNoOfBags: String(uniqueBags || "0"),
        vendorWeight: totalWeight,
      };
    });
    toast.success("Line removed from manifest");
  };

  const openGenerate = () => {
    setGenerateHeader(emptyGenerateHeader());
    setGenerateFilters(emptyGenerateFilters(defaultBranchCode, defaultBranchName));
    setGenerateResults([]);
    setSelectedAwbs(new Set());
    setShowGenerate(true);
  };

  const closeGenerate = () => {
    setShowGenerate(false);
    setGenerateHeader(emptyGenerateHeader());
    setGenerateFilters(emptyGenerateFilters());
    setGenerateResults([]);
    setSelectedAwbs(new Set());
  };

  const runGenerateSearch = () => {
    const pool = seedAwbCandidates();
    const matches = pool.filter((a) => {
      if (generateFilters.fromDate && a.bookDate < generateFilters.fromDate) return false;
      if (generateFilters.toDate && a.bookDate > generateFilters.toDate) return false;
      if (generateFilters.origin.code && a.originCode !== generateFilters.origin.code) return false;
      if (generateFilters.origin.name && !a.origin.toLowerCase().includes(generateFilters.origin.name.toLowerCase())) return false;
      if (generateFilters.serviceCentre.code && a.originCode !== generateFilters.serviceCentre.code) return false;
      if (generateFilters.product.code && a.productCode !== generateFilters.product.code) return false;
      if (generateFilters.vendor.code && a.vendorCode !== generateFilters.vendor.code) return false;
      if (generateFilters.service.code && a.productCode !== generateFilters.service.code) return false;
      if (generateFilters.destination.code && a.destinationCode !== generateFilters.destination.code) return false;
      if (generateFilters.destination.name && !a.destination.toLowerCase().includes(generateFilters.destination.name.toLowerCase())) return false;
      if (generateFilters.customer.code && a.customerCode !== generateFilters.customer.code) return false;
      if (generateFilters.customer.name && !a.customer.toLowerCase().includes(generateFilters.customer.name.toLowerCase())) return false;
      return true;
    });
    setGenerateResults(matches);
    setSelectedAwbs(new Set());
    toast.success(`${matches.length} AWB${matches.length === 1 ? "" : "s"} found`);
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedAwbs(checked ? new Set(generateResults.map((a) => a.id)) : new Set());
  };

  const toggleSelectAwb = (id: string, checked: boolean) => {
    setSelectedAwbs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const createManifestFromGenerate = () => {
    if (!generateHeader.manifestDate) return toast.error("Manifest Date is required");
    if (selectedAwbs.size === 0) return toast.error("Select at least one AWB");
    const selected = generateResults.filter((a) => selectedAwbs.has(a.id));
    const lines: ManifestLine[] = selected.map((a) => ({
      id: crypto.randomUUID(),
      awbNo: a.awbNo,
      refNo: a.refNo,
      forwardingNo: "",
      crnMhbsNo: "",
      bagNo: a.bagNo,
      pieces: a.pieces,
      chargeWeight: a.chargeWeight,
      bookDate: formatDisplayDate(a.bookDate),
      origin: a.originCode,
      destination: a.destination,
      code: a.code,
      customer: a.customer,
      consignee: a.consignee,
      instruction: a.instruction,
    }));
    const payload: ManifestForm = {
      ...emptyForm(),
      manifestNo: nextManifestNo,
      manifestDate: generateHeader.manifestDate,
      manifestTime: nowManifestTime(),
      manifestToServiceCenter: generateHeader.manifestToServiceCenter,
      destinationServiceCenter: generateHeader.serviceCentre,
      vendor: generateHeader.vendor,
      setupMode: "Select",
      masterAwbNo: "",
      location: generateFilters.origin.code || "HYD",
      serviceCentre: generateHeader.serviceCentre.code,
      connectStation: generateHeader.serviceCentre.name || selected[0]?.destination || "",
      lines,
    };
    setDemoRows((prev) => [{ id: crypto.randomUUID(), status: "DRAFT", ...payload }, ...prev]);
    toast.success(`Manifest ${payload.manifestNo} created with ${lines.length} AWB${lines.length === 1 ? "" : "s"}`);
    closeGenerate();
  };

  const allGenerateSelected = generateResults.length > 0 && generateResults.every((a) => selectedAwbs.has(a.id));
  const someGenerateSelected = generateResults.some((a) => selectedAwbs.has(a.id));

  const openCrnDialog = (row?: ManifestRow) => {
    setCrnForm(row ? crnFormFromRow(row) : emptyCrnForm());
    setCrnOpen(true);
  };

  const closeCrnDialog = () => {
    setCrnOpen(false);
    setCrnForm(emptyCrnForm());
  };

  const openAddProgress = (row: ManifestRow) => {
    setProgressManifest(row);
    setProgressMode("add");
    setProgressForm({
      ...emptyProgressForm(),
      serviceCentre: row.destinationServiceCenter.code
        ? row.destinationServiceCenter
        : { code: row.location || "HYD", name: row.location || "HYD" },
    });
    setProgressOpen(true);
  };

  const closeAddProgress = () => {
    setProgressOpen(false);
    setProgressManifest(null);
    setProgressMode("add");
    setProgressForm(emptyProgressForm());
  };

  const patchProgress = (patch: Partial<ProgressForm>) => setProgressForm((f) => ({ ...f, ...patch }));

  const handleProgressSave = async () => {
    if (!progressForm.serviceCentre.code.trim() && !progressForm.serviceCentre.name.trim()) {
      return toast.error("Service Centre is required");
    }

    if (authed && progressManifest?.id) {
      try {
        const res = await recordManifestProgress({
          manifestId: progressManifest.id,
          bagNo: progressForm.bagNo.trim() || null,
          progressDate: progressForm.progressDate,
          progressTime: progressForm.progressTime || null,
          serviceCenterCode: progressForm.serviceCentre.code.trim() || null,
          exceptionCode: progressForm.exception.code.trim() || null,
          mode: progressMode,
        });
        toast.success(
          `Progress ${progressMode === "add" ? "recorded" : "deleted"} for manifest ${progressManifest.manifestNo} (${res.affected_shipments} shipment(s) updated)`,
        );
        closeAddProgress();
      } catch (err) {
        toast.error(toErrorMessage(err));
      }
      return;
    }

    const action = progressMode === "add" ? "added" : "deleted";
    toast.success(`Progress ${action} for ${progressManifest?.manifestNo ?? "manifest"}`);
    closeAddProgress();
  };

  const patchCrn = (patch: Partial<CrnLabelForm>) => setCrnForm((f) => ({ ...f, ...patch }));

  const handleCrnPrint = () => {
    if (!crnForm.date) return toast.error("Date is required");
    if (!crnForm.origin.trim()) return toast.error("Origin is required");
    if (!crnForm.destination.code.trim() && !crnForm.destination.name.trim()) return toast.error("Destination is required");
    if (!crnForm.masterAwbNo.trim()) return toast.error("Master AWB No is required");

    const printWin = window.open("", "_blank", "width=800,height=900");
    if (!printWin) {
      return toast.error("Pop-up blocked. Please allow pop-ups to print CRN label.");
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>CRN Bag Label - ${crnForm.masterAwbNo}</title>
        <style>
          @page { size: 4in 6in; margin: 0.2in; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 12px; color: #000; }
          .label-card { border: 2px solid #000; border-radius: 6px; padding: 12px; box-sizing: border-box; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
          .logo { font-size: 18px; font-weight: 900; letter-spacing: 1px; }
          .badge { background: #000; color: #fff; padding: 4px 8px; font-size: 12px; font-weight: bold; border-radius: 4px; }
          .route { display: flex; justify-content: space-between; align-items: center; margin: 12px 0; border-bottom: 1.5px dashed #666; padding-bottom: 8px; }
          .route-code { font-size: 28px; font-weight: 900; }
          .route-arrow { font-size: 20px; font-weight: bold; color: #555; }
          .barcode-box { text-align: center; margin: 10px 0; padding: 6px; border: 1px solid #ccc; background: #f9f9f9; }
          .barcode { font-family: monospace; font-size: 26px; font-weight: bold; letter-spacing: 4px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin: 8px 0; }
          .grid-full { grid-column: span 2; }
          .box { border: 1px solid #000; padding: 6px; border-radius: 4px; }
          .box-title { font-size: 9px; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 2px; }
          .box-val { font-size: 11px; font-weight: 600; }
          .footer { font-size: 10px; text-align: center; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 6px; color: #555; }
        </style>
      </head>
      <body>
        <div class="label-card">
          <div class="header">
            <div class="logo">SWIFTFORGE CRN</div>
            <div class="badge">BAG DISPATCH LABEL</div>
          </div>

          <div class="route">
            <div>
              <div style="font-size: 9px; color: #555; font-weight: bold;">ORIGIN</div>
              <div class="route-code">${crnForm.origin}</div>
            </div>
            <div class="route-arrow">✈ ➔</div>
            <div style="text-align: right;">
              <div style="font-size: 9px; color: #555; font-weight: bold;">DESTINATION</div>
              <div class="route-code">${crnForm.destination.code || crnForm.destination.name}</div>
            </div>
          </div>

          <div class="barcode-box">
            <div class="barcode">||| | |||| ||| |||| | |||</div>
            <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">MAWB: ${crnForm.masterAwbNo}</div>
          </div>

          <div class="grid">
            <div class="box">
              <div class="box-title">Flight / Carrier</div>
              <div class="box-val">${crnForm.flightNo.code || crnForm.flightNo.name || "N/A"}</div>
            </div>
            <div class="box">
              <div class="box-title">Date</div>
              <div class="box-val">${crnForm.date}</div>
            </div>
            <div class="box">
              <div class="box-title">CD Number</div>
              <div class="box-val">${crnForm.cdNo || "N/A"}</div>
            </div>
            <div class="box">
              <div class="box-title">Total Bags</div>
              <div class="box-val">${crnForm.noOfBags || "1"}</div>
            </div>

            <div class="box grid-full">
              <div class="box-title">From (Origin Service Center)</div>
              <div class="box-val">${crnForm.fromName.name || crnForm.fromName.code || crnForm.origin}</div>
              <div style="font-size: 10px; color: #444;">${[crnForm.fromAddress1, crnForm.fromCity, crnForm.fromState, crnForm.fromPinCode].filter(Boolean).join(", ")}</div>
              ${crnForm.fromMobile ? `<div style="font-size: 10px;">Tel: ${crnForm.fromMobile}</div>` : ""}
            </div>

            <div class="box grid-full">
              <div class="box-title">To (Destination / Vendor)</div>
              <div class="box-val">${crnForm.toName.name || crnForm.toName.code || crnForm.destination.name}</div>
              <div style="font-size: 10px; color: #444;">${[crnForm.toAddress1, crnForm.toCity, crnForm.toState, crnForm.toPinCode].filter(Boolean).join(", ")}</div>
              ${crnForm.toMobile ? `<div style="font-size: 10px;">Tel: ${crnForm.toMobile}</div>` : ""}
            </div>

            ${crnForm.remarks ? `
              <div class="box grid-full">
                <div class="box-title">Remarks</div>
                <div class="box-val">${crnForm.remarks}</div>
              </div>
            ` : ""}
          </div>

          <div class="footer">
            Printed on ${new Date().toLocaleString()} • SwiftForge Manifest Dispatch
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    toast.success("CRN label sent to printer window");
    closeCrnDialog();
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Transaction", "Manifest Scan"]} />

      {showGenerate ? (
        <Card className="min-w-0 overflow-hidden border p-0">
          <div className="border-b bg-muted/30 px-4 py-3">
            <Badge className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Manifest Scan</Badge>
          </div>

          <div className="p-4 md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <FieldWrapper label="Manifest No" required>
                <Input value={generateHeader.manifestNo} onChange={(e) => setGenerateHeader((h) => ({ ...h, manifestNo: e.target.value }))} placeholder="Auto on create" />
              </FieldWrapper>
              <FieldWrapper label="Manifest Date" required>
                <Input type="date" value={generateHeader.manifestDate} onChange={(e) => setGenerateHeader((h) => ({ ...h, manifestDate: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="Manifest To">
                <div className="flex h-9 overflow-hidden rounded-md border">
                  <Button type="button" variant="ghost" className={cn("h-9 flex-1 rounded-none text-xs", generateHeader.manifestToServiceCenter ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white" : "text-muted-foreground")} onClick={() => setGenerateHeader((h) => ({ ...h, manifestToServiceCenter: true }))}>Service Center</Button>
                  <Button type="button" variant="ghost" className={cn("h-9 flex-1 rounded-none border-l text-xs", !generateHeader.manifestToServiceCenter ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white" : "text-muted-foreground")} onClick={() => setGenerateHeader((h) => ({ ...h, manifestToServiceCenter: false }))}>Third Party</Button>
                </div>
              </FieldWrapper>
              <FieldWrapper label="Service Center">
                <LookupPairInput lookup="serviceCentre" value={generateHeader.serviceCentre} onChange={(v) => setGenerateHeader((h) => ({ ...h, serviceCentre: v }))} />
              </FieldWrapper>
              <FieldWrapper label="Vendor">
                <LookupPairInput lookup="vendor" value={generateHeader.vendor} onChange={(v) => setGenerateHeader((h) => ({ ...h, vendor: v }))} />
              </FieldWrapper>
            </div>

            <FormSection title="Manifest Details" className="mt-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="From Date">
                  <Input type="date" value={generateFilters.fromDate} onChange={(e) => setGenerateFilters((f) => ({ ...f, fromDate: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="To Date">
                  <Input type="date" value={generateFilters.toDate} onChange={(e) => setGenerateFilters((f) => ({ ...f, toDate: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Origin">
                  <LookupPairInput lookup="serviceCentre" value={generateFilters.origin} onChange={(v) => setGenerateFilters((f) => ({ ...f, origin: v }))} />
                </FieldWrapper>
                <FieldWrapper label="Service Center">
                  <LookupPairInput lookup="serviceCentre" value={generateFilters.serviceCentre} onChange={(v) => setGenerateFilters((f) => ({ ...f, serviceCentre: v }))} />
                </FieldWrapper>
                <FieldWrapper label="Product">
                  <LookupPairInput lookup="product" value={generateFilters.product} onChange={(v) => setGenerateFilters((f) => ({ ...f, product: v }))} />
                </FieldWrapper>
                <FieldWrapper label="Vendor">
                  <LookupPairInput lookup="vendor" value={generateFilters.vendor} onChange={(v) => setGenerateFilters((f) => ({ ...f, vendor: v }))} />
                </FieldWrapper>
                <FieldWrapper label="Service">
                  <LookupPairInput lookup="product" value={generateFilters.service} onChange={(v) => setGenerateFilters((f) => ({ ...f, service: v }))} />
                </FieldWrapper>
                <FieldWrapper label="Destination">
                  <LookupPairInput lookup="destination" value={generateFilters.destination} onChange={(v) => setGenerateFilters((f) => ({ ...f, destination: v }))} />
                </FieldWrapper>
                <FieldWrapper label="Customer">
                  <LookupPairInput lookup="customer" value={generateFilters.customer} onChange={(v) => setGenerateFilters((f) => ({ ...f, customer: v }))} />
                </FieldWrapper>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={runGenerateSearch} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Search</Button>
                <Button variant="destructive" onClick={closeGenerate}>Close</Button>
              </div>
            </FormSection>

            <p className="mt-4 text-sm font-medium text-primary">Total Count : {generateResults.length}</p>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="min-w-[140px] text-sidebar-foreground">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={allGenerateSelected ? true : someGenerateSelected ? "indeterminate" : false}
                          onCheckedChange={(c) => toggleSelectAll(c === true)}
                          aria-label="Select all"
                        />
                        <span className="text-xs font-normal">Select All / De-select</span>
                      </div>
                    </TableHead>
                    {["AWB No.", "Ref No.", "Bag No.", "Book Date", "Origin", "Destination", "Code", "Customer", "Consignee", "Pieces", "Charge Weight", "Instruction"].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap text-sidebar-foreground">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generateResults.length === 0 ? (
                    <TableRow><TableCell colSpan={13} className="h-24 text-center text-muted-foreground">Run search to load AWBs</TableCell></TableRow>
                  ) : generateResults.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Checkbox checked={selectedAwbs.has(a.id)} onCheckedChange={(c) => toggleSelectAwb(a.id, c === true)} aria-label={`Select ${a.awbNo}`} />
                      </TableCell>
                      <TableCell>{a.awbNo}</TableCell>
                      <TableCell>{a.refNo}</TableCell>
                      <TableCell>{a.bagNo}</TableCell>
                      <TableCell>{formatDisplayDate(a.bookDate)}</TableCell>
                      <TableCell>{a.originCode}</TableCell>
                      <TableCell>{a.destination}</TableCell>
                      <TableCell>{a.code}</TableCell>
                      <TableCell>{a.customer}</TableCell>
                      <TableCell>{a.consignee}</TableCell>
                      <TableCell>{a.pieces}</TableCell>
                      <TableCell>{a.chargeWeight}</TableCell>
                      <TableCell>{a.instruction}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={createManifestFromGenerate} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Create Manifest</Button>
            </div>
          </div>
        </Card>
      ) : showForm ? (
        <Card className="min-w-0 overflow-hidden border p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
            <Badge className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Manifest Scan</Badge>
            <FieldWrapper label="Setup" className="w-44">
              <Select value={form.setupMode} onValueChange={(v) => setForm((f) => ({ ...f, setupMode: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {SETUP_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>
          </div>

          <div className="p-4 md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <FieldWrapper label="Manifest No" required>
                <div className="flex items-center gap-2">
                  <Input
                    value={form.manifestNo}
                    disabled={!!editing || isReadOnly || authed}
                    onChange={(e) => setForm((f) => ({ ...f, manifestNo: e.target.value }))}
                    className="flex-1"
                  />
                  {formStatus ? (
                    <Badge
                      variant={
                        formStatus === "CLOSED"
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
              <FieldWrapper label="Manifest Date" required>
                <Input type="date" value={form.manifestDate} onChange={(e) => setForm((f) => ({ ...f, manifestDate: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="Manifest Time">
                <Input value={form.manifestTime} onChange={(e) => setForm((f) => ({ ...f, manifestTime: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="HHmm" />
              </FieldWrapper>
              <FieldWrapper label="Manifest To">
                <div className="flex h-9 overflow-hidden rounded-md border">
                  <Button type="button" variant="ghost" className={cn("h-9 flex-1 rounded-none text-xs", form.manifestToServiceCenter ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white" : "text-muted-foreground")} onClick={() => setForm((f) => ({ ...f, manifestToServiceCenter: true }))}>Service Center</Button>
                  <Button type="button" variant="ghost" className={cn("h-9 flex-1 rounded-none border-l text-xs", !form.manifestToServiceCenter ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white" : "text-muted-foreground")} onClick={() => setForm((f) => ({ ...f, manifestToServiceCenter: false }))}>Third Party</Button>
                </div>
              </FieldWrapper>
              {form.manifestToServiceCenter ? (
                <FieldWrapper label="Destination Service Center">
                  <LookupPairInput lookup="serviceCentre" value={form.destinationServiceCenter} onChange={(v) => setForm((f) => ({ ...f, destinationServiceCenter: v }))} />
                </FieldWrapper>
              ) : (
                <FieldWrapper label="Vendor">
                  <NameCodeLookupInput lookup="vendor" value={form.vendor} onChange={(v) => setForm((f) => ({ ...f, vendor: v }))} />
                </FieldWrapper>
              )}
            </div>

            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="mt-4">
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/60">
                Click here to enter Manifest Details
                <ChevronDown className={cn("h-4 w-4 transition-transform", detailsOpen && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="border border-t-0 p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <FieldWrapper label="Master AWB No.">
                    <Input value={form.masterAwbNo} onChange={(e) => setForm((f) => ({ ...f, masterAwbNo: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="OBC Name" required>
                    <LookupPairInput lookup="vendor" value={form.obcName} onChange={(v) => setForm((f) => ({ ...f, obcName: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="CD No">
                    <Input value={form.cdNo} onChange={(e) => setForm((f) => ({ ...f, cdNo: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Total No. Of Bags">
                    <Input value={form.totalNoOfBags} onChange={(e) => setForm((f) => ({ ...f, totalNoOfBags: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Vendor Weight">
                    <Input value={form.vendorWeight} onChange={(e) => setForm((f) => ({ ...f, vendorWeight: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Reference No">
                    <Input value={form.referenceNo} onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Flight 1">
                    <LookupPairInput lookup="flight" value={form.flight1} onChange={(v) => setForm((f) => ({ ...f, flight1: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Flight 2">
                    <LookupPairInput lookup="flight" value={form.flight2} onChange={(v) => setForm((f) => ({ ...f, flight2: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Departure">
                    <Input value={form.departure} onChange={(e) => setForm((f) => ({ ...f, departure: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Arrival">
                    <Input value={form.arrival} onChange={(e) => setForm((f) => ({ ...f, arrival: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Remark">
                    <Input value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Flight">
                    <LookupPairInput lookup="flight" value={form.flight} onChange={(v) => setForm((f) => ({ ...f, flight: v }))} />
                  </FieldWrapper>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6 items-end">
                  <FieldWrapper label="Bag No">
                    <Input
                      value={lineDraft.bagNo}
                      onChange={(e) => setLineDraft((d) => ({ ...d, bagNo: e.target.value }))}
                      placeholder="e.g. BAG-001"
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Bag Type">
                    <Select
                      value={lineDraft.bagType}
                      onValueChange={(v: "Bags" | "Cartoon") => setLineDraft((d) => ({ ...d, bagType: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bags">Bags</SelectItem>
                        <SelectItem value="Cartoon">Cartoon</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldWrapper>
                  <FieldWrapper label="CRN MHBS No">
                    <Input
                      value={lineDraft.crnMhbsNo}
                      onChange={(e) => setLineDraft((d) => ({ ...d, crnMhbsNo: e.target.value }))}
                      placeholder="CRN MHBS"
                    />
                  </FieldWrapper>
                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      id="repeatBag"
                      checked={lineDraft.repeat}
                      onCheckedChange={(c) => setLineDraft((d) => ({ ...d, repeat: c === true }))}
                    />
                    <label htmlFor="repeatBag" className="text-xs font-medium cursor-pointer text-muted-foreground select-none">
                      Repeat Bag/CRN
                    </label>
                  </div>
                  <FieldWrapper label="Forwarding No.">
                    <Input
                      value={lineDraft.forwardingNo}
                      onChange={(e) => setLineDraft((d) => ({ ...d, forwardingNo: e.target.value }))}
                      placeholder="FWD No"
                    />
                  </FieldWrapper>
                  <FieldWrapper label="AWB No." required className="lg:col-span-1">
                    <div className="flex gap-1">
                      <Input
                        value={lineDraft.awbNo}
                        disabled={scanning || isReadOnly}
                        onChange={(e) => setLineDraft((d) => ({ ...d, awbNo: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addManifestLine();
                          }
                        }}
                        placeholder="AWB No"
                      />
                      <Button
                        disabled={scanning || isReadOnly}
                        className="shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                        onClick={addManifestLine}
                      >
                        {scanning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                        Add
                      </Button>
                    </div>
                  </FieldWrapper>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <FormSection title="Signed Manifest Copy & Attachments" className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <p className="text-xs text-muted-foreground">Attach signed physical copy or supporting customs/airline documents</p>
                {!isReadOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingAttachment}
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => fileUploadInputRef.current?.click()}
                  >
                    {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload Copy
                  </Button>
                ) : null}
                <input
                  ref={fileUploadInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.tiff"
                  className="hidden"
                  onChange={handleUploadAttachment}
                />
              </div>

              {form.attachments.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No signed manifest documents attached
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {form.attachments.map((att) => (
                    <div
                      key={att.fileId}
                      className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium" title={att.originalName || att.label}>
                          {att.originalName || att.label}
                        </span>
                      </div>
                      {!isReadOnly ? (
                        <button
                          type="button"
                          className="text-destructive hover:opacity-80"
                          onClick={() => removeAttachment(att.fileId)}
                          title="Remove attachment"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </FormSection>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {!isReadOnly ? (
                <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                  Save
                </Button>
              ) : null}
              {canCloseManifest ? (
                <Button
                  onClick={handleCloseManifest}
                  disabled={saving}
                  className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                >
                  Close Manifest
                </Button>
              ) : null}
              <Button className="bg-cyan-600 text-white hover:bg-cyan-600/90" onClick={() => toast.info("Print will be enabled with backend wiring")}>
                Print
              </Button>
              <Button variant="outline" onClick={closeForm} disabled={saving}>
                Close
              </Button>
              {!isReadOnly ? (
                <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
                  Excel Import
                </Button>
              ) : null}
              <input ref={importInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleExcelImport} />
            </div>

            <p className="mt-4 text-sm font-medium text-primary">Total Count : {form.lines.length}</p>

            <div className="mt-2 w-full min-w-0">
              <table className="w-full table-fixed caption-bottom text-xs sm:text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    {formLineCols.map((h) => (
                      <TableHead key={h} className="max-w-0 truncate px-2 text-sidebar-foreground">{h}</TableHead>
                    ))}
                    <TableHead className="w-12 px-1 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.lines.length === 0 ? (
                    <TableRow><TableCell colSpan={15} className="h-24 text-center text-muted-foreground">No manifest lines added</TableCell></TableRow>
                  ) : form.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-0 truncate px-2" title={l.awbNo}>{l.awbNo}</TableCell>
                      <TableCell className="max-w-0 truncate px-2" title={l.refNo}>{l.refNo}</TableCell>
                      <TableCell className="max-w-0 truncate px-2" title={l.forwardingNo}>{l.forwardingNo}</TableCell>
                      <TableCell className="max-w-0 truncate px-2" title={l.crnMhbsNo}>{l.crnMhbsNo}</TableCell>
                      <TableCell className="max-w-0 truncate px-2" title={l.bagNo}>{l.bagNo}</TableCell>
                      <TableCell className="max-w-0 truncate px-2">{l.pieces}</TableCell>
                      <TableCell className="max-w-0 truncate px-2">{l.chargeWeight}</TableCell>
                      <TableCell className="max-w-0 truncate px-2 whitespace-nowrap">{l.bookDate}</TableCell>
                      <TableCell className="max-w-0 truncate px-2">{l.origin}</TableCell>
                      <TableCell className="max-w-0 truncate px-2" title={l.destination}>{l.destination}</TableCell>
                      <TableCell className="max-w-0 truncate px-2">{l.code}</TableCell>
                      <TableCell className="max-w-0 truncate px-2" title={l.customer}>{l.customer}</TableCell>
                      <TableCell className="max-w-0 truncate px-2" title={l.consignee}>{l.consignee}</TableCell>
                      <TableCell className="max-w-0 truncate px-2" title={l.instruction}>{l.instruction}</TableCell>
                      <TableCell className="w-12 px-1 text-center">
                        {!isReadOnly ? (
                          <IconButton
                            label="Remove line"
                            variant="ghost"
                            size="row"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => removeManifestLine(l.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Manifest Scan</h1>
            <p className="text-sm text-muted-foreground">Create and manage outbound manifest scans.</p>
          </div>

          <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <FieldWrapper label="Product">
                <LookupPairInput lookup="product" value={reportFilters.product} onChange={(v) => setReportFilters((f) => ({ ...f, product: v }))} />
              </FieldWrapper>
              <FieldWrapper label="Vendor">
                <LookupPairInput lookup="vendor" value={reportFilters.vendor} onChange={(v) => setReportFilters((f) => ({ ...f, vendor: v }))} />
              </FieldWrapper>
              <FieldWrapper label="Format">
                <Select value={reportFilters.format} onValueChange={(v) => setReportFilters((f) => ({ ...f, format: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="PDF Type">
                <div className="flex flex-wrap items-center gap-2">
                  <DataIoToolbar
                    export={{
                      filename: "manifest-scans",
                      title: "Manifest Scans",
                      columns: [
                        { key: "manifestNo", header: "Manifest No" },
                        { key: "masterAwbNo", header: "Master AWBNo" },
                        { key: "date", header: "Date" },
                        { key: "location", header: "Location" },
                        { key: "serviceCentre", header: "Service Centre" },
                        { key: "connectStation", header: "Connect Station" },
                        { key: "vendor", header: "Vendor" },
                      ],
                      getRows: () =>
                        filtered.map((r) => {
                          const d = listDisplay(r);
                          return {
                            manifestNo: d.manifestNo,
                            masterAwbNo: d.masterAwbNo,
                            date: d.date,
                            location: d.location,
                            serviceCentre: d.serviceCentre,
                            connectStation: d.connectStation,
                            vendor: d.vendor,
                          };
                        }),
                    }}
                  />
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={() => toast.info("Print will be enabled with backend wiring")}>Print</Button>
                </div>
              </FieldWrapper>
              <div className="flex items-end gap-2 pb-2">
                <Checkbox id="excelExport" checked={reportFilters.excel} onCheckedChange={(c) => setReportFilters((f) => ({ ...f, excel: c === true }))} />
                <label htmlFor="excelExport" className="text-sm text-muted-foreground">Excel</label>
              </div>
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <IconButton label="Generate" onClick={openGenerate}><Pencil className="h-4 w-4" /></IconButton>
                  <DataIoToolbar
                    export={{
                      filename: "manifest-scans",
                      title: "Manifest Scans",
                      columns: [
                        { key: "manifestNo", header: "Manifest No" },
                        { key: "masterAwbNo", header: "Master AWBNo" },
                        { key: "date", header: "Date" },
                        { key: "location", header: "Location" },
                        { key: "serviceCentre", header: "Service Centre" },
                        { key: "connectStation", header: "Connect Station" },
                        { key: "vendor", header: "Vendor" },
                      ],
                      getRows: () =>
                        filtered.map((r) => {
                          const d = listDisplay(r);
                          return {
                            manifestNo: d.manifestNo,
                            masterAwbNo: d.masterAwbNo,
                            date: d.date,
                            location: d.location,
                            serviceCentre: d.serviceCentre,
                            connectStation: d.connectStation,
                            vendor: d.vendor,
                          };
                        }),
                    }}
                  />
                  <IconButton label="Filter" onClick={() => clearColFilters()}><Filter className="h-4 w-4" /></IconButton>
                  <IconButton label="Refresh" onClick={handleRefresh}><RefreshCw className="h-4 w-4" /></IconButton>
                  <IconButton label="Print CRN" onClick={() => openCrnDialog()}><Printer className="h-4 w-4" /></IconButton>
                </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
                <span className="shrink-0 text-sm text-muted-foreground">Search:</span>
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-9 w-full min-w-[10rem] sm:w-48" />
                <Button size="sm" onClick={openAdd} className="h-9 shrink-0 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="w-full min-w-0">
              <table className="w-full table-fixed caption-bottom text-sm">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[6%]" />
                  <col className="w-[8%]" />
                  <col className="w-[11%]" />
                  <col className="w-[17%]" />
                  <col className="w-[25%]" />
                </colgroup>
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className={cn("text-xs text-sidebar-foreground sm:text-sm", manifestCol.manifestNo)}>Manifest No</TableHead>
                    <TableHead className={cn("text-xs text-sidebar-foreground sm:text-sm", manifestCol.masterAwbNo)}>Master AWB</TableHead>
                    <TableHead className={cn("text-xs text-sidebar-foreground sm:text-sm", manifestCol.date)}>Date</TableHead>
                    <TableHead className={cn("text-xs text-sidebar-foreground sm:text-sm", manifestCol.location)}>Loc</TableHead>
                    <TableHead className={cn("text-xs text-sidebar-foreground sm:text-sm", manifestCol.serviceCentre)}>Svc Centre</TableHead>
                    <TableHead className={cn("text-xs text-sidebar-foreground sm:text-sm", manifestCol.connectStation)}>Connect</TableHead>
                    <TableHead className={cn("text-xs text-sidebar-foreground sm:text-sm", manifestCol.vendor)}>Vendor</TableHead>
                    <TableHead className={cn("text-xs text-sidebar-foreground sm:text-sm", manifestCol.action)}>Action</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {([
                      ["manifestNo", "Manifest", manifestCol.manifestNo],
                      ["masterAwbNo", "AWB", manifestCol.masterAwbNo],
                      ["date", "Date", manifestCol.date],
                      ["location", "Loc", manifestCol.location],
                      ["serviceCentre", "Svc", manifestCol.serviceCentre],
                      ["connectStation", "Connect", manifestCol.connectStation],
                      ["vendor", "Vendor", manifestCol.vendor],
                    ] as const).map(([key, placeholder, colClass]) => (
                      <TableHead key={key} className={cn("py-2", colClass)}>
                        <Input value={colFilters[key]} onChange={(e) => { setColFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); }} placeholder={placeholder} className={manifestCol.filter} />
                      </TableHead>
                    ))}
                    <TableHead className={manifestCol.action} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">No data available in table</TableCell></TableRow>
                  ) : pageRows.map((r) => {
                    const d = listDisplay(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className={manifestCol.manifestNo} title={d.manifestNo}>
                          <div className="flex min-w-0 items-center gap-1.5">
                            <button type="button" onClick={() => openEdit(r)} className="block min-w-0 flex-1 truncate text-left font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400">{d.manifestNo}</button>
                            {r.status ? (
                              <Badge
                                variant={
                                  r.status === "CLOSED"
                                    ? "default"
                                    : r.status === "CANCELLED"
                                      ? "destructive"
                                      : "secondary"
                                }
                                className="shrink-0 text-[10px]"
                              >
                                {r.status}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className={manifestCol.masterAwbNo} title={d.masterAwbNo}>{d.masterAwbNo}</TableCell>
                        <TableCell className={manifestCol.date}>{d.date}</TableCell>
                        <TableCell className={manifestCol.location}>{d.location}</TableCell>
                        <TableCell className={manifestCol.serviceCentre} title={d.serviceCentre}>{d.serviceCentre}</TableCell>
                        <TableCell className={manifestCol.connectStation} title={d.connectStation}>{d.connectStation}</TableCell>
                        <TableCell className={manifestCol.vendor} title={d.vendor}>{d.vendor}</TableCell>
                        <TableCell className={manifestCol.actionCell}>
                          <div className="flex justify-center gap-0">
                            <IconButton label="Edit" variant="ghost" size="row" className="text-destructive" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                            <IconButton label="Delete" variant="ghost" size="row" className="text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                            <IconButton label="Add Progress" variant="ghost" size="row" className="text-emerald-600" onClick={() => openAddProgress(r)}><FilePlus className="h-3.5 w-3.5" /></IconButton>
                            <IconButton label="Export to CSV" variant="ghost" size="row" className="text-emerald-600" onClick={() => exportManifestRowCsv(r)}><Download className="h-3.5 w-3.5" /></IconButton>
                            <IconButton label="Print CRN" variant="ghost" size="row" onClick={() => openCrnDialog(r)}><Printer className="h-3.5 w-3.5" /></IconButton>
                            <ManifestMoreMenu row={r} onDownloadAll={() => openDownloadAll(r)} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </table>
            </div>

            <TablePager totalPages={totalPages} currentPage={currentPage} setPage={setPage} startIdx={startIdx} endIdx={endIdx} total={filtered.length} />
          </Card>
        </>
      )}

      <Dialog open={downloadAllOpen} onOpenChange={(o) => !o && closeDownloadAll()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Download All</DialogTitle>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6">
            <FieldWrapper label="Select Type">
              <Select value={downloadAllForm.selectType} onValueChange={(v) => setDownloadAllForm((f) => ({ ...f, selectType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOWNLOAD_ALL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="From Bag No">
              <Input value={downloadAllForm.fromBagNo} onChange={(e) => setDownloadAllForm((f) => ({ ...f, fromBagNo: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="To Bag No">
              <Input value={downloadAllForm.toBagNo} onChange={(e) => setDownloadAllForm((f) => ({ ...f, toBagNo: e.target.value }))} />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleDownloadAllExport} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Export</Button>
            <Button variant="destructive" onClick={closeDownloadAll}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={progressOpen} onOpenChange={(o) => !o && closeAddProgress()}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Add Progress</DialogTitle>
          </div>
          <div className="border-b px-4 py-3">
            <div className="flex h-9 overflow-hidden rounded-md border">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-9 flex-1 rounded-none text-sm",
                  progressMode === "add"
                    ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                    : "text-muted-foreground",
                )}
                onClick={() => setProgressMode("add")}
              >
                Add Progress
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-9 flex-1 rounded-none border-l text-sm",
                  progressMode === "delete"
                    ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                    : "text-muted-foreground",
                )}
                onClick={() => setProgressMode("delete")}
              >
                Delete Progress
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <FieldWrapper label="Bag No">
              <Input value={progressForm.bagNo} onChange={(e) => patchProgress({ bagNo: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Progress Date">
              <Input type="date" value={progressForm.progressDate} onChange={(e) => patchProgress({ progressDate: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Progress Time">
              <Input
                value={progressForm.progressTime}
                onChange={(e) => patchProgress({ progressTime: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                placeholder="HHmm"
              />
            </FieldWrapper>
            <FieldWrapper label="Service Centre" required>
              <LookupPairInput lookup="serviceCentre" value={progressForm.serviceCentre} onChange={(v) => patchProgress({ serviceCentre: v })} />
            </FieldWrapper>
            <FieldWrapper label="Exception" className="md:col-span-2">
              <LookupPairInput lookup="exception" value={progressForm.exception} onChange={(v) => patchProgress({ exception: v })} />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleProgressSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={closeAddProgress}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={crnOpen} onOpenChange={(o) => !o && closeCrnDialog()}>
        <DialogContent className="max-h-[90vh] max-w-5xl gap-0 overflow-hidden overflow-y-auto p-0 sm:max-w-5xl">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">CRN Label Generation</DialogTitle>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="Date" required>
              <Input type="date" value={crnForm.date} onChange={(e) => patchCrn({ date: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Flight No" required>
              <DualPairInput value={crnForm.flightNo} onChange={(v) => patchCrn({ flightNo: v })} />
            </FieldWrapper>
            <FieldWrapper label="Origin" required>
              <Input value={crnForm.origin} onChange={(e) => patchCrn({ origin: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Destination" required>
              <LookupPairInput lookup="destination" value={crnForm.destination} onChange={(v) => patchCrn({ destination: v })} />
            </FieldWrapper>

            <FieldWrapper label="From Name" required>
              <LookupPairInput lookup="serviceCentre" value={crnForm.fromName} onChange={(v) => patchCrn({ fromName: v })} />
            </FieldWrapper>
            <FieldWrapper label="Address 1">
              <Input value={crnForm.fromAddress1} onChange={(e) => patchCrn({ fromAddress1: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Address 2">
              <Input value={crnForm.fromAddress2} onChange={(e) => patchCrn({ fromAddress2: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="City">
              <Input value={crnForm.fromCity} onChange={(e) => patchCrn({ fromCity: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="State">
              <Input value={crnForm.fromState} onChange={(e) => patchCrn({ fromState: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Pin Code">
              <Input value={crnForm.fromPinCode} onChange={(e) => patchCrn({ fromPinCode: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Mobile No.">
              <Input value={crnForm.fromMobile} onChange={(e) => patchCrn({ fromMobile: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Tel. No.">
              <Input value={crnForm.fromTel} onChange={(e) => patchCrn({ fromTel: e.target.value })} />
            </FieldWrapper>

            <FieldWrapper label="To Name" required>
              <LookupPairInput lookup="vendor" value={crnForm.toName} onChange={(v) => patchCrn({ toName: v })} />
            </FieldWrapper>
            <FieldWrapper label="Address 1">
              <Input value={crnForm.toAddress1} onChange={(e) => patchCrn({ toAddress1: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Address 2">
              <Input value={crnForm.toAddress2} onChange={(e) => patchCrn({ toAddress2: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="City">
              <Input value={crnForm.toCity} onChange={(e) => patchCrn({ toCity: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="State">
              <Input value={crnForm.toState} onChange={(e) => patchCrn({ toState: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Pin Code">
              <Input value={crnForm.toPinCode} onChange={(e) => patchCrn({ toPinCode: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Mobile No">
              <Input value={crnForm.toMobile} onChange={(e) => patchCrn({ toMobile: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Tel. No.">
              <Input value={crnForm.toTel} onChange={(e) => patchCrn({ toTel: e.target.value })} />
            </FieldWrapper>

            <FieldWrapper label="Master AWB No." required>
              <Input value={crnForm.masterAwbNo} onChange={(e) => patchCrn({ masterAwbNo: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="CD No." required>
              <Input value={crnForm.cdNo} onChange={(e) => patchCrn({ cdNo: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Remarks">
              <Input value={crnForm.remarks} onChange={(e) => patchCrn({ remarks: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="No Of Bags" required>
              <Input value={crnForm.noOfBags} onChange={(e) => patchCrn({ noOfBags: e.target.value })} />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleCrnPrint} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Print</Button>
            <Button variant="destructive" onClick={closeCrnDialog}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{authed ? "Cancel manifest?" : "Delete manifest?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {authed
                ? `This will cancel manifest ${deleteTarget?.manifestNo}.`
                : `This will permanently remove manifest ${deleteTarget?.manifestNo}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {authed ? "Cancel Manifest" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(importSummary?.open)} onOpenChange={(o) => !o && setImportSummary(null)}>
        <DialogContent className="max-w-lg gap-0 p-0 sm:max-w-lg">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Excel Import Summary
            </DialogTitle>
          </div>
          <div className="p-6">
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <div className="text-xs font-semibold uppercase">Accepted</div>
                <div className="text-2xl font-bold">{importSummary?.accepted ?? 0}</div>
              </div>
              <div className="rounded-md border bg-destructive/10 p-3 text-destructive">
                <div className="text-xs font-semibold uppercase">Rejected / Skipped</div>
                <div className="text-2xl font-bold">{importSummary?.skipped.length ?? 0}</div>
              </div>
            </div>

            {importSummary?.skipped && importSummary.skipped.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                  Skipped Shipments & Reasons:
                </p>
                <div className="max-h-60 overflow-y-auto rounded-md border divide-y text-xs">
                  {importSummary.skipped.map((s, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 p-2.5 bg-muted/20">
                      <span className="font-mono font-bold text-foreground shrink-0">{s.awb}</span>
                      <span className="text-destructive text-right">{s.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end border-t bg-muted/20 px-6 py-3">
            <Button onClick={() => setImportSummary(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManifestMoreMenu({
  row,
  onDownloadAll,
}: {
  row: ManifestRow;
  onDownloadAll: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerHover, setTriggerHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const moreActions = [
    { label: "Print AWB", icon: Printer, className: "", action: () => toast.info(`Print AWB for ${row.manifestNo} will be enabled with backend wiring`) },
    { label: "Download All", icon: CloudDownload, className: "text-emerald-600", action: onDownloadAll },
    { label: "Download All Tiff", icon: FileImage, className: "text-sidebar", action: () => toast.info(`Download All Tiff for ${row.manifestNo} will be enabled with backend wiring`) },
    { label: "Download Tiff", icon: FileImage, className: "text-sidebar", action: () => toast.info(`Download Tiff for ${row.manifestNo} will be enabled with backend wiring`) },
    { label: "Email", icon: Mail, className: "text-sidebar", action: () => toast.info(`Email for ${row.manifestNo} will be enabled with backend wiring`) },
    { label: "Bag Label", icon: Tag, className: "text-sidebar", action: () => toast.info(`Bag Label for ${row.manifestNo} will be enabled with backend wiring`) },
    { label: "Download KYC", icon: UserRound, className: "text-sidebar", action: () => toast.info(`Download KYC for ${row.manifestNo} will be enabled with backend wiring`) },
    { label: "Api", icon: Radio, className: "text-sidebar", action: () => toast.info(`Api for ${row.manifestNo} will be enabled with backend wiring`) },
  ] as const;

  const showTriggerTip = () => setTriggerHover(true);
  const hideTriggerTip = () => setTriggerHover(false);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-sidebar"
          aria-label="More options"
          onMouseEnter={showTriggerTip}
          onMouseLeave={hideTriggerTip}
          onPointerEnter={showTriggerTip}
          onPointerLeave={hideTriggerTip}
          onFocus={showTriggerTip}
          onBlur={hideTriggerTip}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <IconTooltipBubble anchorRef={triggerRef} label="More options" visible={triggerHover && !menuOpen} side="top" />
      <DropdownMenuContent align="end" className="flex w-auto min-w-0 flex-col gap-0.5 p-1">
        {moreActions.map(({ label, icon: Icon, className, action }) => (
          <IconButton
            key={label}
            label={label}
            tooltipSide="left"
            variant="ghost"
            size="row"
            className={cn("h-8 w-8", className)}
            onClick={action}
          >
            <Icon className="h-4 w-4" />
          </IconButton>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FormSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative rounded-md border p-4 pt-6", className)}>
      <span className="absolute -top-2.5 left-3 bg-card px-2 text-sm font-medium text-foreground">{title}</span>
      {children}
    </div>
  );
}

function NameCodeLookupInput({
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
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="min-w-0 flex-1" placeholder="Name" />
        <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} className="w-20" placeholder="Code" />
        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" aria-label="Search" onClick={() => setLookupOpen(true)}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog open={lookupOpen} onOpenChange={setLookupOpen} lookup={lookup} returnField="code" onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })} />
    </>
  );
}

function DualPairInput({
  value,
  onChange,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
}) {
  return (
    <div className="flex gap-1">
      <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} className="w-24" placeholder="Code" />
      <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="flex-1" placeholder="Name" />
    </div>
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
        <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} className="w-24" placeholder="Code" />
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="flex-1" placeholder="Name" />
        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" aria-label="Search" onClick={() => setLookupOpen(true)}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog open={lookupOpen} onOpenChange={setLookupOpen} lookup={lookup} returnField="code" onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })} />
    </>
  );
}
