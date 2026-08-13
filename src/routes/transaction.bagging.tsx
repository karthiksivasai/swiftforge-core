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
  FileSpreadsheet,
  FileText,
  MoreVertical,
  FilePlus,
  Download,
  CloudDownload,
  FileImage,
  Mail,
  Tag,
  Copy,
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
  getBaggingDetails,
  recordBagging,
  deleteBagging,
  fetchShipmentForBagging,
  recordBaggingProgress,
  type BaggingListRow,
  type BaggingHeaderDto,
  type BaggingAwbLineDto,
} from "@/lib/transactions/resources/bagging";

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

type PrintBagLabelForm = {
  fromBagNo: string;
  toBagNo: string;
  remark: string;
};

type CsbExportForm = {
  runNo: string;
  csbType: "CSB-III" | "CSB-IV" | "CSB-V";
};

const DOWNLOAD_ALL_TYPES = ["AWBNo", "Forwarding No 1", "Forwarding No 2"] as const;
const DOWNLOAD_TIFF_TYPES = ["CSB-III", "CSB-IV", "CSB-V"] as const;
const MANIFEST_TYPES = ["High Value", "Low Value", "Transhipment"] as const;
const FORMAT_OPTIONS = [
  "Format 1",
  "Format 2",
  "Format 3",
  "Format 4",
  "Format 5",
  "Format 6",
] as const;

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

const emptyPrintBagLabelForm = (maxBag = "1"): PrintBagLabelForm => ({
  fromBagNo: "1",
  toBagNo: maxBag,
  remark: "",
});

