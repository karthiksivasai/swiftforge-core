import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Filter,
  Plus,
  Search,
  Pencil,
  Trash2,
  Printer,
  MoreVertical,
  FilePlus,
  Download,
  CloudDownload,
  Tag,
  Copy,
  History,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
import {
  SearchableLookupPair,
  type LookupPairValue,
} from "@/components/masters/searchable-lookup-pair";
import { type LookupKey } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  listBaggings,
  countBaggings,
  listBaggingEvents,
  getBaggingDetails,
  recordBagging,
  deleteBagging,
  fetchShipmentForBagging,
  recordBaggingProgress,
  type BaggingListRow,
  type BaggingEventRow,
  type BaggingHeaderDto,
  type BaggingAwbLineDto,
  type ShipmentBaggingLookup,
} from "@/lib/transactions/resources/bagging";
import {
  BAGGING_LINE_CAP,
  BAGGING_TEMPLATE_HEADER,
  resolveBaggingLineWeight,
} from "@/lib/transactions/resources/bagging-rules";

type LookupPair = LookupPairValue;

const BG_INPUT =
  "h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0";
const BG_SELECT =
  "h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0";
const BG_GRID =
  "grid grid-cols-1 gap-x-3 gap-y-2.5 md:grid-cols-2 xl:grid-cols-4 [&_label]:whitespace-nowrap [&_label]:text-[11px]";
const BG_SEARCH_BTN =
  "h-8 w-8 shrink-0 rounded-md bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground";

function BaggingSearchButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className={BG_SEARCH_BTN}
      onClick={onClick}
      aria-label="Search"
    >
      <Search className="h-3.5 w-3.5" />
    </Button>
  );
}

function BaggingAddButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className={BG_SEARCH_BTN}
      onClick={onClick}
      aria-label="Add"
    >
      <Plus className="h-3.5 w-3.5" />
    </Button>
  );
}

