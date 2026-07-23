import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  RefreshCw,
  Filter,
  Plus,
  Search,
  Pencil,
  Trash2,
  Printer,
  FileSpreadsheet,
  FileText,
  MoreVertical,
  FilePlus,
  Download,
  CloudDownload,
  FileImage,
  Mail,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  SearchableLookupPair,
  type LookupPairValue,
} from "@/components/masters/searchable-lookup-pair";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = LookupPairValue;

const BG_INPUT =
  "h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0";
const BG_SELECT =
  "h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0";
const BG_GRID =
  "grid grid-cols-1 gap-x-3 gap-y-2.5 md:grid-cols-2 xl:grid-cols-4 [&_label]:whitespace-nowrap [&_label]:text-[11px]";

function BaggingLookupField({
  label,
  lookup,
  value,
  onChange,
  required,
  readOnlyCode = false,
}: {
  label: string;
  lookup: LookupKey;
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  required?: boolean;
  /** When true, code is filled from lookup and cannot be typed (Origin City). */
  readOnlyCode?: boolean;
}) {
  return (
    <FieldWrapper borderLabel lookupSplit={readOnlyCode} label={label} required={required}>
      <SearchableLookupPair
        lookup={lookup}
        value={value}
        onChange={onChange}
        compact
        splitCode={readOnlyCode}
      />
    </FieldWrapper>
  );
}
type PageView = "list" | "entry";

type BaggingAwbLine = {
  id: string;
  bagNo: string;
  crnMhbsNo: string;
  forwardingNo: string;
  awbNo: string;
  weight: string;
  pcs: string;
  shipper: string;
  consignee: string;
  vendor: string;
  airline: string;
  service: string;
};

type BaggingForm = {
  manifestNo: string;
  date: string;
  originCity: LookupPair;
  originCountry: LookupPair;
  airlinesCode: LookupPair;
  arrivalAirport: string;
  masterAirlinesPrefix: string;
  masterAwbNoPart: string;
  masterNoPart3: string;
  mawbMasterNo: string;
  vendor: LookupPair;
  cdNo: string;
  ediMasterNo: string;
  baggingRemark: string;
  serviceCenter: LookupPair;
  destCountry: LookupPair;
  destCity: LookupPair;
  flightNo1: LookupPair;
  flightNo2: LookupPair;
  arrivalDate: string;
  isForwarding: boolean;
  searchAwbBagNo: string;
  awbLines: BaggingAwbLine[];
};

type BaggingRow = {
  id: string;
  manifestNo: string;
  masterAwbNo: string;
  date: string;
  origin: string;
  from: string;
  to: string;
  destination: string;
  vendorName: string;
  shipment: number;
  weight: string;
  form: BaggingForm;
};

type ColFilterKey =
  | "manifestNo"
  | "masterAwbNo"
  | "date"
  | "origin"
  | "from"
  | "to"
  | "destination"
  | "vendor"
  | "shipment"
  | "weight";

type ListFilters = {
  product: LookupPair;
  vendor: LookupPair;
  format: string;
};