const emptyCsbExportForm = (runNo = ""): CsbExportForm => ({
  runNo,
  csbType: "CSB-V",
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

function BaggingPage() {
  const { isAuthenticated: authed, profile } = useAuth();
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

  const [downloadTiffOpen, setDownloadTiffOpen] = useState(false);
  const [downloadTiffAllMode, setDownloadTiffAllMode] = useState(false);
  const [downloadTiffRow, setDownloadTiffRow] = useState<BaggingListRow | null>(null);
  const [downloadTiffForm, setDownloadTiffForm] = useState<DownloadTiffForm>(emptyDownloadTiffForm());

  const [csbExportOpen, setCsbExportOpen] = useState(false);
  const [csbExportRow, setCsbExportRow] = useState<BaggingListRow | null>(null);
  const [csbExportForm, setCsbExportForm] = useState<CsbExportForm>(emptyCsbExportForm());

  const [bagLabelOpen, setBagLabelOpen] = useState(false);
  const [bagLabelRow, setBagLabelRow] = useState<BaggingListRow | null>(null);
  const [bagLabelForm, setBagLabelForm] = useState<PrintBagLabelForm>(emptyPrintBagLabelForm());

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
  const { data: dbRows = [], isLoading, refetch } = useQuery({
    queryKey: ["baggings", listFilters.vendor.code, search],
    queryFn: () =>
      listBaggings({
        vendorCode: listFilters.vendor.code || undefined,
        search: search || undefined,
        limit: 100,
      }),
    enabled: authed,
  });

  const rows: BaggingListRow[] = authed ? dbRows : [];

  const patchForm = (patch: Partial<BaggingHeaderDto>) => setForm((f) => ({ ...f, ...patch }));
  const patchProgress = (patch: Partial<ProgressForm>) => setProgressForm((f) => ({ ...f, ...patch }));

  // Client filtering on top of server data
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const d = formatDisplayDate(row.manifest_date);
      const cf = colFilters;
      if (cf.manifestNo && !row.manifest_no.toLowerCase().includes(cf.manifestNo.toLowerCase())) return false;
      if (cf.masterAwbNo && !row.master_awb_no.toLowerCase().includes(cf.masterAwbNo.toLowerCase())) return false;
      if (cf.date && !d.includes(cf.date)) return false;
      if (cf.origin && !row.origin.toLowerCase().includes(cf.origin.toLowerCase())) return false;
      if (cf.from && !row.from_city.toLowerCase().includes(cf.from.toLowerCase())) return false;
      if (cf.to && !row.to_city.toLowerCase().includes(cf.to.toLowerCase())) return false;
      if (cf.destination && !row.destination.toLowerCase().includes(cf.destination.toLowerCase())) return false;
      if (cf.vendor && !row.vendor_name.toLowerCase().includes(cf.vendor.toLowerCase())) return false;
      if (cf.shipment && !String(row.total_awbs).includes(cf.shipment)) return false;
      if (cf.weight && !String(row.total_weight).includes(cf.weight)) return false;
      return true;
    });
  }, [rows, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const selectedLine = (form.awbLines || []).find((line) => line.id === selectedLineId) ?? null;

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
    return {
      bagWeight: formatWeight(currentBagWeight),
      consigneePinCode: "",
      totalBagNo: bagNos.size > 0 ? maxBag : 0,
      totalPieces,
      totalAwbNo: lines.length,
      totalWeight: lines.length > 0 ? formatWeight(totalWeight) : "0.000",
    };
  }, [form.awbLines, awbDraft.bagNo]);

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
        manifestNo: "0",
        date: todayIso(),
      });
      toast.success(`Duplicating manifest ${row.manifest_no} — ready for new save`);
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
      if (!form.originCity.code.trim() && !form.originCity.name.trim()) {
        throw new Error("Origin City is required");
      }
      if (!form.vendor.code.trim() && !form.vendor.name.trim()) {
        throw new Error("Vendor is required");
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
    setSearch("");
    setPage(1);
    toast.success("Filters cleared");
  };

  // Live AWB lookup and line addition
  const addAwbLine = async () => {
    const awb = awbDraft.awbNo.trim().toUpperCase();
    if (!awb) return toast.error("AWB No is required");
    const lines = form.awbLines || [];
    if (lines.some((line) => line.awbNo.toUpperCase() === awb)) {
      return toast.error(`AWB ${awb} is already added to this manifest`);
    }

    // Try fetching real shipment details from database
    let realData = null;
    try {
      realData = await fetchShipmentForBagging(awb);
    } catch (e) {
      console.warn("Could not lookup shipment:", e);
    }

    const newLine: BaggingAwbLineDto = {
      id: crypto.randomUUID(),
      bagNo: awbDraft.bagNo.trim() || "1",
      crnMhbsNo: awbDraft.crnMhbsNo.trim(),
      forwardingNo: awbDraft.forwardingNo.trim() || realData?.forwarding_no || "",
      awbNo: awb,
      weight: awbDraft.weight.trim() || realData?.weight || "10.000",
      pcs: awbDraft.pcs.trim() || realData?.pcs || "1",
      shipper: realData?.shipper || "—",
      consignee: realData?.consignee || "—",
      vendor: realData?.vendor || form.vendor.name || form.vendor.code || "—",
      airline: realData?.airline || form.airlinesCode.code || "—",
      service: realData?.service || "SPX",
      destination: realData?.destination || form.destCity.name || form.destCity.code || "—",
    };

    patchForm({ awbLines: [...lines, newLine] });
    setSelectedLineId(newLine.id);
    setAwbDraft((d) => ({ ...d, awbNo: "", forwardingNo: "", crnMhbsNo: "", weight: "" }));
    toast.success(`AWB ${awb} added ${realData ? `(${realData.shipper} → ${realData.consignee})` : ""}`);
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

  // Excel / CSV File Import Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = String(evt.target?.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        toast.error("File is empty or contains only header");
        return;
      }

      const headerLine = lines[0].toLowerCase();
      const hasHeader = headerLine.includes("awb") || headerLine.includes("bag");
      const dataRows = hasHeader ? lines.slice(1) : lines;

      let imported = 0;
      const currentLines = [...(form.awbLines || [])];

      for (const rowText of dataRows) {
        const cols = rowText.split(",").map((c) => c.replace(/["']/g, "").trim());
        if (!cols[0]) continue;

        // format: [BagNo, AWBNo, Weight, Pcs, ForwardingNo, CRN]
        const bNo = cols.length >= 2 ? cols[0] : "1";
        const awb = (cols.length >= 2 ? cols[1] : cols[0]).toUpperCase();
        const wt = cols[2] || "10.000";
        const pcs = cols[3] || "1";
        const fwd = cols[4] || "";
        const crn = cols[5] || "";

        if (!currentLines.some((l) => l.awbNo === awb)) {
          currentLines.push({
            id: crypto.randomUUID(),
            bagNo: bNo,
            awbNo: awb,
            crnMhbsNo: crn,
            forwardingNo: fwd,
            weight: wt,
            pcs,
            shipper: "—",
            consignee: "—",
            vendor: form.vendor.name || form.vendor.code || "—",
            airline: form.airlinesCode.code || "—",
            service: "SPX",
            destination: form.destCity.name || form.destCity.code || "—",
          });
          imported++;
        }
      }

      patchForm({ awbLines: currentLines });
      toast.success(`Imported ${imported} AWB lines from file into bagging draft`);
    };
    reader.readAsText(file);
    e.target.value = "";
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
              onChange={(serviceCenter) => patchForm({ serviceCenter })}
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
            <FieldWrapper borderLabel label="Search AWB Bag No">
              <div className="flex min-w-0 flex-1 items-stretch">
                <Input
                  className={`min-w-0 flex-1 ${BG_INPUT}`}
                  value={form.searchAwbBagNo || ""}
                  onChange={(e) => patchForm({ searchAwbBagNo: e.target.value })}
                  placeholder="Filter AWB in bags"
                />
                <Button
                  className="h-8 shrink-0 rounded-none border-0 border-l border-input bg-sidebar px-3 text-sidebar-foreground hover:bg-sidebar/90"
                  onClick={() => setAwbInBagSearch(form.searchAwbBagNo || "")}
                >
                  Search
                </Button>
              </div>
            </FieldWrapper>
          </div>
        </FormSection>

        {/* Middle Three Columns */}
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
          <FormSection title={`AWB No in Bags (${awbInBagCount})`}>
            <FieldWrapper borderLabel label="Search AWB No. In Bag">
              <Input
                className={BG_INPUT}
                value={awbInBagSearch}
                onChange={(e) => setAwbInBagSearch(e.target.value)}
                placeholder="Type to filter AWBs"
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
                  ["AWB No.", selectedLine?.awbNo ?? ""],
                  ["Shipper", selectedLine?.shipper ?? ""],
                  ["Consignee", selectedLine?.consignee ?? ""],
                  ["Vendor", selectedLine?.vendor ?? ""],
                  ["Airline", selectedLine?.airline ?? ""],
                  ["Service", selectedLine?.service ?? ""],
                  ["Weight", selectedLine?.weight ? `${selectedLine.weight} kg` : ""],
                  ["Pieces", selectedLine?.pcs ?? ""],
                  ["Destination", selectedLine?.destination ?? ""],
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
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              Excel Import
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
              disabled={saveMutation.isPending}
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
              placeholder="Search manifest, MAWB, vendor..."
              className="h-9 w-full min-w-[10rem] sm:w-48"
            />
            <Button size="sm" onClick={() => openAdd()} className="h-9 shrink-0 gap-1.5">
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
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-sm text-muted-foreground">
                    Loading bagging manifests...
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-sm text-muted-foreground">
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
                        <IconButton
                          label="Edit"
                          variant="ghost"
                          size="row"
                          className="text-emerald-600"
                          onClick={() => openEntry(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Duplicate"
                          variant="ghost"
                          size="row"
                          className="text-blue-600"
                          onClick={() => duplicateEntry(row)}
                        >
                          <Copy className="h-3.5 w-3.5" />
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
                          label="Print Manifest"
                          variant="ghost"
                          size="row"
                          onClick={() => handlePrintManifest(row)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton
                          label="Export to CSB"
                          variant="ghost"
                          size="row"
                          className="text-amber-600"
                          onClick={() => {
                            setCsbExportRow(row);
                            setCsbExportForm(emptyCsbExportForm(row.manifest_no));
                            setCsbExportOpen(true);
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </IconButton>
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
                        <BaggingMoreMenu
                          row={row}
                          onDownloadAll={() => {
                            setDownloadAllRow(row);
                            setDownloadAllForm(emptyDownloadAllForm());
                            setDownloadAllOpen(true);
                          }}
                          onDownloadTiff={() => {
                            setDownloadTiffRow(row);
                            setDownloadTiffAllMode(false);
                            setDownloadTiffForm(emptyDownloadTiffForm(row.manifest_no));
                            setDownloadTiffOpen(true);
                          }}
                          onDownloadAllTiff={() => {
                            setDownloadTiffRow(row);
                            setDownloadTiffAllMode(true);
                            setDownloadTiffForm(emptyDownloadTiffForm(row.manifest_no));
                            setDownloadTiffOpen(true);
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
          total={filtered.length}
        />
      </Card>

      {/* CSB Export Dialog */}
      <Dialog open={csbExportOpen} onOpenChange={(o) => !o && setCsbExportOpen(false)}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Export To CSB File
            </DialogTitle>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6">
            <FieldWrapper label="Run No / Manifest No">
              <Input value={csbExportForm.runNo} disabled readOnly />
            </FieldWrapper>
            <FieldWrapper label="CSB Format Type">
              <Select
                value={csbExportForm.csbType}
                onValueChange={(v) => setCsbExportForm((f) => ({ ...f, csbType: v as "CSB-III" | "CSB-IV" | "CSB-V" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CSB-III">CSB-III (Documents)</SelectItem>
                  <SelectItem value="CSB-IV">CSB-IV (Low Value Non-Docs)</SelectItem>
                  <SelectItem value="CSB-V">CSB-V (Commercial / High Value)</SelectItem>
                </SelectContent>
              </Select>
            </FieldWrapper>
            <div className="rounded border bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <strong>Customs EDI Notice:</strong> Electronic CSB file generation connects to your Indian Customs ICEGATE / Carrier EDI channel. Please supply the exact CSB-III/IV/V file layout or carrier EDI endpoint to generate formal flat files.
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button
              onClick={() => {
                toast.info(`CSB ${csbExportForm.csbType} export selected for Manifest ${csbExportForm.runNo}. Supply the exact CSB layout specification to output binary EDI files.`);
                setCsbExportOpen(false);
              }}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              Export
            </Button>
            <Button variant="destructive" onClick={() => setCsbExportOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Download Tiff Modal */}
      <Dialog open={downloadTiffOpen} onOpenChange={(o) => !o && setDownloadTiffOpen(false)}>
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
            <div className="col-span-2 rounded border bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <strong>TIFF Image Notice:</strong> Multi-page TIFF generation requires the exact carrier bag-tag / airway bill image DPI specification.
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button
              onClick={() => {
                toast.info(`Download TIFF selected for Run ${downloadTiffForm.runNo}. Supply the exact TIFF image specification to render multi-page binary TIFF files.`);
                setDownloadTiffOpen(false);
              }}
              className="bg-cyan-600 text-white hover:bg-cyan-600/90"
            >
              Download
            </Button>
            <Button variant="destructive" onClick={() => setDownloadTiffOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
  row,
  onDownloadAll,
  onDownloadTiff,
  onDownloadAllTiff,
  onPrintBagLabel,
}: {
  row: BaggingListRow;
  onDownloadAll: () => void;
  onDownloadTiff: () => void;
  onDownloadAllTiff: () => void;
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