function BaggingLookupField({
  label,
  lookup,
  value,
  onChange,
  required,
  readOnlyCode = true,
}: {
  label: string;
  lookup: LookupKey;
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  required?: boolean;
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

type ColFilterKey =
  | "manifestNo"
  | "masterAwbNo"
  | "date"
  | "origin"
  | "serviceCenter"
  | "from"
  | "to"
  | "destination"
  | "vendor"
  | "shipment"
  | "weight";

type ListFilters = {
  product: LookupPair;
  vendor: LookupPair;
  fromDate: string;
  toDate: string;
  status: string;
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

type PrintBagLabelForm = {
  fromBagNo: string;
  toBagNo: string;
  remark: string;
};

const DOWNLOAD_ALL_TYPES = ["AWBNo", "Forwarding No 1", "Forwarding No 2"] as const;
const MANIFEST_TYPES = ["High Value", "Low Value", "Transhipment"] as const;
const BAGGING_STATUSES = ["OPEN", "DISPATCHED", "ARRIVED", "CLOSED", "CANCELLED"] as const;

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

const emptyPrintBagLabelForm = (maxBag = "1"): PrintBagLabelForm => ({
  fromBagNo: "1",
  toBagNo: maxBag,
  remark: "",
});

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const parseWeight = (value: string | number) => {
  if (typeof value === "number") return value;
  const n = Number.parseFloat(String(value).replace(/,/g, ""));
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

const emptyForm = (defaultBranch = "HYD"): BaggingHeaderDto => ({
  manifestNo: "0",
  date: todayIso(),
  originCity: { code: defaultBranch, name: defaultBranch },
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
  serviceCenter: { code: defaultBranch, name: defaultBranch },
  destCountry: emptyPair(),
  destCity: emptyPair(),
  flightNo1: emptyPair(),
  flightNo2: emptyPair(),
  arrivalDate: "",
  arrivalTime: "",
  destVendor: emptyPair(),
  isForwarding: false,
  manifestType: "",
  transferToUk: false,
  searchAwbBagNo: "",
  awbLines: [],
});

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  manifestNo: "",
  masterAwbNo: "",
  date: "",
  origin: "",
  serviceCenter: "",
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
  fromDate: "",
  toDate: "",
  status: "",
});

const formatAwbInBagLabel = (line: BaggingAwbLineDto) =>
  `${line.awbNo} (Weight [${line.weight}] PCS[${line.pcs}]${line.crnMhbsNo ? ` CRN No. [${line.crnMhbsNo}]` : ""})`;

const maxBagNo = (lines: BaggingAwbLineDto[]) => {
  const nums = lines.map((line) => Number.parseInt(line.bagNo, 10)).filter(Number.isFinite);
  return nums.length === 0 ? 1 : Math.max(...nums);
};

export const Route = createFileRoute("/transaction/bagging")({
  head: () => ({
    meta: [
      { title: "Bagging — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage bagging manifests with live AWB scanning." },
    ],
  }),
  component: BaggingPage,
});

export function BaggingPage() {
  const { isAuthenticated: authed, profile, hasPermission, loading: authLoading } = useAuth();
  const canList = hasPermission("txn.bagging", "list") || hasPermission("txn.bagging", "search");
  const canAdd = hasPermission("txn.bagging", "add");
  const canModify = hasPermission("txn.bagging", "modify");
  const canDelete = hasPermission("txn.bagging", "delete");
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);

  // User Branch lookup for defaulting
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

  const [view, setView] = useState<PageView>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BaggingHeaderDto>(() => emptyForm(defaultBranchCode));
  const [awbDraft, setAwbDraft] = useState<AwbDraft>(emptyAwbDraft());
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [awbInBagSearch, setAwbInBagSearch] = useState("");
  const [listFilters, setListFilters] = useState<ListFilters>(emptyListFilters);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<BaggingListRow | null>(null);

  // Dialog states
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressMode, setProgressMode] = useState<ProgressMode>("add");
  const [progressManifest, setProgressManifest] = useState<BaggingListRow | null>(null);
  const [progressForm, setProgressForm] = useState<ProgressForm>(emptyProgressForm);

  const [downloadAllOpen, setDownloadAllOpen] = useState(false);
  const [downloadAllRow, setDownloadAllRow] = useState<BaggingListRow | null>(null);
  const [downloadAllForm, setDownloadAllForm] = useState<DownloadAllForm>(emptyDownloadAllForm);

  const [bagLabelOpen, setBagLabelOpen] = useState(false);
  const [bagLabelRow, setBagLabelRow] = useState<BaggingListRow | null>(null);
  const [bagLabelForm, setBagLabelForm] = useState<PrintBagLabelForm>(emptyPrintBagLabelForm());

  const [awbPreviewData, setAwbPreviewData] = useState<ShipmentBaggingLookup | null>(null);
  const [sortCol, setSortCol] = useState<ColFilterKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [historyTarget, setHistoryTarget] = useState<BaggingListRow | null>(null);

  // Keep branch default updated
  useEffect(() => {
    if (defaultBranchCode && form.originCity.code === "HYD" && defaultBranchCode !== "HYD") {
      setForm((f) => ({
        ...f,
        originCity: { code: defaultBranchCode, name: defaultBranchCode },
        serviceCenter: { code: defaultBranchCode, name: defaultBranchCode },
      }));
    }
  }, [defaultBranchCode, form.originCity.code]);

  // Live Query: List Bagging Manifests
  const listArgs = {
    productCode: listFilters.product.code || undefined,
    vendorCode: listFilters.vendor.code || undefined,
    fromDate: listFilters.fromDate || undefined,
    toDate: listFilters.toDate || undefined,
    status: listFilters.status || undefined,
    search: search || undefined,
  };
  const listKey = [
    listFilters.product.code,
    listFilters.vendor.code,
    listFilters.fromDate,
    listFilters.toDate,
    listFilters.status,
    search,
  ];
  const { data: dbRows = [], isLoading, isError, error: listError, refetch } = useQuery({
    queryKey: ["baggings", ...listKey, page],
    queryFn: () =>
      listBaggings({
        ...listArgs,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    enabled: authed && !authLoading && canList,
  });
  const countQuery = useQuery({
    queryKey: ["baggings-count", ...listKey],
    queryFn: () => countBaggings(listArgs),
    enabled: authed && !authLoading && canList,
  });
  const historyQuery = useQuery({
    queryKey: ["bagging-events", historyTarget?.id],
    queryFn: () => listBaggingEvents(historyTarget!.id),
    enabled: authed && Boolean(historyTarget?.id) && canList,
  });

  useEffect(() => {
    if (countQuery.data == null) return;
    if (page > 1 && (page - 1) * PAGE_SIZE >= countQuery.data) setPage(1);
  }, [countQuery.data, page]);

  const rows: BaggingListRow[] = authed ? dbRows : [];

  const patchForm = (patch: Partial<BaggingHeaderDto>) => setForm((f) => ({ ...f, ...patch }));
  const patchProgress = (patch: Partial<ProgressForm>) => setProgressForm((f) => ({ ...f, ...patch }));

  // Client filtering & sorting on top of server data
  const filtered = useMemo(() => {
    let result = rows.filter((row) => {
      const d = formatDisplayDate(row.manifest_date);
      const cf = colFilters;
      if (cf.manifestNo && !row.manifest_no.toLowerCase().includes(cf.manifestNo.toLowerCase())) return false;
      if (cf.masterAwbNo && !row.master_awb_no.toLowerCase().includes(cf.masterAwbNo.toLowerCase())) return false;
      if (cf.date && !d.includes(cf.date)) return false;
      if (cf.origin && !row.origin.toLowerCase().includes(cf.origin.toLowerCase())) return false;
      if (cf.serviceCenter && !(row.service_center || "").toLowerCase().includes(cf.serviceCenter.toLowerCase())) return false;
      if (cf.from && !row.from_city.toLowerCase().includes(cf.from.toLowerCase())) return false;
      if (cf.to && !row.to_city.toLowerCase().includes(cf.to.toLowerCase())) return false;
      if (cf.destination && !row.destination.toLowerCase().includes(cf.destination.toLowerCase())) return false;
      if (cf.vendor && !row.vendor_name.toLowerCase().includes(cf.vendor.toLowerCase())) return false;
      if (cf.shipment && !String(row.total_awbs).includes(cf.shipment)) return false;
      if (cf.weight && !String(row.total_weight).includes(cf.weight)) return false;
      return true;
    });

    if (sortCol) {
      result = [...result].sort((a, b) => {
        let valA: string | number = "";
        let valB: string | number = "";
        switch (sortCol) {
          case "manifestNo": valA = a.manifest_no; valB = b.manifest_no; break;
          case "masterAwbNo": valA = a.master_awb_no || ""; valB = b.master_awb_no || ""; break;
          case "date": valA = a.manifest_date; valB = b.manifest_date; break;
          case "origin": valA = a.origin; valB = b.origin; break;
          case "serviceCenter": valA = a.service_center || ""; valB = b.service_center || ""; break;
          case "from": valA = a.from_city; valB = b.from_city; break;
          case "to": valA = a.to_city; valB = b.to_city; break;
          case "destination": valA = a.destination; valB = b.destination; break;
          case "vendor": valA = a.vendor_name; valB = b.vendor_name; break;
          case "shipment": valA = a.total_awbs; valB = b.total_awbs; break;
          case "weight": valA = parseWeight(a.total_weight); valB = parseWeight(b.total_weight); break;
        }
        if (valA < valB) return sortDir === "asc" ? -1 : 1;
        if (valA > valB) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [rows, colFilters, sortCol, sortDir]);

  const handleSort = (col: ColFilterKey) => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else setSortCol(null);
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const serverTotal = countQuery.data ?? 0;
  const totalPages = Math.max(1, Math.ceil(serverTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered;
  const startIdx = serverTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, serverTotal);

  const selectedLine = (form.awbLines || []).find((line) => line.id === selectedLineId) ?? null;

  // Auto-fetch AWB details preview when typing AWB number
  useEffect(() => {
    const clean = awbDraft.awbNo.trim().toUpperCase();
    if (!clean || clean.length < 3) {
      setAwbPreviewData(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await fetchShipmentForBagging(clean);
        if (data) {
          setAwbPreviewData(data);
          setAwbDraft((d) => ({
            ...d,
            weight: d.weight || data.weight || "",
            pcs: d.pcs && d.pcs !== "1" ? d.pcs : data.pcs || "1",
            forwardingNo: d.forwardingNo || data.forwarding_no || "",
          }));
        } else {
          setAwbPreviewData(null);
        }
      } catch (e) {
        console.warn("AWB preview fetch error:", e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [awbDraft.awbNo]);

  const awbInBagLines = useMemo(() => {
    const q = awbInBagSearch.trim().toLowerCase();
    return (form.awbLines || []).filter(
      (line) =>
        !q ||
        line.awbNo.toLowerCase().includes(q) ||
        line.bagNo.toLowerCase().includes(q),
    );
  }, [form.awbLines, awbInBagSearch]);

  const bagSummaries = useMemo(() => {
    const map = new Map<string, { awbCount: number; weight: number }>();
    for (const line of form.awbLines || []) {
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
    const lines = form.awbLines || [];
    const bagNos = new Set(lines.map((line) => line.bagNo).filter(Boolean));
    const totalPieces = lines.reduce((sum, line) => sum + (Number.parseInt(line.pcs, 10) || 0), 0);
    const totalWeight = lines.reduce((sum, line) => sum + parseWeight(line.weight), 0);
    const currentBagWeight = lines
      .filter((line) => line.bagNo === awbDraft.bagNo)
      .reduce((sum, line) => sum + parseWeight(line.weight), 0);
    const maxBag = Math.max(maxBagNo(lines), Number.parseInt(awbDraft.bagNo, 10) || 0);

    const activePin =
      selectedLine?.destination ||
      awbPreviewData?.destination ||
      (lines.length > 0 ? lines[lines.length - 1].destination : "");

    return {
      bagWeight: formatWeight(currentBagWeight),
      consigneePinCode: activePin || "—",
      totalBagNo: bagNos.size > 0 ? maxBag : 0,
      totalPieces,
      totalAwbNo: lines.length,
      totalWeight: lines.length > 0 ? formatWeight(totalWeight) : "0.000",
    };
  }, [form.awbLines, awbDraft.bagNo, selectedLine, awbPreviewData]);

  const openAdd = (prefill?: Partial<BaggingHeaderDto>) => {
    setEditingId(null);
    setForm({
      ...emptyForm(defaultBranchCode),
      date: todayIso(),
      manifestNo: "0",
      ...(prefill || {}),
    });
    setAwbDraft(emptyAwbDraft());
    setSelectedLineId(null);
    setAwbInBagSearch("");
    setView("entry");
  };

  const openEntry = async (row: BaggingListRow) => {
    try {
      const details = await getBaggingDetails(row.id);
      if (!details) {
        toast.error("Failed to load bagging details");
        return;
      }
      setEditingId(row.id);
      setForm(details);
      const nextBag = String(maxBagNo(details.awbLines || []) || 1);
      setAwbDraft({ ...emptyAwbDraft(), bagNo: nextBag });
      setSelectedLineId(details.awbLines?.[0]?.id ?? null);
      setAwbInBagSearch("");
      setView("entry");
    } catch (err) {
      toast.error(`Error opening bagging: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const duplicateEntry = async (row: BaggingListRow) => {
    try {
      const details = await getBaggingDetails(row.id);
      if (!details) return;
      openAdd({
        ...details,
        id: undefined,
        rowVersion: undefined,
        manifestNo: "0",
        date: todayIso(),
        awbLines: [],
      });
      toast.success(
        `Header copied from ${row.manifest_no}. AWB lines were not copied because an AWB can only be on one manifest.`,
      );
    } catch (err) {
      toast.error("Failed to duplicate manifest");
    }
  };

  const closeEntry = () => {
    setView("list");
    setEditingId(null);
    setForm(emptyForm(defaultBranchCode));
    setAwbDraft(emptyAwbDraft());
    setSelectedLineId(null);
    setAwbInBagSearch("");
  };

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.date.trim()) {
        throw new Error("Date is required");
      }
      if (!form.originCity.code.trim() && !form.originCity.name.trim()) {
        throw new Error("Origin City is required");
      }
      if (!form.originCountry.code.trim() && !form.originCountry.name.trim()) {
        throw new Error("Origin Country is required");
      }
      if (!form.airlinesCode.code.trim() && !form.airlinesCode.name.trim()) {
        throw new Error("Airlines Code is required");
      }
      if (!form.vendor.code.trim() && !form.vendor.name.trim()) {
        throw new Error("Vendor is required");
      }
      if ((form.awbLines || []).length > BAGGING_LINE_CAP) {
        throw new Error(`A bagging manifest cannot hold more than ${BAGGING_LINE_CAP} lines`);
      }
      if (!form.serviceCenter.code.trim() && !form.serviceCenter.name.trim()) {
        throw new Error("Service Center is required");
      }
      if (!form.destCity.code.trim() && !form.destCity.name.trim()) {
        throw new Error("Dest City is required");
      }
      if (!form.flightNo1.code.trim() && !form.flightNo1.name.trim()) {
        throw new Error("Flight No 1 is required");
      }

      return await recordBagging(editingId, form, form.awbLines || []);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["baggings"] });
      toast.success(`Bagging manifest ${res.manifest_no} saved successfully (${res.total_bags} bags, ${res.total_awbs} AWBs)`);
      closeEntry();
    },
    onError: (err) => {
      toast.error(`Save error: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBagging(deleteTarget.id);
      queryClient.invalidateQueries({ queryKey: ["baggings"] });
      toast.success(`Deleted manifest ${deleteTarget.manifest_no}`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRefresh = () => {
    setPage(1);
    refetch();
    toast.success("List refreshed from database");
  };

  const clearColFilters = () => {
    setColFilters(emptyColFilters());
    setListFilters(emptyListFilters());
    setSearch("");
    setPage(1);
    toast.success("Filters cleared");
  };

  const downloadTemplate = () => {
    downloadCsv("bagging-awb-template.csv", [...BAGGING_TEMPLATE_HEADER], [["1", "", "", "1", "", ""]]);
  };

  // Live AWB lookup and line addition
  const addAwbLine = async () => {
    const typed = awbDraft.awbNo.trim().toUpperCase();
    if (!typed) return toast.error("AWB No is required");
    const lines = form.awbLines || [];
    if (lines.length >= BAGGING_LINE_CAP) {
      return toast.error(`A bagging manifest cannot hold more than ${BAGGING_LINE_CAP} lines`);
    }

    let realData: ShipmentBaggingLookup | null = null;
    try {
      realData = await fetchShipmentForBagging(typed);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not look up the AWB";
      return toast.error(message);
    }
    if (!realData?.awb_no) {
      return toast.error(`AWB ${typed} is not in shipments`);
    }

    const awb = realData.awb_no.trim().toUpperCase();
    if (lines.some((line) => line.awbNo.toUpperCase() === awb)) {
      return toast.error(`AWB ${awb} is already added to this manifest`);
    }

    const weight = resolveBaggingLineWeight(awbDraft.weight, realData.weight);
    if (!weight.ok) return toast.error(`${weight.error} (${awb})`);

    const newLine: BaggingAwbLineDto = {
      id: crypto.randomUUID(),
      bagNo: awbDraft.bagNo.trim() || "1",
      crnMhbsNo: awbDraft.crnMhbsNo.trim(),
      forwardingNo: awbDraft.forwardingNo.trim() || realData.forwarding_no || "",
      awbNo: awb,
      weight: weight.weight,
      pcs: awbDraft.pcs.trim() || realData.pcs || "1",
      shipper: realData.shipper || "—",
      consignee: realData.consignee || "—",
      vendor: realData.vendor || form.vendor.name || form.vendor.code || "—",
      airline: realData.airline || form.airlinesCode.code || "—",
      service: realData.service || "SPX",
      destination: realData.destination || form.destCity.name || form.destCity.code || "—",
    };

    patchForm({ awbLines: [...lines, newLine] });
    setSelectedLineId(newLine.id);
    setAwbDraft((d) => ({ ...d, awbNo: "", forwardingNo: "", crnMhbsNo: "", weight: "" }));
    toast.success(`AWB ${awb} added (${realData.shipper} → ${realData.consignee})`);
  };

  const incrementBagNo = () => {
    const next = String((Number.parseInt(awbDraft.bagNo, 10) || 0) + 1);
    setAwbDraft((d) => ({ ...d, bagNo: next }));
    toast.success(`Bag No set to ${next}`);
  };

  const removeAwbLine = (lineId: string) => {
    patchForm({ awbLines: (form.awbLines || []).filter((line) => line.id !== lineId) });
    if (selectedLineId === lineId) setSelectedLineId(null);
    toast.success("AWB removed");
  };

  const removeBagSummary = (bagNo: string) => {
    patchForm({ awbLines: (form.awbLines || []).filter((line) => line.bagNo !== bagNo) });
    if (selectedLine?.bagNo === bagNo) setSelectedLineId(null);
    toast.success(`Bag ${bagNo} removed`);
  };

  // Add Progress Handler
  const handleProgressSave = async () => {
    if (!progressManifest) return;
    if (!progressForm.serviceCentre.code.trim() && !progressForm.serviceCentre.name.trim()) {
      return toast.error("Service Centre is required");
    }

    try {
      await recordBaggingProgress({
        baggingId: progressManifest.id,
        bagNo: progressForm.bagNo.trim(),
        progressDate: progressForm.progressDate,
        progressTime: progressForm.progressTime,
        serviceCenterCode: progressForm.serviceCentre.code || progressForm.serviceCentre.name,
        exceptionCode: progressForm.exception.code || progressForm.exception.name || "PROGRESS",
        mode: progressMode,
      });

      const action = progressMode === "add" ? "added" : "deleted";
      toast.success(`Progress ${action} for ${progressManifest.manifest_no} (persisted to tracking audit)`);
      setProgressOpen(false);
      setProgressManifest(null);
      setProgressForm(emptyProgressForm());
    } catch (err) {
      toast.error(`Progress save error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Print Bagging Manifest (Real HTML Print Sheet)
  const handlePrintManifest = async (row?: BaggingListRow) => {
    const target = row || (editingId ? { manifest_no: form.manifestNo, id: editingId } : null);
    if (!target) return toast.error("No manifest selected for printing");

    let details: BaggingHeaderDto | null = null;
    if (editingId && !row) {
      details = form;
    } else if (row) {
      details = await getBaggingDetails(row.id);
    }

    if (!details) return toast.error("Could not load manifest for printing");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Popup blocked. Allow popups to print manifest.");

    const lines = details.awbLines || [];
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bagging Manifest — ${details.manifestNo}</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
            .header h1 { margin: 0 0 4px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
            .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; margin-bottom: 12px; border-bottom: 1px dashed #777; padding-bottom: 8px; }
            .meta div { font-size: 11px; }
            .meta strong { color: #222; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
            th, td { border: 1px solid #888; padding: 5px 6px; text-align: left; }
            th { background-color: #f2f2f2; font-size: 10px; text-transform: uppercase; }
            .totals { margin-top: 12px; font-weight: bold; display: flex; justify-content: space-between; border-top: 1px solid #333; padding-top: 8px; font-size: 12px; }
            .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
            .sig-line { width: 180px; border-top: 1px solid #333; text-align: center; padding-top: 4px; font-size: 10px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>SwiftForge International — Bagging / Customs Manifest</h1>
            <div>MANIFEST NO: <strong>${details.manifestNo}</strong> | DATE: <strong>${formatDisplayDate(details.date)}</strong> | TYPE: <strong>${details.manifestType || "Standard"}</strong></div>
          </div>
          <div class="meta">
            <div><strong>Origin:</strong> ${details.originCity?.code || ""} (${details.originCountry?.code || ""})</div>
            <div><strong>Destination:</strong> ${details.destCity?.code || ""} (${details.destCountry?.code || ""})</div>
            <div><strong>Airline:</strong> ${details.airlinesCode?.name || details.airlinesCode?.code || "—"}</div>
            <div><strong>Flight:</strong> ${details.flightNo1?.code || "—"} ${details.flightNo2?.code ? `/ ${details.flightNo2.code}` : ""}</div>
            <div><strong>Master AWB:</strong> ${details.mawbMasterNo || "—"}</div>
            <div><strong>EDI Master No:</strong> ${details.ediMasterNo || "—"}</div>
            <div><strong>Vendor:</strong> ${details.vendor?.name || details.vendor?.code || "—"}</div>
            <div><strong>Service Center:</strong> ${details.serviceCenter?.code || "—"}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 25px;">#</th>
                <th>Bag No</th>
                <th>AWB No</th>
                <th>CRN MHBS No</th>
                <th>Forwarding No</th>
                <th>Pcs</th>
                <th>Weight (kg)</th>
                <th>Shipper</th>
                <th>Consignee</th>
                <th>Destination</th>
              </tr>
            </thead>
            <tbody>
              ${lines
                .map(
                  (l, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${l.bagNo}</strong></td>
                  <td><strong>${l.awbNo}</strong></td>
                  <td>${l.crnMhbsNo || "—"}</td>
                  <td>${l.forwardingNo || "—"}</td>
                  <td>${l.pcs}</td>
                  <td>${l.weight}</td>
                  <td>${l.shipper || "—"}</td>
                  <td>${l.consignee || "—"}</td>
                  <td>${l.destination || "—"}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
          <div class="totals">
            <div>Total Bags: ${new Set(lines.map((l) => l.bagNo)).size}</div>
            <div>Total AWBs: ${lines.length}</div>
            <div>Total Pieces: ${lines.reduce((s, l) => s + (Number(l.pcs) || 0), 0)}</div>
            <div>Total Weight: ${lines.reduce((s, l) => s + (Number(l.weight) || 0), 0).toFixed(3)} kg</div>
          </div>
          <div class="signatures">
            <div class="sig-line">Prepared By (Manifest Officer)</div>
            <div class="sig-line">Customs / Airline Acceptance</div>
          </div>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Print Bag Label Handler (Real Printable HTML Bag Tags)
  const handlePrintBagLabels = async () => {
    if (!bagLabelRow) return;
    const details = await getBaggingDetails(bagLabelRow.id);
    if (!details) return toast.error("Could not load bagging details");

    const lines = details.awbLines || [];
    const fromBag = Number.parseInt(bagLabelForm.fromBagNo, 10) || 1;
    const toBag = Number.parseInt(bagLabelForm.toBagNo, 10) || maxBagNo(lines);

    const bagNumbers = Array.from(new Set(lines.map((l) => Number.parseInt(l.bagNo, 10))))
      .filter((n) => Number.isFinite(n) && n >= fromBag && n <= toBag)
      .sort((a, b) => a - b);

    if (bagNumbers.length === 0) {
      return toast.error("No bags found in the specified range");
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Popup blocked. Allow popups to print bag labels.");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bag Labels — ${details.manifestNo}</title>
          <style>
            @page { size: 4in 6in; margin: 5mm; }
            body { font-family: Arial, sans-serif; margin: 0; color: #000; }
            .label-page { page-break-after: always; width: 3.8in; height: 5.6in; border: 2px solid #000; box-sizing: border-box; padding: 8px; display: flex; flex-direction: column; justify-content: space-between; }
            .lbl-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; }
            .lbl-header h2 { margin: 0; font-size: 16px; text-transform: uppercase; }
            .route { font-size: 24px; font-weight: bold; margin: 6px 0; text-align: center; letter-spacing: 2px; }
            .bag-banner { background: #000; color: #fff; text-align: center; font-size: 20px; font-weight: bold; padding: 4px; margin: 6px 0; }
            .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; border-bottom: 1px dashed #444; padding-bottom: 6px; }
            .grid-info div strong { font-size: 12px; }
            .awb-list { font-size: 10px; margin-top: 4px; max-height: 120px; overflow: hidden; }
            .remark-box { font-size: 10px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          ${bagNumbers
            .map((bNo) => {
              const bagLines = lines.filter((l) => Number.parseInt(l.bagNo, 10) === bNo);
              const bWeight = bagLines.reduce((s, l) => s + parseWeight(l.weight), 0).toFixed(3);
              const bPcs = bagLines.reduce((s, l) => s + (Number(l.pcs) || 0), 0);
              return `
                <div class="label-page">
                  <div>
                    <div class="lbl-header">
                      <h2>SwiftForge Cargo Bag Tag</h2>
                      <div>MANIFEST: <strong>${details.manifestNo}</strong> | DATE: ${formatDisplayDate(details.date)}</div>
                    </div>
                    <div class="route">
                      ${details.originCity?.code || "HYD"} ➔ ${details.destCity?.code || "DEST"}
                    </div>
                    <div class="bag-banner">
                      BAG NO: ${bNo} OF ${maxBagNo(lines)}
                    </div>
                    <div class="grid-info">
                      <div><strong>WEIGHT:</strong> ${bWeight} KG</div>
                      <div><strong>AWB COUNT:</strong> ${bagLines.length}</div>
                      <div><strong>TOTAL PCS:</strong> ${bPcs}</div>
                      <div><strong>FLIGHT:</strong> ${details.flightNo1?.code || "—"}</div>
                      <div><strong>CARRIER:</strong> ${details.airlinesCode?.code || details.vendor?.code || "—"}</div>
                      <div><strong>MAWB:</strong> ${details.mawbMasterNo || "—"}</div>
                    </div>
                    <div class="awb-list">
                      <strong>AWBs IN THIS BAG:</strong><br/>
                      ${bagLines.map((l) => l.awbNo).join(", ")}
                    </div>
                  </div>
                  <div class="remark-box">
                    <strong>REMARK:</strong> ${bagLabelForm.remark || details.baggingRemark || "AIR COURIER CARGO"}
                  </div>
                </div>
              `;
            })
            .join("")}
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    setBagLabelOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1_048_576) {
      toast.error("Import file must be 1 MB or smaller");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = String(evt.target?.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        toast.error("File is empty or contains only a header");
        return;
      }

      const headerLine = lines[0].toLowerCase();
      const hasHeader = headerLine.includes("awb") || headerLine.includes("bag");
      const dataRows = hasHeader ? lines.slice(1) : lines;
      if (dataRows.length > BAGGING_LINE_CAP) {
        toast.error(`Import is limited to ${BAGGING_LINE_CAP} rows`);
        return;
      }

      const currentLines = [...(form.awbLines || [])];
      const errors: string[] = [];
      let imported = 0;

      for (let index = 0; index < dataRows.length; index += 1) {
        const cols = dataRows[index].split(",").map((c) => c.replace(/["']/g, "").trim());
        const rowNo = index + (hasHeader ? 2 : 1);
        const bNo = cols.length >= 2 ? cols[0] || "1" : "1";
        const awb = (cols.length >= 2 ? cols[1] : cols[0] || "").toUpperCase();
        if (!awb) {
          errors.push(`Row ${rowNo}: AWB is blank`);
          continue;
        }
        if (currentLines.length >= BAGGING_LINE_CAP) {
          errors.push(`Stopped at row ${rowNo}: the ${BAGGING_LINE_CAP} line limit was reached`);
          break;
        }
        let shipment: ShipmentBaggingLookup | null = null;
        try {
          shipment = await fetchShipmentForBagging(awb);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not look up the AWB";
          errors.push(`Row ${rowNo}: ${message}`);
          continue;
        }
        if (!shipment?.awb_no) {
          errors.push(`Row ${rowNo}: AWB ${awb} is not in shipments`);
          continue;
        }
        const canonical = shipment.awb_no.trim().toUpperCase();
        if (currentLines.some((l) => l.awbNo.toUpperCase() === canonical)) {
          errors.push(`Row ${rowNo}: AWB ${canonical} is already on this manifest`);
          continue;
        }
        const weight = resolveBaggingLineWeight(cols[2], shipment.weight);
        if (!weight.ok) {
          errors.push(`Row ${rowNo}: ${weight.error} (${awb})`);
          continue;
        }

        currentLines.push({
          id: crypto.randomUUID(),
          bagNo: bNo,
          awbNo: canonical,
          crnMhbsNo: cols[5] || "",
          forwardingNo: cols[4] || shipment.forwarding_no || "",
          weight: weight.weight,
          pcs: cols[3] || shipment.pcs || "1",
          shipper: shipment.shipper || "—",
          consignee: shipment.consignee || "—",
          vendor: shipment.vendor || form.vendor.name || form.vendor.code || "—",
          airline: shipment.airline || form.airlinesCode.code || "—",
          service: shipment.service || "SPX",
          destination: shipment.destination || form.destCity.name || form.destCity.code || "—",
        });
        imported += 1;
      }

      patchForm({ awbLines: currentLines });
      if (imported > 0) toast.success(`Imported ${imported} AWB line${imported === 1 ? "" : "s"}`);
      if (errors.length > 0) {
        toast.error(errors.slice(0, 4).join(" · ") + (errors.length > 4 ? ` · ${errors.length - 4} more` : ""));
      } else if (imported === 0) {
        toast.error("No AWB lines were imported");
      }
    };
    reader.readAsText(file);
  };

  const awbInBagCount = summary.totalBagNo || bagSummaries.length;

  if (view === "entry") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "Bagging"]} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {editingId ? `Edit Bagging Manifest (${form.manifestNo})` : "New Bagging Manifest"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Consolidate physical bags, map flight & MAWB, and scan shipments.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePrintManifest()}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Print Manifest
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={closeEntry}
            >
              Back to List
            </Button>
          </div>
        </div>

        {/* Origin Panel */}
        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <div className={BG_GRID}>
            <FieldWrapper borderLabel label="Manifest No" required>
              <Input
                className={BG_INPUT}
                value={form.manifestNo}
                disabled
                readOnly
                placeholder="Auto-Allocated on Save"
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
            <BaggingLookupField
              label="Origin Country"
              lookup="country"
              value={form.originCountry}
              onChange={(originCountry) => patchForm({ originCountry })}
              required
            />

            <BaggingLookupField
              label="Airlines Code"
              lookup="airline"
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

        {/* Destination Panel */}
        <FormSection title="Destination">
          <div className={BG_GRID}>
            <BaggingLookupField
              label="Service Center"
              lookup="serviceCentre"
              value={form.serviceCenter}
              onChange={(serviceCenter) =>
                patchForm({
                  serviceCenter,
                  destCity: form.destCity.code ? form.destCity : serviceCenter,
                  destCountry: form.destCountry.code
                    ? form.destCountry
                    : ["HYD", "BAN", "MUM", "GUN", "MAH"].includes(serviceCenter.code)
                      ? { code: "IN", name: "INDIA" }
                      : serviceCenter.code
                        ? { code: serviceCenter.code, name: serviceCenter.name }
                        : form.destCountry,
                })
              }
              required
            />
            <BaggingLookupField
              label="Dest Country"
              lookup="country"
              value={form.destCountry}
              onChange={(destCountry) => patchForm({ destCountry })}
              required
            />
            <BaggingLookupField
              label="Dest City"
              lookup="destination"
              value={form.destCity}
              onChange={(destCity) => patchForm({ destCity })}
              required
            />
            <BaggingLookupField
              label="Flight No 1"
              lookup="flight"
              value={form.flightNo1}
              onChange={(flightNo1) => patchForm({ flightNo1 })}
              required
            />
            <BaggingLookupField
              label="Flight No 2"
              lookup="flight"
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
            <FieldWrapper borderLabel label="Time of Arrival">
              <Input
                className={BG_INPUT}
                value={form.arrivalTime}
                onChange={(e) => patchForm({ arrivalTime: e.target.value })}
                placeholder="HH:mm"
              />
            </FieldWrapper>
            <BaggingLookupField
              label="Dest Vendor"
              lookup="vendor"
              value={form.destVendor}
              onChange={(destVendor) => patchForm({ destVendor })}
            />
            <FieldWrapper borderLabel label="IsForwarding">
              <div className="flex min-h-8 items-center px-1.5">
                <Checkbox
                  id="isForwarding"
                  checked={form.isForwarding}
                  onCheckedChange={(c) => patchForm({ isForwarding: c === true })}
                />
              </div>
            </FieldWrapper>
            <FieldWrapper borderLabel lookupSplit label="Search AWB Bag No">
              <div className="flex w-full min-w-0 items-stretch gap-1">
                <div className="relative min-h-8 min-w-0 flex-1 overflow-hidden rounded border border-input bg-background">
                  <Input
                    className={`min-w-0 w-full ${BG_INPUT}`}
                    value={form.searchAwbBagNo || ""}
                    onChange={(e) => patchForm({ searchAwbBagNo: e.target.value })}
                    placeholder="Filter AWB in bags"
                  />
                </div>
                <BaggingSearchButton onClick={() => setAwbInBagSearch(form.searchAwbBagNo || "")} />
              </div>
            </FieldWrapper>
          </div>
        </FormSection>

        {/* Middle Three Columns */}
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
          <FormSection title={`AWB No in Bags (${awbInBagCount})`}>
            <FieldWrapper borderLabel lookupSplit label="Search AWB No. In Bag">
              <div className="flex w-full min-w-0 items-stretch gap-1">
                <div className="relative min-h-8 min-w-0 flex-1 overflow-hidden rounded border border-input bg-background">
                  <Input
                    className={`min-w-0 w-full ${BG_INPUT}`}
                    value={awbInBagSearch}
                    onChange={(e) => setAwbInBagSearch(e.target.value)}
                    placeholder="Type to filter AWBs"
                  />
                </div>
                <BaggingSearchButton onClick={() => setAwbInBagSearch(awbInBagSearch)} />
              </div>
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
                        <TableCell className="font-semibold">{bag.bagNo}</TableCell>
                        <TableCell>{bag.awbCount}</TableCell>
                        <TableCell>{bag.weight} kg</TableCell>
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
                  ["AWB No.", selectedLine?.awbNo || awbPreviewData?.awb_no || awbDraft.awbNo || ""],
                  ["Shipper", selectedLine?.shipper || awbPreviewData?.shipper || ""],
                  ["Consignee", selectedLine?.consignee || awbPreviewData?.consignee || ""],
                  ["Vendor", selectedLine?.vendor || awbPreviewData?.vendor || form.vendor.name || ""],
                  ["Airline", selectedLine?.airline || awbPreviewData?.airline || form.airlinesCode.code || ""],
                  ["Service", selectedLine?.service || awbPreviewData?.service || ""],
                  ["Weight", selectedLine?.weight ? `${selectedLine.weight} kg` : awbPreviewData?.weight ? `${awbPreviewData.weight} kg` : ""],
                  ["Pieces", selectedLine?.pcs || awbPreviewData?.pcs || ""],
                  ["Destination", selectedLine?.destination || awbPreviewData?.destination || form.destCity.name || ""],
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

        {/* Bag / AWB Details Panel */}
        <FormSection title="Bag/AWB Details">
          <div className={BG_GRID}>
            <FieldWrapper borderLabel lookupSplit label="Bag No">
              <div className="flex w-full min-w-0 items-stretch gap-1">
                <div className="relative min-h-8 min-w-0 flex-1 overflow-hidden rounded border border-input bg-background">
                  <Input
                    className={`min-w-0 w-full ${BG_INPUT}`}
                    value={awbDraft.bagNo}
                    onChange={(e) => setAwbDraft((d) => ({ ...d, bagNo: e.target.value }))}
                    inputMode="numeric"
                  />
                </div>
                <BaggingAddButton onClick={incrementBagNo} />
              </div>
            </FieldWrapper>

            <FieldWrapper borderLabel label="Manifest Type">
              <Select
                value={form.manifestType || undefined}
                onValueChange={(v) => patchForm({ manifestType: v as "High Value" | "Low Value" | "Transhipment" })}
              >
                <SelectTrigger className={BG_SELECT}>
                  <SelectValue placeholder="Select Manifest Type" />
                </SelectTrigger>
                <SelectContent>
                  {MANIFEST_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>

          <div className={`${BG_GRID} mt-2.5`}>
            <FieldWrapper borderLabel label="AWB No.">
              <Input
                className={BG_INPUT}
                value={awbDraft.awbNo}
                onChange={(e) => setAwbDraft((d) => ({ ...d, awbNo: e.target.value }))}
                placeholder="Enter or scan AWB"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAwbLine();
                  }
                }}
              />
            </FieldWrapper>
            <FieldWrapper borderLabel label="Weight">
              <Input
                className={BG_INPUT}
                value={awbDraft.weight}
                onChange={(e) => setAwbDraft((d) => ({ ...d, weight: e.target.value }))}
                inputMode="decimal"
                placeholder="Auto-filled or manual"
              />
            </FieldWrapper>
            <FieldWrapper borderLabel lookupSplit label="PCS">
              <div className="flex w-full min-w-0 items-stretch gap-1">
                <div className="relative min-h-8 min-w-0 flex-1 overflow-hidden rounded border border-input bg-background">
                  <Input
                    className={`min-w-0 w-full ${BG_INPUT}`}
                    value={awbDraft.pcs}
                    onChange={(e) => setAwbDraft((d) => ({ ...d, pcs: e.target.value.replace(/\D/g, "") }))}
                    inputMode="numeric"
                  />
                </div>
                <BaggingAddButton onClick={addAwbLine} />
              </div>
            </FieldWrapper>
            <FieldWrapper borderLabel label="Transfer to UK">
              <div className="flex min-h-8 items-center px-1.5">
                <Checkbox
                  id="transferToUk"
                  checked={form.transferToUk}
                  onCheckedChange={(c) => patchForm({ transferToUk: c === true })}
                />
                <label htmlFor="transferToUk" className="ml-2 text-xs text-muted-foreground">
                  Check if transshipping via UK
                </label>
              </div>
            </FieldWrapper>
          </div>

          {/* Running Totals Bar */}
          <div className="mt-4 grid grid-cols-1 gap-2 rounded border bg-muted/20 p-3 text-sm md:grid-cols-3 xl:grid-cols-6">
            <p>
              <span className="font-medium text-foreground">Bag Weight:</span>{" "}
              <span className="text-muted-foreground">{summary.bagWeight} kg</span>
            </p>
            <p>
              <span className="font-medium text-foreground">Consignee Pin:</span>{" "}
              <span className="text-muted-foreground">{summary.consigneePinCode || "—"}</span>
            </p>
            <p>
              <span className="font-medium text-foreground">Total Bags:</span>{" "}
              <span className="font-semibold text-emerald-600">{summary.totalBagNo}</span>
            </p>
            <p>
              <span className="font-medium text-foreground">Total Pieces:</span>{" "}
              <span className="text-muted-foreground">{summary.totalPieces}</span>
            </p>
            <p>
              <span className="font-medium text-foreground">Total AWBs:</span>{" "}
              <span className="font-semibold text-emerald-600">{summary.totalAwbNo}</span>
            </p>
            <p>
              <span className="font-medium text-foreground">Total Weight:</span>{" "}
              <span className="font-semibold text-foreground">{summary.totalWeight} kg</span>
            </p>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={downloadTemplate} disabled={!canAdd && !canModify}>
              CSV Template
            </Button>
            <Button
              variant="secondary"
              onClick={() => importInputRef.current?.click()}
              disabled={!canAdd && !canModify}
            >
              CSV Import
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || (editingId ? !canModify : !canAdd)}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            <Button variant="destructive" onClick={closeEntry}>
              Cancel
            </Button>
          </div>
        </FormSection>
      </div>
    );
  }

  // List View
  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Bagging"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Bagging</h1>
        <p className="text-sm text-muted-foreground">
          Create, consolidate and manage bagging manifests for outbound international shipments.
          From city and To city are the origin and destination. Service center is the branch stored on the manifest.
        </p>
      </div>

      {/* Filter Bar */}
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
          <FieldWrapper borderLabel label="From date">
            <Input
              type="date"
              className={BG_INPUT}
              value={listFilters.fromDate}
              onChange={(e) => {
                setListFilters((f) => ({ ...f, fromDate: e.target.value }));
                setPage(1);
              }}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="To date">
            <Input
              type="date"
              className={BG_INPUT}
              value={listFilters.toDate}
              onChange={(e) => {
                setListFilters((f) => ({ ...f, toDate: e.target.value }));
                setPage(1);
              }}
            />
          </FieldWrapper>
          <FieldWrapper borderLabel label="Status">
            <Select
              value={listFilters.status || "ALL"}
              onValueChange={(status) => {
                setListFilters((f) => ({ ...f, status: status === "ALL" ? "" : status }));
                setPage(1);
              }}
            >
              <SelectTrigger className={BG_SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {BAGGING_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        </div>
      </Card>

      {/* Main Table */}
      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <DataIoToolbar
              export={{
                filename: "bagging",
                title: "Bagging",
                columns: [
                  { key: "manifest_no", header: "Manifest No" },
                  { key: "master_awb_no", header: "Master AWBNo" },
                  { key: "manifest_date", header: "Date" },
                  { key: "origin", header: "Origin" },
                  { key: "from_city", header: "From" },
                  { key: "to_city", header: "To" },
                  { key: "destination", header: "Destination" },
                  { key: "vendor_name", header: "Vendor" },
                  { key: "total_awbs", header: "Shipment" },
                  { key: "total_weight", header: "Weight" },
                ],
                getRows: () =>
                  filtered.map((r) => ({
                    manifest_no: r.manifest_no,
                    master_awb_no: r.master_awb_no,
                    manifest_date: formatDisplayDate(r.manifest_date),
                    origin: r.origin,
                    from_city: r.from_city,
                    to_city: r.to_city,
                    destination: r.destination,
                    vendor_name: r.vendor_name,
                    total_awbs: String(r.total_awbs),
                    total_weight: String(r.total_weight),
                  })),
              }}
            />
            <IconButton label="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <IconButton label="Clear filters" onClick={clearColFilters}>
              <Filter className="h-4 w-4" />
            </IconButton>
            <IconButton label="Search" onClick={() => void refetch()}>
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
              placeholder="Search manifest, MAWB, bag, AWB, vendor..."
              className="h-9 w-full min-w-[10rem] sm:w-48"
            />
            <Button size="sm" onClick={() => openAdd()} disabled={!canAdd} className="h-9 shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        {pageRows.length > 0 ? (
          <div className="flex flex-col gap-2 p-3 md:hidden">
            {pageRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openEntry(row)}
                className="rounded-md border bg-background p-3 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-emerald-600">{row.manifest_no}</span>
                  <span className="text-xs text-muted-foreground">{row.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDisplayDate(row.manifest_date)} · {row.service_center || "No service center"} · {row.vendor_name || "No vendor"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.from_city || "—"} to {row.to_city || "—"} · {row.total_awbs} AWBs · {Number(row.total_weight || 0).toFixed(3)} kg
                </p>
              </button>
            ))}
          </div>
        ) : null}
        <div className={pageRows.length > 0 ? "hidden overflow-x-auto md:block" : "overflow-x-auto"}>
          <table className="w-full min-w-[1100px] caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                {(
                  [
                    ["manifestNo", "Manifest No."],
                    ["masterAwbNo", "Master AWBNo"],
                    ["date", "Date"],
                    ["origin", "Origin city"],
                    ["serviceCenter", "Service center"],
                    ["from", "From city"],
                    ["to", "To city"],
                    ["destination", "Destination"],
                    ["vendor", "Vendor"],
                    ["shipment", "Shipment"],
                    ["weight", "Weight"],
                  ] as const
                ).map(([key, label]) => (
                  <TableHead key={key} className="whitespace-nowrap text-sidebar-foreground">
                    <button
                      type="button"
                      onClick={() => handleSort(key)}
                      className="flex items-center gap-1 font-semibold text-sidebar-foreground hover:text-foreground"
                    >
                      {label}
                      {sortCol === key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["manifestNo", "Manifest No."],
                    ["masterAwbNo", "Master AWBNo"],
                    ["date", "Date"],
                    ["origin", "Origin city"],
                    ["serviceCenter", "Service center"],
                    ["from", "From city"],
                    ["to", "To city"],
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
              {isError || countQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center text-sm text-destructive">
                    Could not load bagging manifests. {listError instanceof Error ? listError.message : "Try refresh."}
                  </TableCell>
                </TableRow>
              ) : authLoading || isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center text-sm text-muted-foreground">
                    Loading bagging manifests...
                  </TableCell>
                </TableRow>
              ) : !canList ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center text-sm text-muted-foreground">
                    Bagging list permission is required.
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center text-sm text-muted-foreground">
                    No bagging manifests found. Click &quot;Add&quot; to create one.
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
                        {row.manifest_no}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono">{row.master_awb_no || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDisplayDate(row.manifest_date)}</TableCell>
                    <TableCell>{row.origin}</TableCell>
                    <TableCell>{row.service_center || "—"}</TableCell>
                    <TableCell>{row.from_city}</TableCell>
                    <TableCell>{row.to_city}</TableCell>
                    <TableCell>{row.destination}</TableCell>
                    <TableCell className="max-w-[10rem] truncate" title={row.vendor_name}>
                      {row.vendor_name || row.vendor_code}
                    </TableCell>
                    <TableCell>{row.total_awbs}</TableCell>
                    <TableCell className="whitespace-nowrap">{Number(row.total_weight || 0).toFixed(3)} kg</TableCell>
                    <TableCell className="whitespace-nowrap px-1 text-center">
                      <div className="flex justify-center gap-0">
                        {canModify ? (
                        <IconButton
                          label="Edit"
                          variant="ghost"
                          size="row"
                          className="text-emerald-600"
                          onClick={() => openEntry(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        ) : null}
                        {canAdd ? (
                        <IconButton
                          label="Duplicate"
                          variant="ghost"
                          size="row"
                          className="text-blue-600"
                          onClick={() => duplicateEntry(row)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </IconButton>
                        ) : null}
                        {canDelete ? (
                        <IconButton
                          label="Delete"
                          variant="ghost"
                          size="row"
                          className="text-destructive"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                        ) : null}
                        <IconButton
                          label="Print Manifest"
                          variant="ghost"
                          size="row"
                          onClick={() => void handlePrintManifest(row)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </IconButton>
                        {canModify ? (
                        <IconButton
                          label="Add Progress"
                          variant="ghost"
                          size="row"
                          className="text-emerald-600"
                          onClick={() => {
                            setProgressManifest(row);
                            setProgressMode("add");
                            setProgressForm({
                              ...emptyProgressForm(),
                              serviceCentre: { code: row.origin || "HYD", name: row.origin || "HYD" },
                            });
                            setProgressOpen(true);
                          }}
                        >
                          <FilePlus className="h-3.5 w-3.5" />
                        </IconButton>
                        ) : null}
                        <IconButton
                          label="Export CSV"
                          variant="ghost"
                          size="row"
                          className="text-emerald-600"
                          onClick={async () => {
                            const details = await getBaggingDetails(row.id);
                            const lines = details?.awbLines || [];
                            downloadCsv(
                              `${row.manifest_no}.csv`,
                              ["Bag No", "CRN MHBS No", "Forwarding No", "AWB No", "Weight", "PCS", "Shipper", "Consignee"],
                              lines.map((l) => [l.bagNo, l.crnMhbsNo, l.forwardingNo, l.awbNo, l.weight, l.pcs, l.shipper, l.consignee]),
                            );
                            toast.success(`Exported ${row.manifest_no}.csv`);
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="History"
                          variant="ghost"
                          size="row"
                          onClick={() => setHistoryTarget(row)}
                        >
                          <History className="h-3.5 w-3.5" />
                        </IconButton>
                        <BaggingMoreMenu
                          onDownloadAll={() => {
                            setDownloadAllRow(row);
                            setDownloadAllForm(emptyDownloadAllForm());
                            setDownloadAllOpen(true);
                          }}
                          onPrintBagLabel={() => {
                            setBagLabelRow(row);
                            setBagLabelForm(emptyPrintBagLabelForm(String(row.total_bags || 1)));
                            setBagLabelOpen(true);
                          }}
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
          total={serverTotal}
        />
      </Card>

      {/* Print Bag Label Dialog */}
      <Dialog open={bagLabelOpen} onOpenChange={(o) => !o && setBagLabelOpen(false)}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Print Bag Labels
            </DialogTitle>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6">
            <div className="grid grid-cols-2 gap-3">
              <FieldWrapper label="From Bag No" required>
                <Input
                  value={bagLabelForm.fromBagNo}
                  onChange={(e) => setBagLabelForm((f) => ({ ...f, fromBagNo: e.target.value }))}
                  inputMode="numeric"
                />
              </FieldWrapper>
              <FieldWrapper label="To Bag No" required>
                <Input
                  value={bagLabelForm.toBagNo}
                  onChange={(e) => setBagLabelForm((f) => ({ ...f, toBagNo: e.target.value }))}
                  inputMode="numeric"
                />
              </FieldWrapper>
            </div>
            <FieldWrapper label="Remark">
              <Input
                value={bagLabelForm.remark}
                onChange={(e) => setBagLabelForm((f) => ({ ...f, remark: e.target.value }))}
                placeholder="Optional remark on tag"
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handlePrintBagLabels} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
              Print Labels
            </Button>
            <Button variant="destructive" onClick={() => setBagLabelOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Download All Modal */}
      <Dialog open={downloadAllOpen} onOpenChange={(o) => !o && setDownloadAllOpen(false)}>
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
            <Button
              onClick={async () => {
                if (!downloadAllRow) return;
                const details = await getBaggingDetails(downloadAllRow.id);
                let lines = details?.awbLines || [];
                const { fromBagNo, toBagNo } = downloadAllForm;
                if (fromBagNo || toBagNo) {
                  const from = Number.parseInt(fromBagNo, 10);
                  const to = Number.parseInt(toBagNo, 10);
                  lines = lines.filter((l) => {
                    const b = Number.parseInt(l.bagNo, 10);
                    if (!Number.isFinite(b)) return true;
                    if (Number.isFinite(from) && b < from) return false;
                    if (Number.isFinite(to) && b > to) return false;
                    return true;
                  });
                }
                downloadCsv(
                  `${downloadAllRow.manifest_no}-all.csv`,
                  ["Manifest No", "Bag No", "AWB No", "CRN No", "Forwarding No", "Weight", "Pieces"],
                  lines.map((l) => [downloadAllRow.manifest_no, l.bagNo, l.awbNo, l.crnMhbsNo, l.forwardingNo, l.weight, l.pcs]),
                );
                toast.success(`Exported ${lines.length} lines`);
                setDownloadAllOpen(false);
              }}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              Export
            </Button>
            <Button variant="destructive" onClick={() => setDownloadAllOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Progress Dialog */}
      <Dialog open={progressOpen} onOpenChange={(o) => !o && setProgressOpen(false)}>
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
            <p className="mt-2 text-xs text-muted-foreground">
              Delete Progress writes a reversal. The earlier progress event and scan stay in the history.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <FieldWrapper label="Bag No">
              <Input
                value={progressForm.bagNo}
                onChange={(e) => patchProgress({ bagNo: e.target.value })}
                placeholder="Leave blank for all bags"
              />
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
            <BaggingLookupField
              label="Service Centre"
              lookup="serviceCentre"
              value={progressForm.serviceCentre}
              onChange={(serviceCentre) => patchProgress({ serviceCentre })}
              required
            />
            <div className="md:col-span-2">
              <BaggingLookupField
                label="Exception"
                lookup="exception"
                value={progressForm.exception}
                onChange={(exception) => patchProgress({ exception })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleProgressSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
              Save
            </Button>
            <Button variant="destructive" onClick={() => setProgressOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyTarget)} onOpenChange={(open) => !open && setHistoryTarget(null)}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              History · {historyTarget?.manifest_no}
            </DialogTitle>
          </div>
          <div className="max-h-80 overflow-y-auto p-4">
            {historyQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading history…</p>
            ) : historyQuery.isError ? (
              <p className="text-sm text-destructive">Could not load bagging history.</p>
            ) : (historyQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No events for this manifest.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(historyQuery.data ?? []).map((event: BaggingEventRow) => (
                  <li key={event.id} className="border-b pb-2 text-sm">
                    <div className="font-medium">{event.event_type}</div>
                    <div className="text-muted-foreground">{event.event_text}</div>
                    <div className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bagging manifest?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove manifest {deleteTarget?.manifest_no} and unlink its bags.
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
  onDownloadAll,
  onPrintBagLabel,
}: {
  onDownloadAll: () => void;
  onPrintBagLabel: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerHover, setTriggerHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const moreActions = [
    {
      label: "Download All",
      icon: CloudDownload,
      className: "text-emerald-600",
      action: onDownloadAll,
    },
    {
      label: "Bag Label",
      icon: Tag,
      className: "text-sidebar",
      action: onPrintBagLabel,
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