type AwbDraft = {
  bagNo: string;
  crnMhbsNo: string;
  forwardingNo: string;
  awbNo: string;
  weight: string;
  pcs: string;
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

type DownloadTiffForm = {
  runNo: string;
  selectType: string;
  fromBagNo: string;
  toBagNo: string;
};

const DOWNLOAD_ALL_TYPES = ["AWBNo", "Forwarding No 1", "Forwarding No 2"] as const;
const DOWNLOAD_TIFF_TYPES = ["CSB-III", "CSB-IV", "CSB-V"] as const;
const FORMAT_OPTIONS = [
  "Format 1",
  "Format 2",
  "Format 3",
  "Format 4",
  "Format 5",
  "Format 6",
] as const;

const SEED_AWB_META: Record<
  string,
  Omit<BaggingAwbLine, "id" | "bagNo" | "crnMhbsNo" | "forwardingNo" | "awbNo">
> = {
  "30403918": {
    weight: "36.000",
    pcs: "1",
    shipper: "TPC ADDANKI",
    consignee: "ELURI SIVARAMAKRISHNA",
    vendor: "DTDC AUSTRALIA",
    airline: "QF",
    service: "SPX",
  },
  "30403919": {
    weight: "26.800",
    pcs: "1",
    shipper: "FEDEX INTERNATIONAL COURIER",
    consignee: "JOHN SMITH",
    vendor: "DTDC AUSTRALIA",
    airline: "QF",
    service: "SPX",
  },
  "30403920": {
    weight: "18.500",
    pcs: "2",
    shipper: "HYDERABAD EXPORTS",
    consignee: "DAVID WILSON",
    vendor: "DTDC NEWZEALAND",
    airline: "NZ",
    service: "SPX",
  },
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const nowProgressTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const emptyProgressForm = (): ProgressForm => ({
  bagNo: "",
  progressDate: todayIso(),
  progressTime: nowProgressTime(),
  serviceCentre: emptyPair(),
  exception: emptyPair(),
});

const emptyDownloadAllForm = (): DownloadAllForm => ({
  selectType: "AWBNo",
  fromBagNo: "",
  toBagNo: "",
});

const emptyDownloadTiffForm = (runNo = ""): DownloadTiffForm => ({
  runNo,
  selectType: "",
  fromBagNo: "",
  toBagNo: "",
});

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const parseWeight = (value: string) => {
  const n = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const formatWeight = (value: number) => value.toFixed(3);

const emptyAwbDraft = (): AwbDraft => ({
  bagNo: "1",
  crnMhbsNo: "",
  forwardingNo: "",
  awbNo: "",
  weight: "",
  pcs: "1",
});

const emptyForm = (): BaggingForm => ({
  manifestNo: "0",
  date: todayIso(),
  originCity: { code: "HYD", name: "HYD" },
  originCountry: { code: "IN", name: "INDIA" },
  airlinesCode: emptyPair(),
  arrivalAirport: "",
  masterAirlinesPrefix: "",
  masterAwbNoPart: "",
  masterNoPart3: "",
  mawbMasterNo: "",
  vendor: emptyPair(),
  cdNo: "",
  ediMasterNo: "",
  baggingRemark: "",
  serviceCenter: emptyPair(),
  destCountry: emptyPair(),
  destCity: emptyPair(),
  flightNo1: emptyPair(),
  flightNo2: emptyPair(),
  arrivalDate: "",
  isForwarding: false,
  searchAwbBagNo: "",
  awbLines: [],
});

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  manifestNo: "",
  masterAwbNo: "",
  date: "",
  origin: "",
  from: "",
  to: "",
  destination: "",
  vendor: "",
  shipment: "",
  weight: "",
});

const emptyListFilters = (): ListFilters => ({
  product: emptyPair(),
  vendor: emptyPair(),
  format: "Format 1",
});

const lookupAwbLine = (draft: AwbDraft): Omit<BaggingAwbLine, "id"> => {
  const meta = SEED_AWB_META[draft.awbNo.trim()];
  return {
    bagNo: draft.bagNo.trim() || "1",
    crnMhbsNo: draft.crnMhbsNo.trim(),
    forwardingNo: draft.forwardingNo.trim(),
    awbNo: draft.awbNo.trim(),
    weight: draft.weight.trim() || meta?.weight || "10.000",
    pcs: draft.pcs.trim() || meta?.pcs || "1",
    shipper: meta?.shipper || "SAMPLE SHIPPER",
    consignee: meta?.consignee || "SAMPLE CONSIGNEE",
    vendor: meta?.vendor || "DTDC AUSTRALIA",
    airline: meta?.airline || "QF",
    service: meta?.service || "SPX",
  };
};

const composeMasterAwbNo = (form: BaggingForm) => {
  const parts = [form.masterAirlinesPrefix, form.masterAwbNoPart, form.masterNoPart3]
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join("");
  return form.mawbMasterNo.trim();
};

const formToRow = (form: BaggingForm, id: string, existing?: BaggingRow): BaggingRow => {
  const totalWeight = form.awbLines.reduce((sum, line) => sum + parseWeight(line.weight), 0);
  const masterAwbNo = composeMasterAwbNo(form) || existing?.masterAwbNo || "";
  const shipment = form.awbLines.length || existing?.shipment || 0;
  const weight =
    form.awbLines.length > 0 ? formatWeight(totalWeight) : existing?.weight || "0.000";
  return {
    id,
    manifestNo: form.manifestNo.trim() || existing?.manifestNo || "0",
    masterAwbNo,
    date: form.date,
    origin: form.originCity.code.trim() || form.originCity.name.trim(),
    from: form.originCity.code.trim() || form.originCity.name.trim(),
    to: form.destCity.code.trim() || form.destCity.name.trim(),
    destination: form.destCity.code.trim() || form.destCity.name.trim(),
    vendorName: form.vendor.name.trim() || form.vendor.code.trim(),
    shipment,
    weight,
    form: {
      ...form,
      awbLines: form.awbLines.map((line) => ({ ...line })),
    },
  };
};

const nextManifestNo = (rows: BaggingRow[]) => {
  const max = rows.reduce((acc, row) => {
    const part = Number.parseInt(row.manifestNo, 10);
    return Number.isFinite(part) ? Math.max(acc, part) : acc;
  }, 0);
  return String(max + 1).padStart(4, "0");
};

const formatAwbInBagLabel = (line: BaggingAwbLine) =>
  `${line.awbNo} (Weight [${line.weight}] PCS[${line.pcs}]CRN No. [${line.crnMhbsNo}])`;

const maxBagNo = (lines: BaggingAwbLine[]) => {
  const nums = lines.map((line) => Number.parseInt(line.bagNo, 10)).filter(Number.isFinite);
  return nums.length === 0 ? 1 : Math.max(...nums);
};

const buildSeedForm = (partial: Partial<BaggingForm> & { awbLines?: BaggingAwbLine[] }): BaggingForm => ({
  ...emptyForm(),
  ...partial,
  awbLines: partial.awbLines ?? [],
});

const buildSeed0044AwbLines = (): BaggingAwbLine[] => {
  const lines: BaggingAwbLine[] = [];
  const bagSpecs: { bagNo: string; awbs: { awbNo: string; weight: string; pcs: string; crn?: string }[] }[] = [
    { bagNo: "1", awbs: [{ awbNo: "30403310", weight: "17.000", pcs: "1" }] },
    { bagNo: "2", awbs: [{ awbNo: "30403311", weight: "8.000", pcs: "1" }, { awbNo: "30403312", weight: "8.000", pcs: "1" }] },
    { bagNo: "3", awbs: [{ awbNo: "30403313", weight: "20.000", pcs: "2" }] },
    { bagNo: "4", awbs: [{ awbNo: "30403314", weight: "11.500", pcs: "1" }, { awbNo: "30403315", weight: "11.500", pcs: "1" }] },
  ];

  for (let bag = 5; bag <= 51; bag++) {
    bagSpecs.push({
      bagNo: String(bag),
      awbs: [{ awbNo: String(30403315 + bag), weight: formatWeight(1139.05 / 47), pcs: "1" }],
    });
  }

  bagSpecs.push({
    bagNo: "52",
    awbs: [{ awbNo: "30403464", weight: "22.850", pcs: "1", crn: "A10020752" }],
  });

  for (const spec of bagSpecs) {
    for (const awb of spec.awbs) {
      lines.push({
        id: crypto.randomUUID(),
        bagNo: spec.bagNo,
        awbNo: awb.awbNo,
        crnMhbsNo: awb.crn ?? `A100207${spec.bagNo.padStart(2, "0")}`,
        forwardingNo: "",
        weight: awb.weight,
        pcs: awb.pcs,
        shipper: awb.awbNo === "30403464" ? "TPC ADDANKI" : "SAMPLE SHIPPER",
        consignee: awb.awbNo === "30403464" ? "ELURI SIVARAMAKRISHNA" : "SAMPLE CONSIGNEE",
        vendor: "DTDC AUSTRALIA",
        airline: "AIR ASIA",
        service: "SPX",
      });
    }
  }

  return lines;
};

const SEED_0044_FORM: BaggingForm = buildSeedForm({
  manifestNo: "0044",
  date: "2026-07-02",
  originCity: { code: "HYD", name: "HYDERABAD" },
  originCountry: { code: "IN", name: "INDIA" },
  airlinesCode: { code: "", name: "AIR ASIA" },
  arrivalAirport: "AUS",
  masterAirlinesPrefix: "807",
  masterAwbNoPart: "3814",
  masterNoPart3: "2580",
  mawbMasterNo: "80738142580",
  vendor: { code: "DTAU", name: "DTDC AUSTRALIA" },
  cdNo: "",
  ediMasterNo: "A100207",
  baggingRemark: "",
  serviceCenter: { code: "MEL", name: "MELBOURNE" },
  destCountry: { code: "AU", name: "AUSTRALIA" },
  destCity: { code: "MEL", name: "MELBOURNE" },
  flightNo1: { code: "Ak068", name: "Air Asia 15" },
  flightNo2: { code: "GA716", name: "AIR ASIA 21" },
  arrivalDate: "2026-07-05",
  isForwarding: false,
  searchAwbBagNo: "",
  awbLines: buildSeed0044AwbLines(),
});

const SEED_ROWS: BaggingRow[] = [
  {
    id: "seed-0044",
    manifestNo: "0044",
    masterAwbNo: "80738142580",
    date: "2026-07-02",
    origin: "HYD",
    from: "HYD",
    to: "MEL",
    destination: "MEL",
    vendorName: "DTDC AUSTRALIA",
    shipment: 51,
    weight: "1237.900",
    form: SEED_0044_FORM,
  },
  {
    id: "seed-0043",
    manifestNo: "0043",
    masterAwbNo: "80738142580",
    date: "2026-07-02",
    origin: "BLR",
    from: "BLR",
    to: "AKL",
    destination: "AKL",
    vendorName: "DTDC NEWZEALAND",
    shipment: 47,
    weight: "985.500",
    form: buildSeedForm({
      manifestNo: "0043",
      date: "2026-07-02",
      originCity: { code: "BLR", name: "BLR" },
      originCountry: { code: "IN", name: "INDIA" },
      vendor: { code: "DTNZ", name: "DTDC NEWZEALAND" },
      destCity: { code: "AKL", name: "AUCKLAND" },
      destCountry: { code: "NZ", name: "NEW ZEALAND" },
      mawbMasterNo: "80738142580",
      serviceCenter: { code: "BLR", name: "BLR" },
      flightNo1: { code: "NZ456", name: "NZ456" },
    }),
  },
  ...[
    { no: "0042", origin: "HYD", to: "MEL", vendor: "DTDC AUSTRALIA", shipment: 44, weight: "1102.300" },
    { no: "0041", origin: "HYD", to: "SYD", vendor: "DTDC AUSTRALIA", shipment: 38, weight: "892.150" },
    { no: "0040", origin: "BLR", to: "AKL", vendor: "DTDC NEWZEALAND", shipment: 35, weight: "756.800" },
    { no: "0039", origin: "HYD", to: "MEL", vendor: "DTDC AUSTRALIA", shipment: 42, weight: "998.400" },
    { no: "0038", origin: "HYD", to: "BNE", vendor: "DTDC AUSTRALIA", shipment: 29, weight: "645.200" },
    { no: "0037", origin: "BLR", to: "AKL", vendor: "DTDC NEWZEALAND", shipment: 33, weight: "712.600" },
    { no: "0036", origin: "HYD", to: "MEL", vendor: "DTDC AUSTRALIA", shipment: 40, weight: "934.100" },
    { no: "0035", origin: "HYD", to: "PER", vendor: "DTDC AUSTRALIA", shipment: 27, weight: "589.750" },
  ].map((item) => ({
    id: `seed-${item.no}`,
    manifestNo: item.no,
    masterAwbNo: "80738142580",
    date: "2026-07-02",
    origin: item.origin,
    from: item.origin,
    to: item.to,
    destination: item.to,
    vendorName: item.vendor,
    shipment: item.shipment,
    weight: item.weight,
    form: buildSeedForm({
      manifestNo: item.no,
      date: "2026-07-02",
      originCity: { code: item.origin, name: item.origin },
      originCountry: { code: "IN", name: "INDIA" },
      vendor: { code: item.vendor.includes("NEW") ? "DTNZ" : "DTAU", name: item.vendor },
      destCity: { code: item.to, name: item.to },
      mawbMasterNo: "80738142580",
      serviceCenter: { code: item.origin, name: item.origin },
    }),
  })),
];

export const Route = createFileRoute("/transaction/bagging")({
  head: () => ({
    meta: [
      { title: "Bagging — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage bagging manifests with AWB scanning." },
    ],
  }),
  component: BaggingPage,
});

function BaggingPage() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<PageView>("list");
  const [rows, setRows] = useState<BaggingRow[]>(SEED_ROWS);
  const [editing, setEditing] = useState<BaggingRow | null>(null);
  const [form, setForm] = useState<BaggingForm>(emptyForm());
  const [awbDraft, setAwbDraft] = useState<AwbDraft>(emptyAwbDraft());
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [awbInBagSearch, setAwbInBagSearch] = useState("");
  const [listFilters, setListFilters] = useState<ListFilters>(emptyListFilters);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<BaggingRow | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressMode, setProgressMode] = useState<ProgressMode>("add");
  const [progressManifest, setProgressManifest] = useState<BaggingRow | null>(null);
  const [progressForm, setProgressForm] = useState<ProgressForm>(emptyProgressForm);
  const [downloadAllOpen, setDownloadAllOpen] = useState(false);
  const [downloadAllRow, setDownloadAllRow] = useState<BaggingRow | null>(null);
  const [downloadAllForm, setDownloadAllForm] = useState<DownloadAllForm>(emptyDownloadAllForm);
  const [downloadTiffOpen, setDownloadTiffOpen] = useState(false);
  const [downloadTiffAllMode, setDownloadTiffAllMode] = useState(false);
  const [downloadTiffRow, setDownloadTiffRow] = useState<BaggingRow | null>(null);
  const [downloadTiffForm, setDownloadTiffForm] = useState<DownloadTiffForm>(emptyDownloadTiffForm());

  const patchForm = (patch: Partial<BaggingForm>) => setForm((f) => ({ ...f, ...patch }));
  const patchProgress = (patch: Partial<ProgressForm>) => setProgressForm((f) => ({ ...f, ...patch }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const d = formatDisplayDate(row.date);
      if (listFilters.product.code && !row.form.originCity.code.includes(listFilters.product.code)) return false;
      if (listFilters.product.name && !row.vendorName.toLowerCase().includes(listFilters.product.name.toLowerCase())) {
        // product filter loosely matches vendor in demo data
      }
      if (listFilters.vendor.code && row.form.vendor.code !== listFilters.vendor.code) return false;
      if (listFilters.vendor.name && !row.vendorName.toLowerCase().includes(listFilters.vendor.name.toLowerCase())) {
        return false;
      }
      if (q) {
        const hay = [
          row.manifestNo,
          row.masterAwbNo,
          d,
          row.origin,
          row.from,
          row.to,
          row.destination,
          row.vendorName,
          String(row.shipment),
          row.weight,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const cf = colFilters;
      if (cf.manifestNo && !row.manifestNo.toLowerCase().includes(cf.manifestNo.toLowerCase())) return false;
      if (cf.masterAwbNo && !row.masterAwbNo.toLowerCase().includes(cf.masterAwbNo.toLowerCase())) return false;
      if (cf.date && !d.includes(cf.date)) return false;
      if (cf.origin && !row.origin.toLowerCase().includes(cf.origin.toLowerCase())) return false;
      if (cf.from && !row.from.toLowerCase().includes(cf.from.toLowerCase())) return false;
      if (cf.to && !row.to.toLowerCase().includes(cf.to.toLowerCase())) return false;
      if (cf.destination && !row.destination.toLowerCase().includes(cf.destination.toLowerCase())) return false;
      if (cf.vendor && !row.vendorName.toLowerCase().includes(cf.vendor.toLowerCase())) return false;
      if (cf.shipment && !String(row.shipment).includes(cf.shipment)) return false;
      if (cf.weight && !row.weight.includes(cf.weight)) return false;
      return true;
    });
  }, [rows, search, colFilters, listFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const selectedLine = form.awbLines.find((line) => line.id === selectedLineId) ?? null;

  const awbInBagLines = useMemo(() => {
    const q = awbInBagSearch.trim().toLowerCase();
    return form.awbLines.filter(
      (line) =>
        !q ||
        line.awbNo.toLowerCase().includes(q) ||
        line.bagNo.toLowerCase().includes(q),
    );
  }, [form.awbLines, awbInBagSearch]);

  const bagSummaries = useMemo(() => {
    const map = new Map<string, { awbCount: number; weight: number }>();
    for (const line of form.awbLines) {
      const cur = map.get(line.bagNo) ?? { awbCount: 0, weight: 0 };
      map.set(line.bagNo, {
        awbCount: cur.awbCount + 1,
        weight: cur.weight + parseWeight(line.weight),
      });
    }
    return Array.from(map.entries())
      .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
      .map(([bagNo, stats]) => ({
        bagNo,
        awbCount: stats.awbCount,
        weight: formatWeight(stats.weight),
      }));
  }, [form.awbLines]);

  const summary = useMemo(() => {
    const bagNos = new Set(form.awbLines.map((line) => line.bagNo).filter(Boolean));
    const totalPieces = form.awbLines.reduce((sum, line) => sum + (Number.parseInt(line.pcs, 10) || 0), 0);
    const totalWeight = form.awbLines.reduce((sum, line) => sum + parseWeight(line.weight), 0);
    const currentBagWeight = form.awbLines
      .filter((line) => line.bagNo === awbDraft.bagNo)
      .reduce((sum, line) => sum + parseWeight(line.weight), 0);
    const maxBag = Math.max(maxBagNo(form.awbLines), Number.parseInt(awbDraft.bagNo, 10) || 0);
    return {
      bagWeight: formatWeight(currentBagWeight),
      consigneePinCode: "",
      totalBagNo: bagNos.size > 0 ? maxBag : 0,
      totalPieces,
      totalAwbNo: form.awbLines.length,
      totalWeight: form.awbLines.length > 0 ? formatWeight(totalWeight) : editing?.weight || "0.000",
    };
  }, [form.awbLines, awbDraft.bagNo, editing]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm(), date: todayIso(), manifestNo: nextManifestNo(rows) });
    setAwbDraft(emptyAwbDraft());
    setSelectedLineId(null);
    setAwbInBagSearch("");
    setView("entry");
  };

  const openEntry = (row: BaggingRow) => {
    setEditing(row);
    const loadedForm = {
      ...row.form,
      awbLines: row.form.awbLines.map((line) => ({ ...line })),
    };
    setForm(loadedForm);
    const nextBag = String(maxBagNo(loadedForm.awbLines) || 1);
    setAwbDraft({ ...emptyAwbDraft(), bagNo: nextBag });
    const featured = loadedForm.awbLines.find((line) => line.awbNo === "30403464");
    setSelectedLineId(featured?.id ?? loadedForm.awbLines[0]?.id ?? null);
    setAwbInBagSearch("");
    setView("entry");
  };

  const closeEntry = () => {
    setView("list");
    setEditing(null);
    setForm(emptyForm());
    setAwbDraft(emptyAwbDraft());
    setSelectedLineId(null);
    setAwbInBagSearch("");
  };

  const persistEntry = () => {
    if (!form.manifestNo.trim() || form.manifestNo.trim() === "0") {
      return toast.error("Manifest No is required");
    }
    if (!form.date.trim()) {
      return toast.error("Date is required");
    }
    if (!form.originCity.code.trim() && !form.originCity.name.trim()) {
      return toast.error("Origin City is required");
    }
    if (!form.originCountry.code.trim() && !form.originCountry.name.trim()) {
      return toast.error("Origin Country is required");
    }
    if (!form.vendor.code.trim() && !form.vendor.name.trim()) {
      return toast.error("Vendor is required");
    }
    if (!form.serviceCenter.code.trim() && !form.serviceCenter.name.trim()) {
      return toast.error("Service Center is required");
    }
    if (!form.destCity.code.trim() && !form.destCity.name.trim()) {
      return toast.error("Dest City is required");
    }
    if (!form.flightNo1.code.trim() && !form.flightNo1.name.trim()) {
      return toast.error("Flight No 1 is required");
    }

    const payloadForm: BaggingForm = {
      ...form,
      date: form.date || todayIso(),
      manifestNo: form.manifestNo.trim() || nextManifestNo(rows),
    };
    const payload = formToRow(payloadForm, editing?.id ?? crypto.randomUUID(), editing ?? undefined);

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? payload : r)));
      toast.success("Bagging manifest saved");
    } else {
      setRows((prev) => [payload, ...prev]);
      toast.success("Bagging manifest created");
    }
    closeEntry();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted manifest ${deleteTarget.manifestNo}`);
    setDeleteTarget(null);
  };

  const handleRefresh = () => {
    setPage(1);
    toast.success("List refreshed");
  };

  const clearColFilters = () => {
    setColFilters(emptyColFilters());
    setSearch("");
    setPage(1);
    toast.success("Filters cleared");
  };

  const exportBaggingRowCsv = (row: BaggingRow, linesOverride?: BaggingAwbLine[]) => {
    const safeName = row.manifestNo.replace(/\//g, "-");
    const lines = linesOverride ?? row.form.awbLines;
    if (lines.length === 0) {
      downloadCsv(
        `${safeName}.csv`,
        ["Manifest No", "Master AWBNo", "Date", "Vendor", "Shipment", "Weight"],
        [[row.manifestNo, row.masterAwbNo, formatDisplayDate(row.date), row.vendorName, String(row.shipment), row.weight]],
      );
    } else {
      downloadCsv(
        `${safeName}.csv`,
        ["Bag No", "CRN MHBS No", "Forwarding No", "AWB No", "Weight", "PCS"],
        lines.map((line) => [
          line.bagNo,
          line.crnMhbsNo,
          line.forwardingNo,
          line.awbNo,
          line.weight,
          line.pcs,
        ]),
      );
    }
    toast.success(`Exported ${safeName}.csv`);
  };

  const exportRowCsv = (row: BaggingRow) => exportBaggingRowCsv(row);

  const exportRowCsvM = (row: BaggingRow) => {
    const safeName = `${row.manifestNo.replace(/\//g, "-")}-m`;
    downloadCsv(
      `${safeName}.csv`,
      ["ManifestNo", "MasterAWBNo", "AWBNo", "BagNo", "Weight", "PCS"],
      row.form.awbLines.length > 0
        ? row.form.awbLines.map((line) => [
            row.manifestNo,
            row.masterAwbNo,
            line.awbNo,
            line.bagNo,
            line.weight,
            line.pcs,
          ])
        : [[row.manifestNo, row.masterAwbNo, "", "", row.weight, String(row.shipment)]],
    );
    toast.success(`Exported ${safeName}.csv`);
  };

  const exportRowCsb = (row: BaggingRow) => {
    const safeName = `${row.manifestNo.replace(/\//g, "-")}.csb`;
    downloadCsv(
      safeName,
      ["Manifest", "MasterAWB", "Origin", "Destination", "Vendor", "Shipment", "Weight"],
      [[row.manifestNo, row.masterAwbNo, row.origin, row.destination, row.vendorName, String(row.shipment), row.weight]],
    );
    toast.success(
      `Exported ${safeName} (local). Full CSB-III/IV/V sandbox export is under Utility → Integration Configuration.`,
    );
  };

  const openAddProgress = (row: BaggingRow) => {
    setProgressManifest(row);
    setProgressMode("add");
    setProgressForm({
      ...emptyProgressForm(),
      serviceCentre: row.form.serviceCenter.code
        ? row.form.serviceCenter
        : { code: row.origin || "HYD", name: row.origin || "HYD" },
    });
    setProgressOpen(true);
  };

  const closeAddProgress = () => {
    setProgressOpen(false);
    setProgressManifest(null);
    setProgressMode("add");
    setProgressForm(emptyProgressForm());
  };

  const handleProgressSave = () => {
    if (!progressForm.serviceCentre.code.trim() && !progressForm.serviceCentre.name.trim()) {
      return toast.error("Service Centre is required");
    }
    const action = progressMode === "add" ? "added" : "deleted";
    toast.success(`Progress ${action} for ${progressManifest?.manifestNo ?? "manifest"}`);
    closeAddProgress();
  };

  const openDownloadAll = (row: BaggingRow) => {
    setDownloadAllRow(row);
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
    let lines = downloadAllRow.form.awbLines;
    const { fromBagNo, toBagNo, selectType } = downloadAllForm;
    if (fromBagNo.trim() || toBagNo.trim()) {
      const from = Number.parseInt(fromBagNo, 10);
      const to = Number.parseInt(toBagNo, 10);
      lines = lines.filter((line) => {
        const bag = Number.parseInt(line.bagNo, 10);
        if (!Number.isFinite(bag)) return true;
        if (Number.isFinite(from) && bag < from) return false;
        if (Number.isFinite(to) && bag > to) return false;
        return true;
      });
    }
    if (selectType === "Forwarding No 1" || selectType === "Forwarding No 2") {
      lines = lines.filter((line) => line.forwardingNo.trim());
    }
    exportBaggingRowCsv(downloadAllRow, lines);
    closeDownloadAll();
  };

  const openDownloadTiff = (row: BaggingRow, options?: { all?: boolean }) => {
    setDownloadTiffRow(row);
    setDownloadTiffAllMode(options?.all ?? false);
    setDownloadTiffForm(emptyDownloadTiffForm(row.manifestNo));
    setDownloadTiffOpen(true);
  };

  const closeDownloadTiff = () => {
    setDownloadTiffOpen(false);
    setDownloadTiffAllMode(false);
    setDownloadTiffRow(null);
    setDownloadTiffForm(emptyDownloadTiffForm());
  };

  const handleDownloadTiffExport = () => {
    if (!downloadTiffRow) return;
    if (!downloadTiffForm.selectType) return toast.error("Select Type is required");

    let lines = downloadTiffRow.form.awbLines;
    const { fromBagNo, toBagNo } = downloadTiffForm;
    if (fromBagNo.trim() || toBagNo.trim()) {
      const from = Number.parseInt(fromBagNo, 10);
      const to = Number.parseInt(toBagNo, 10);
      lines = lines.filter((line) => {
        const bag = Number.parseInt(line.bagNo, 10);
        if (!Number.isFinite(bag)) return true;
        if (Number.isFinite(from) && bag < from) return false;
        if (Number.isFinite(to) && bag > to) return false;
        return true;
      });
    }

    const safeName = `${downloadTiffRow.manifestNo.replace(/\//g, "-")}-${downloadTiffForm.selectType}`;
    downloadCsv(
      `${safeName}.csv`,
      ["Run No", "Type", "Bag No", "AWB No", "Weight", "PCS"],
      lines.length > 0
        ? lines.map((line) => [
            downloadTiffForm.runNo,
            downloadTiffForm.selectType,
            line.bagNo,
            line.awbNo,
            line.weight,
            line.pcs,
          ])
        : [[downloadTiffForm.runNo, downloadTiffForm.selectType, "", "", downloadTiffRow.weight, ""]],
    );
    toast.success(
      downloadTiffAllMode
        ? `All Tiff export prepared for ${downloadTiffForm.runNo}`
        : `Tiff export prepared for ${downloadTiffForm.runNo}`,
    );
    closeDownloadTiff();
  };

  const addAwbLine = () => {
    const awb = awbDraft.awbNo.trim();
    if (!awb) return toast.error("AWB No is required");
    if (form.awbLines.some((line) => line.awbNo === awb)) {
      return toast.error(`AWB ${awb} is already added`);
    }
    const line: BaggingAwbLine = {
      id: crypto.randomUUID(),
      ...lookupAwbLine(awbDraft),
    };
    patchForm({ awbLines: [...form.awbLines, line] });
    setSelectedLineId(line.id);
    setAwbDraft((d) => ({ ...d, awbNo: "", forwardingNo: "", crnMhbsNo: "", weight: "" }));
    toast.success(`AWB ${awb} added`);
  };

  const incrementBagNo = () => {
    const next = String((Number.parseInt(awbDraft.bagNo, 10) || 0) + 1);
    setAwbDraft((d) => ({ ...d, bagNo: next }));
    toast.success(`Bag No set to ${next}`);
  };

  const removeAwbLine = (lineId: string) => {
    patchForm({ awbLines: form.awbLines.filter((line) => line.id !== lineId) });
    if (selectedLineId === lineId) setSelectedLineId(null);
    toast.success("AWB removed");
  };

  const removeBagSummary = (bagNo: string) => {
    patchForm({ awbLines: form.awbLines.filter((line) => line.bagNo !== bagNo) });
    if (selectedLine?.bagNo === bagNo) setSelectedLineId(null);
    toast.success(`Bag ${bagNo} removed`);
  };

  const awbInBagCount = summary.totalBagNo || bagSummaries.length;

  if (view === "entry") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "Bagging"]} />

        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <div className={BG_GRID}>
              <FieldWrapper
                borderLabel
                label="Manifest No"
                required
                invalid={!form.manifestNo.trim() || form.manifestNo.trim() === "0"}
              >
                <Input
                  className={BG_INPUT}
                  value={form.manifestNo}
                  onChange={(e) => patchForm({ manifestNo: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="Date" required>
                <Input
                  type="date"
                  className={BG_INPUT}
                  value={form.date}
                  onChange={(e) => patchForm({ date: e.target.value })}
                />
              </FieldWrapper>
              <BaggingLookupField
                label="Origin City"
                lookup="destination"
                value={form.originCity}
                onChange={(originCity) => patchForm({ originCity })}
                required
                readOnlyCode
              />
              <FieldWrapper borderLabel label="Origin Country" required>
                <DualPairInput
                  value={form.originCountry}
                  onChange={(originCountry) => patchForm({ originCountry })}
                  inputClass={BG_INPUT}
                />
              </FieldWrapper>

              <BaggingLookupField
                label="Airlines Code"
                lookup="destination"
                value={form.airlinesCode}
                onChange={(airlinesCode) => patchForm({ airlinesCode })}
                required
              />
              <FieldWrapper borderLabel label="Arrival Airport">
                <Input
                  className={BG_INPUT}
                  value={form.arrivalAirport}
                  onChange={(e) => patchForm({ arrivalAirport: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="Master No">
                <div className="grid min-w-0 flex-1 grid-cols-3 gap-0 divide-x divide-input">
                  <Input
                    className={BG_INPUT}
                    value={form.masterAirlinesPrefix}
                    onChange={(e) => patchForm({ masterAirlinesPrefix: e.target.value })}
                    placeholder="807"
                  />
                  <Input
                    className={BG_INPUT}
                    value={form.masterAwbNoPart}
                    onChange={(e) => patchForm({ masterAwbNoPart: e.target.value })}
                    placeholder="3814"
                  />
                  <Input
                    className={BG_INPUT}
                    value={form.masterNoPart3}
                    onChange={(e) => patchForm({ masterNoPart3: e.target.value })}
                    placeholder="2580"
                  />
                </div>
              </FieldWrapper>
              <FieldWrapper borderLabel label="MAWB No.">
                <Input
                  className={BG_INPUT}
                  value={form.mawbMasterNo}
                  onChange={(e) => patchForm({ mawbMasterNo: e.target.value })}
                  placeholder="Master AWB No."
                />
              </FieldWrapper>

              <BaggingLookupField
                label="Vendor"
                lookup="vendor"
                value={form.vendor}
                onChange={(vendor) => patchForm({ vendor })}
                required
              />
              <FieldWrapper borderLabel label="CD No.">
                <Input className={BG_INPUT} value={form.cdNo} onChange={(e) => patchForm({ cdNo: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper borderLabel label="EDI Master No.">
                <Input
                  className={BG_INPUT}
                  value={form.ediMasterNo}
                  onChange={(e) => patchForm({ ediMasterNo: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="Bagging Remark" className="xl:col-span-1">
                <Textarea
                  className="min-h-8 resize-none rounded-none border-0 bg-transparent px-1.5 py-1.5 text-[13px] shadow-none focus-visible:ring-0"
                  value={form.baggingRemark}
                  onChange={(e) => patchForm({ baggingRemark: e.target.value })}
                  rows={2}
                />
              </FieldWrapper>
          </div>
        </Card>

        <FormSection title="Destination">
            <div className={BG_GRID}>
              <BaggingLookupField
                label="Service Center"
                lookup="serviceCentre"
                value={form.serviceCenter}
                onChange={(serviceCenter) => patchForm({ serviceCenter })}
                required
              />
              <FieldWrapper borderLabel label="Dest Country" required>
                <DualPairInput
                  value={form.destCountry}
                  onChange={(destCountry) => patchForm({ destCountry })}
                  inputClass={BG_INPUT}
                />
              </FieldWrapper>
              <BaggingLookupField
                label="Dest City"
                lookup="destination"
                value={form.destCity}
                onChange={(destCity) => patchForm({ destCity })}
                required
              />
              <BaggingLookupField
                label="Flight No 1"
                lookup="destination"
                value={form.flightNo1}
                onChange={(flightNo1) => patchForm({ flightNo1 })}
                required
              />
              <BaggingLookupField
                label="Flight No 2"
                lookup="destination"
                value={form.flightNo2}
                onChange={(flightNo2) => patchForm({ flightNo2 })}
              />
              <FieldWrapper borderLabel label="Arrival Date">
                <Input
                  type="date"
                  className={BG_INPUT}
                  value={form.arrivalDate}
                  onChange={(e) => patchForm({ arrivalDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="IsForwarding">
                <div className="flex min-h-8 items-center px-1.5">
                  <Checkbox
                    id="isForwarding"
                    checked={form.isForwarding}
                    onCheckedChange={(c) => patchForm({ isForwarding: c === true })}
                  />
                </div>
              </FieldWrapper>
              <FieldWrapper borderLabel label="Search AWB Bag No">
                <div className="flex min-w-0 flex-1 items-stretch">
                  <Input
                    className={`min-w-0 flex-1 ${BG_INPUT}`}
                    value={form.searchAwbBagNo}
                    onChange={(e) => patchForm({ searchAwbBagNo: e.target.value })}
                  />
                  <Button
                    className="h-8 shrink-0 rounded-none border-0 border-l border-input bg-sidebar px-3 text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={() => toast.info("Bag search will be enabled with backend wiring")}
                  >
                    Search
                  </Button>
                </div>
              </FieldWrapper>
            </div>
        </FormSection>

        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
          <FormSection title={`AWB No in Bags (${awbInBagCount})`}>
              <FieldWrapper borderLabel label="Search AWB No. In Bag">
                <Input
                  className={BG_INPUT}
                  value={awbInBagSearch}
                  onChange={(e) => setAwbInBagSearch(e.target.value)}
                  placeholder="Type to search"
                />
              </FieldWrapper>
              <div className="mt-3 max-h-56 overflow-y-auto rounded-md border">
                <table className="w-full caption-bottom text-xs">
                  <TableHeader>
                    <TableRow className="bg-sidebar hover:bg-sidebar">
                      <TableHead className="text-sidebar-foreground">AWB</TableHead>
                      <TableHead className="w-10 text-center text-sidebar-foreground">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {awbInBagLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                          No AWBs in bag
                        </TableCell>
                      </TableRow>
                    ) : (
                      awbInBagLines.map((line) => (
                        <TableRow
                          key={line.id}
                          className={selectedLineId === line.id ? "bg-muted/40" : undefined}
                        >
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => setSelectedLineId(line.id)}
                              className="text-left hover:underline"
                            >
                              {formatAwbInBagLabel(line)}
                            </button>
                          </TableCell>
                          <TableCell className="text-center">
                            <IconButton
                              label="Remove AWB"
                              variant="ghost"
                              size="row"
                              className="text-destructive"
                              onClick={() => removeAwbLine(line.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </table>
              </div>
          </FormSection>

          <FormSection title="Details">
              <div className="max-h-56 overflow-auto">
                <table className="w-full caption-bottom text-xs">
                  <TableHeader>
                    <TableRow className="bg-sidebar hover:bg-sidebar">
                      <TableHead className="text-sidebar-foreground">Bag No.</TableHead>
                      <TableHead className="text-sidebar-foreground">AWB</TableHead>
                      <TableHead className="text-sidebar-foreground">Weight</TableHead>
                      <TableHead className="w-10 text-center text-sidebar-foreground">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bagSummaries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                          No details
                        </TableCell>
                      </TableRow>
                    ) : (
                      bagSummaries.map((bag) => (
                        <TableRow key={bag.bagNo}>
                          <TableCell>{bag.bagNo}</TableCell>
                          <TableCell>{bag.awbCount}</TableCell>
                          <TableCell>{bag.weight}</TableCell>
                          <TableCell className="text-center">
                            <IconButton
                              label="Remove bag"
                              variant="ghost"
                              size="row"
                              className="text-destructive"
                              onClick={() => removeBagSummary(bag.bagNo)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </table>
              </div>
          </FormSection>

          <FormSection title="AWB No Details">
              <div className="space-y-1">
                {(
                  [
                    ["AWB No.", selectedLine?.awbNo ?? ""],
                    ["Shipper", selectedLine?.shipper ?? ""],
                    ["Consignee", selectedLine?.consignee ?? ""],
                    ["Vendor", selectedLine?.vendor ?? ""],
                    ["Airline", selectedLine?.airline ?? ""],
                    ["Service", selectedLine?.service ?? ""],
                    ["Weight", selectedLine?.weight ?? ""],
                    ["Pieces", selectedLine?.pcs ?? ""],
                    [
                      "Destination",
                      selectedLine
                        ? form.destCity.name.trim() || form.destCity.code.trim()
                        : "",
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex gap-2 text-sm">
                    <span className="min-w-[5.5rem] shrink-0 font-medium text-foreground">{label} :</span>
                    <span className="min-w-0 flex-1 text-muted-foreground">{value || "\u00a0"}</span>
                  </div>
                ))}
              </div>
          </FormSection>
        </div>

        <FormSection title="Bag/AWB Details">
            <div className={BG_GRID}>
              <FieldWrapper borderLabel label="Bag No">
                <div className="flex min-w-0 flex-1 items-stretch">
                  <Input
                    className={`min-w-0 flex-1 ${BG_INPUT}`}
                    value={awbDraft.bagNo}
                    onChange={(e) => setAwbDraft((d) => ({ ...d, bagNo: e.target.value }))}
                    inputMode="numeric"
                  />
                  <Button
                    className="h-8 shrink-0 rounded-none border-0 border-l border-input bg-sidebar px-3 text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={incrementBagNo}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </FieldWrapper>
              <FieldWrapper borderLabel label="CRN MHBS No">
                <Input
                  className={BG_INPUT}
                  value={awbDraft.crnMhbsNo}
                  onChange={(e) => setAwbDraft((d) => ({ ...d, crnMhbsNo: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="Forwarding No.">
                <Input
                  className={BG_INPUT}
                  value={awbDraft.forwardingNo}
                  onChange={(e) => setAwbDraft((d) => ({ ...d, forwardingNo: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="AWB No.">
                <Input
                  className={BG_INPUT}
                  value={awbDraft.awbNo}
                  onChange={(e) => setAwbDraft((d) => ({ ...d, awbNo: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAwbLine();
                    }
                  }}
                />
              </FieldWrapper>
            </div>

            <div className={`${BG_GRID} mt-2.5`}>
              <FieldWrapper borderLabel label="Weight">
                <Input
                  className={BG_INPUT}
                  value={awbDraft.weight}
                  onChange={(e) => setAwbDraft((d) => ({ ...d, weight: e.target.value }))}
                  inputMode="decimal"
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="PCS">
                <div className="flex min-w-0 flex-1 items-stretch">
                  <Input
                    className={`min-w-0 flex-1 ${BG_INPUT}`}
                    value={awbDraft.pcs}
                    onChange={(e) => setAwbDraft((d) => ({ ...d, pcs: e.target.value.replace(/\D/g, "") }))}
                    inputMode="numeric"
                  />
                  <Button
                    className="h-8 shrink-0 rounded-none border-0 border-l border-input bg-sidebar px-3 text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={addAwbLine}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </FieldWrapper>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
              <p>
                <span className="font-medium text-foreground">Bag Weight :</span>{" "}
                <span className="text-muted-foreground">{summary.bagWeight}</span>
              </p>
              <p>
                <span className="font-medium text-foreground">Consignee Pin Code :</span>{" "}
                <span className="text-muted-foreground">{summary.consigneePinCode}</span>
              </p>
              <p>
                <span className="font-medium text-foreground">Total Bag No. :</span>{" "}
                <span className="text-muted-foreground">{summary.totalBagNo}</span>
              </p>
              <p>
                <span className="font-medium text-foreground">Total Pieces :</span>{" "}
                <span className="text-muted-foreground">{summary.totalPieces}</span>
              </p>
              <p>
                <span className="font-medium text-foreground">Total AWB No. :</span>{" "}
                <span className="text-muted-foreground">{summary.totalAwbNo}</span>
              </p>
              <p>
                <span className="font-medium text-foreground">Total Weight :</span>{" "}
                <span className="text-muted-foreground">{summary.totalWeight}</span>
              </p>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
                Excel Import
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={() => toast.info("Excel import will be enabled with backend wiring")}
              />
              <Button onClick={persistEntry} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                Save
              </Button>
              <Button variant="destructive" onClick={closeEntry}>
                Cancel
              </Button>
            </div>
          </FormSection>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Bagging"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Bagging</h1>
        <p className="text-sm text-muted-foreground">Create and manage bagging manifests for outbound shipments.</p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className={BG_GRID}>
          <BaggingLookupField
            label="Product"
            lookup="product"
            value={listFilters.product}
            onChange={(product) => {
              setListFilters((f) => ({ ...f, product }));
              setPage(1);
            }}
          />
          <BaggingLookupField
            label="Vendor"
            lookup="vendor"
            value={listFilters.vendor}
            onChange={(vendor) => {
              setListFilters((f) => ({ ...f, vendor }));
              setPage(1);
            }}
          />
          <FieldWrapper borderLabel label="Format">
            <Select
              value={listFilters.format}
              onValueChange={(format) => setListFilters((f) => ({ ...f, format }))}
            >
              <SelectTrigger className={BG_SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <DataIoToolbar
              export={{
                filename: "bagging",
                title: "Bagging",
                columns: [
                  { key: "manifestNo", header: "Manifest No" },
                  { key: "masterAwbNo", header: "Master AWBNo" },
                  { key: "date", header: "Date" },
                  { key: "origin", header: "Origin" },
                  { key: "from", header: "From" },
                  { key: "to", header: "To" },
                  { key: "destination", header: "Destination" },
                  { key: "vendor", header: "Vendor" },
                  { key: "shipment", header: "Shipment" },
                  { key: "weight", header: "Weight" },
                ],
                getRows: () =>
                  filtered.map((r) => ({
                    manifestNo: r.manifestNo,
                    masterAwbNo: r.masterAwbNo,
                    date: formatDisplayDate(r.date),
                    origin: r.origin,
                    from: r.from,
                    to: r.to,
                    destination: r.destination,
                    vendor: r.vendorName,
                    shipment: String(r.shipment),
                    weight: r.weight,
                  })),
              }}
            />
            <IconButton label="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <IconButton label="Clear filters" onClick={clearColFilters}>
              <Filter className="h-4 w-4" />
            </IconButton>
            <IconButton label="Search" onClick={() => toast.info("Use the search box on the right")}>
              <Search className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
            <span className="shrink-0 text-sm text-muted-foreground">Search:</span>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full min-w-[10rem] sm:w-48"
            />
            <Button size="sm" onClick={openAdd} className="h-9 shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Manifest No.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Master AWBNo</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Date</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Origin</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">From</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">To</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Destination</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Vendor</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Shipment</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Weight</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["manifestNo", "Manifest No."],
                    ["masterAwbNo", "Master AWBNo"],
                    ["date", "Date"],
                    ["origin", "Origin"],
                    ["from", "From"],
                    ["to", "To"],
                    ["destination", "Destination"],
                    ["vendor", "Vendor"],
                    ["shipment", "Shipment"],
                    ["weight", "Weight"],
                  ] as const
                ).map(([key, placeholder]) => (
                  <TableHead key={key} className="py-2">
                    <Input
                      value={colFilters[key]}
                      onChange={(e) => {
                        setColFilters((f) => ({ ...f, [key]: e.target.value }));
                        setPage(1);
                      }}
                      placeholder={placeholder}
                      className="h-8"
                    />
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        onClick={() => openEntry(row)}
                        className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {row.manifestNo}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.masterAwbNo}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDisplayDate(row.date)}</TableCell>
                    <TableCell>{row.origin}</TableCell>
                    <TableCell>{row.from}</TableCell>
                    <TableCell>{row.to}</TableCell>
                    <TableCell>{row.destination}</TableCell>
                    <TableCell className="max-w-[10rem] truncate" title={row.vendorName}>
                      {row.vendorName}
                    </TableCell>
                    <TableCell>{row.shipment}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.weight}</TableCell>
                    <TableCell className="whitespace-nowrap px-1 text-center">
                      <div className="flex justify-center gap-0">
                        <IconButton
                          label="Edit"
                          variant="ghost"
                          size="row"
                          className="text-destructive"
                          onClick={() => openEntry(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Delete"
                          variant="ghost"
                          size="row"
                          className="text-destructive"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Print"
                          variant="ghost"
                          size="row"
                          onClick={() => toast.info(`Print ${row.manifestNo} will be enabled with backend wiring`)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Export to CSB File"
                          variant="ghost"
                          size="row"
                          className="text-amber-600"
                          onClick={() => exportRowCsb(row)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Add Progress"
                          variant="ghost"
                          size="row"
                          className="text-emerald-600"
                          onClick={() => openAddProgress(row)}
                        >
                          <FilePlus className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Export to CSV"
                          variant="ghost"
                          size="row"
                          className="text-emerald-600"
                          onClick={() => exportRowCsv(row)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Export to CSV-M"
                          variant="ghost"
                          size="row"
                          className="text-emerald-600"
                          onClick={() => exportRowCsvM(row)}
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </IconButton>
                        <BaggingMoreMenu
                          row={row}
                          onDownloadAll={() => openDownloadAll(row)}
                          onDownloadTiff={() => openDownloadTiff(row)}
                          onDownloadAllTiff={() => openDownloadTiff(row, { all: true })}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
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

      <Dialog open={downloadAllOpen} onOpenChange={(o) => !o && closeDownloadAll()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Download All</DialogTitle>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6">
            <FieldWrapper label="Select Type">
              <Select
                value={downloadAllForm.selectType}
                onValueChange={(v) => setDownloadAllForm((f) => ({ ...f, selectType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOWNLOAD_ALL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="From Bag No">
              <Input
                value={downloadAllForm.fromBagNo}
                onChange={(e) => setDownloadAllForm((f) => ({ ...f, fromBagNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="To Bag No">
              <Input
                value={downloadAllForm.toBagNo}
                onChange={(e) => setDownloadAllForm((f) => ({ ...f, toBagNo: e.target.value }))}
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleDownloadAllExport} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
              Export
            </Button>
            <Button variant="destructive" onClick={closeDownloadAll}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={downloadTiffOpen} onOpenChange={(o) => !o && closeDownloadTiff()}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              {downloadTiffAllMode ? "Download All Tiff" : "Download Tiff"}
            </DialogTitle>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <FieldWrapper label="Run No.">
              <Input
                value={downloadTiffForm.runNo}
                onChange={(e) => setDownloadTiffForm((f) => ({ ...f, runNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Type">
              <Select
                value={downloadTiffForm.selectType || undefined}
                onValueChange={(v) => setDownloadTiffForm((f) => ({ ...f, selectType: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {DOWNLOAD_TIFF_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="From Bag No">
              <Input
                value={downloadTiffForm.fromBagNo}
                onChange={(e) => setDownloadTiffForm((f) => ({ ...f, fromBagNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="To Bag No">
              <Input
                value={downloadTiffForm.toBagNo}
                onChange={(e) => setDownloadTiffForm((f) => ({ ...f, toBagNo: e.target.value }))}
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleDownloadTiffExport} className="bg-cyan-600 text-white hover:bg-cyan-600/90">
              Export
            </Button>
            <Button variant="destructive" onClick={closeDownloadTiff}>
              Close
            </Button>
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
              <Input
                type="date"
                value={progressForm.progressDate}
                onChange={(e) => patchProgress({ progressDate: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label="Progress Time">
              <Input
                value={progressForm.progressTime}
                onChange={(e) =>
                  patchProgress({ progressTime: e.target.value.replace(/\D/g, "").slice(0, 4) })
                }
                placeholder="HHmm"
              />
            </FieldWrapper>
            <FieldWrapper label="Service Centre" required>
              <LookupPairInput
                lookup="serviceCentre"
                value={progressForm.serviceCentre}
                onChange={(serviceCentre) => patchProgress({ serviceCentre })}
              />
            </FieldWrapper>
            <FieldWrapper label="Exception" className="md:col-span-2">
              <LookupPairInput
                lookup="exception"
                value={progressForm.exception}
                onChange={(exception) => patchProgress({ exception })}
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleProgressSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
              Save
            </Button>
            <Button variant="destructive" onClick={closeAddProgress}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bagging manifest?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove manifest {deleteTarget?.manifestNo}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BaggingMoreMenu({
  row,
  onDownloadAll,
  onDownloadTiff,
  onDownloadAllTiff,
}: {
  row: BaggingRow;
  onDownloadAll: () => void;
  onDownloadTiff: () => void;
  onDownloadAllTiff: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerHover, setTriggerHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const moreActions = [
    {
      label: "Print AWB",
      icon: Printer,
      className: "",
      action: () => toast.info(`Print AWB for ${row.manifestNo} will be enabled with backend wiring`),
    },
    {
      label: "Download All",
      icon: CloudDownload,
      className: "text-emerald-600",
      action: onDownloadAll,
    },
    {
      label: "Download All Tiff",
      icon: FileImage,
      className: "text-sidebar",
      action: onDownloadAllTiff,
    },
    {
      label: "Download Tiff",
      icon: FileImage,
      className: "text-sidebar",
      action: onDownloadTiff,
    },
    {
      label: "Email",
      icon: Mail,
      className: "text-sidebar",
      action: () => toast.info(`Email for ${row.manifestNo} will be enabled with backend wiring`),
    },
    {
      label: "Bag Label",
      icon: Tag,
      className: "text-sidebar",
      action: () => toast.info(`Bag Label for ${row.manifestNo} will be enabled with backend wiring`),
    },
  ] as const;

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-sidebar"
          aria-label="More options"
          onMouseEnter={() => setTriggerHover(true)}
          onMouseLeave={() => setTriggerHover(false)}
          onPointerEnter={() => setTriggerHover(true)}
          onPointerLeave={() => setTriggerHover(false)}
          onFocus={() => setTriggerHover(true)}
          onBlur={() => setTriggerHover(false)}
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

function FormSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 rounded border border-border bg-card p-4 pt-6 shadow-none md:p-5 md:pt-7",
        className,
      )}
    >
      <span className="absolute left-2.5 top-1 z-20 inline-flex h-6 -translate-y-1/2 items-center whitespace-nowrap rounded-full bg-sidebar px-3 text-[14px] font-semibold leading-none text-sidebar-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function DualPairInput({
  value,
  onChange,
  inputClass,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  inputClass?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-stretch">
      <Input
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        className={cn("min-w-0 flex-1", inputClass)}
        placeholder="Name"
      />
      <Input
        value={value.code}
        onChange={(e) => onChange({ ...value, code: e.target.value })}
        className={cn("w-20 shrink-0 border-l border-input", inputClass)}
        placeholder="Code"
      />
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
