import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Filter,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Printer,
  FileSpreadsheet,
  Search,
  Upload,
  Download,
  DollarSign,
  Eye,
  FileText,
  CheckSquare,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { DataIoToolbar } from "@/components/data-io-toolbar";
import {
  FieldWrapper,
  IconButton,
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
  cancelDrs,
  completeDrs,
  dispatchDrs,
  fetchDrsLines,
  fetchPreDrsShipments,
  getDrsCompletionBoard,
  listDrs,
  lookupShipmentForDrs,
  markShipmentDeliveryAttempt,
  reopenDrs,
  saveDrs,
} from "@/lib/transactions/resources/drs";
import {
  canCancelDrs,
  canCompleteDrs,
  canDispatchDrs,
  canEditDrsStatus,
  canRecordDeliveryAttempt,
  canReopenDrs,
  type DeliveryOutcome,
} from "@/lib/transactions/schemas/drs";
import {
  countersFromBoard,
  dbDrsToListRow,
  deriveDeliveryCounters,
  drsStatusBadgeVariant,
  shipmentStatusLabel,
  uiFormToDrsPayload,
  validateCompletionReady,
  type LookupPair,
  type UiDrsAwbLine as DrsAwbLine,
  type UiDrsForm as DrsEntryForm,
  type DrsCostEntry,
  type DrsAttachment,
} from "@/lib/transactions/drsUiMap";
import { parseTabularFile } from "@/lib/io/tableIo";

type DrsRow = {
  id: string;
  rowVersion?: number;
  status?: string;
  drsNo: string;
  drsDate: string;
  drsTime: string;
  serviceCentre: LookupPair;
  areaCode: string;
  areaName: string;
  areaSeq: string;
  serviceCenter: string;
  fieldExecutiveCode: string;
  fieldExecutiveName: string;
  fieldExecutiveId?: string;
  vehicleNo: string;
  vehicleType: string;
  fromKm: string;
  toKm: string;
  vehicleOwner: LookupPair;
  vehicleOwnerContact: string;
  driver: LookupPair;
  driverContact: string;
  runNo: string;
  remark: string;
  awbLines: DrsAwbLine[];
  costEntry?: DrsCostEntry;
  attachments?: DrsAttachment[];
};

type ColFilterKey = "drsNo" | "date" | "area" | "serviceCenter" | "fieldExecutive";

type FormSetupSettings = {
  allowConsigneeName: boolean;
};

type PageView = "list" | "entry";

const VEHICLE_TYPES = [
  { value: "Bike", label: "Bike / 2-Wheeler" },
  { value: "Auto", label: "Auto / 3-Wheeler" },
  { value: "Van", label: "Van / Small Truck" },
  { value: "Truck", label: "Truck / Large Vehicle" },
] as const;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const nowDrsTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const defaultFormSetup = (): FormSetupSettings => ({
  allowConsigneeName: true,
});

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  drsNo: "",
  date: "",
  area: "",
  serviceCenter: "",
  fieldExecutive: "",
});

const emptyEntryForm = (): DrsEntryForm => ({
  drsNo: "0",
  drsDate: todayIso(),
  drsTime: nowDrsTime(),
  serviceCentre: { code: "HYD", name: "HYDERABAD" },
  area: emptyPair(),
  areaSeq: "",
  fieldExecutive: emptyPair(),
  vehicleNo: "",
  vehicleType: "Bike",
  fromKm: "",
  toKm: "",
  vehicleOwner: emptyPair(),
  vehicleOwnerContact: "",
  driver: emptyPair(),
  driverContact: "",
  runNo: "",
  remark: "",
  awbLines: [],
  costEntry: {
    hrCost: 0,
    otherCost: 0,
    vehicleCost: 0,
    totalCost: 0,
    voucherNo: "",
    voucherAmount: 0,
  },
  attachments: [],
});

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const rowDisplay = (row: DrsRow) => ({
  drsNo: row.drsNo,
  date: formatDisplayDate(row.drsDate),
  area: row.areaCode,
  serviceCenter: row.serviceCenter,
  fieldExecutive: row.fieldExecutiveName,
});

const nextDrsNo = (rows: DrsRow[]) => {
  const year = new Date().getFullYear();
  const prefix = `HYD/HYD/${year}/`;
  const max = rows.reduce((acc, row) => {
    if (!row.drsNo.startsWith(prefix)) return acc;
    const part = Number.parseInt(row.drsNo.slice(prefix.length), 10);
    return Number.isFinite(part) ? Math.max(acc, part) : acc;
  }, 0);
  return `${prefix}${max + 1}`;
};

const rowToEntryForm = (row: DrsRow): DrsEntryForm => ({
  drsNo: row.drsNo,
  drsDate: row.drsDate,
  drsTime: row.drsTime,
  serviceCentre: row.serviceCentre || { code: row.serviceCenter || "HYD", name: row.serviceCenter || "HYDERABAD" },
  area: { code: row.areaCode, name: row.areaName },
  areaSeq: row.areaSeq,
  fieldExecutive: {
    id: row.fieldExecutiveId,
    code: row.fieldExecutiveCode,
    name: row.fieldExecutiveName,
  },
  vehicleNo: row.vehicleNo ?? "",
  vehicleType: row.vehicleType ?? "Bike",
  fromKm: row.fromKm ?? "",
  toKm: row.toKm ?? "",
  vehicleOwner: row.vehicleOwner || emptyPair(),
  vehicleOwnerContact: row.vehicleOwnerContact ?? "",
  driver: row.driver || emptyPair(),
  driverContact: row.driverContact ?? "",
  runNo: row.runNo ?? "",
  remark: row.remark,
  awbLines: row.awbLines.map((line) => ({ ...line })),
  costEntry: row.costEntry,
  attachments: row.attachments,
});

const entryFormToRow = (
  form: DrsEntryForm,
  editing: DrsRow | null,
  allRows: DrsRow[],
): Omit<DrsRow, "id"> => ({
  drsNo: editing?.drsNo ?? nextDrsNo(allRows),
  drsDate: form.drsDate,
  drsTime: form.drsTime.trim(),
  serviceCentre: form.serviceCentre,
  areaCode: form.area.code.trim() || form.area.name.trim(),
  areaName: form.area.name.trim() || form.area.code.trim(),
  areaSeq: form.areaSeq.trim(),
  serviceCenter: form.serviceCentre.code.trim() || form.area.code.trim() || editing?.serviceCenter || "HYD",
  fieldExecutiveCode: form.fieldExecutive.code.trim() || form.fieldExecutive.name.trim(),
  fieldExecutiveName: form.fieldExecutive.name.trim() || form.fieldExecutive.code.trim(),
  fieldExecutiveId: form.fieldExecutive.id,
  vehicleNo: form.vehicleNo.trim(),
  vehicleType: form.vehicleType,
  fromKm: form.fromKm.trim(),
  toKm: form.toKm.trim(),
  vehicleOwner: form.vehicleOwner,
  vehicleOwnerContact: form.vehicleOwnerContact.trim(),
  driver: form.driver,
  driverContact: form.driverContact.trim(),
  runNo: form.runNo.trim(),
  remark: form.remark.trim(),
  status: editing?.status ?? "DRAFT",
  rowVersion: editing?.rowVersion,
  awbLines: form.awbLines,
  costEntry: form.costEntry,
  attachments: form.attachments,
});

export const Route = createFileRoute("/transaction/drs-scan")({
  component: DrsScanPage,
  head: () => ({
    meta: [
      { title: "DRS Scan — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage delivery run sheets with AWB scanning." },
    ],
  }),
});

function DrsScanPage() {
  const { isAuthenticated: authed, profile } = useAuth();
  const queryClient = useQueryClient();
  const [demoRows, setDemoRows] = useState<DrsRow[]>([]);
  const [view, setView] = useState<PageView>("list");
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DrsRow | null>(null);
  const [entryForm, setEntryForm] = useState<DrsEntryForm>(emptyEntryForm);
  const [awbDraft, setAwbDraft] = useState("");
  const [scanBy, setScanBy] = useState<"awb" | "ref">("awb");
  const [deleteTarget, setDeleteTarget] = useState<DrsRow | null>(null);
  const [formSetupOpen, setFormSetupOpen] = useState(false);
  const [formSetupSettings, setFormSetupSettings] = useState<FormSetupSettings>(defaultFormSetup);
  const [formSetupDraft, setFormSetupDraft] = useState<FormSetupSettings>(defaultFormSetup);
  const [saving, setSaving] = useState(false);

  // Dialog states
  const [costEntryOpen, setCostEntryOpen] = useState(false);
  const [costDraft, setCostDraft] = useState<DrsCostEntry>({
    hrCost: 0,
    otherCost: 0,
    vehicleCost: 0,
    totalCost: 0,
    voucherNo: "",
    voucherAmount: 0,
  });

  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<{
    total: number;
    accepted: number;
    rejected: Array<{ awb: string; reason: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preDrsOpen, setPreDrsOpen] = useState(false);
  const [preDrsSelected, setPreDrsSelected] = useState<Set<string>>(new Set());

  const [awbDetailOpen, setAwbDetailOpen] = useState(false);
  const [selectedAwbDetail, setSelectedAwbDetail] = useState<DrsAwbLine | null>(null);

  const [uploadCopyOpen, setUploadCopyOpen] = useState(false);
  const copyFileInputRef = useRef<HTMLInputElement>(null);

  const liveQuery = useQuery({
    queryKey: ["drs", "list", search],
    queryFn: () => listDrs({ pageSize: 500, search: search.trim() || undefined }),
    enabled: authed,
  });

  const boardQuery = useQuery({
    queryKey: ["drs", "board", editing?.id],
    queryFn: () => getDrsCompletionBoard(editing!.id),
    enabled: authed && Boolean(editing?.id) && view === "entry",
  });

  const preDrsQuery = useQuery({
    queryKey: ["drs", "pre-drs-shipments"],
    queryFn: () => fetchPreDrsShipments(),
    enabled: authed && preDrsOpen,
  });

  const rows: DrsRow[] = authed
    ? (liveQuery.data?.rows ?? []).map((r) => {
        const mapped = dbDrsToListRow(r);
        return {
          id: mapped.id,
          rowVersion: mapped.rowVersion,
          status: mapped.status,
          drsNo: mapped.drsNo,
          drsDate: mapped.drsDate,
          drsTime: mapped.drsTime,
          serviceCentre: mapped.serviceCentre,
          areaCode: mapped.area.code,
          areaName: mapped.area.name,
          areaSeq: mapped.areaSeq,
          serviceCenter: mapped.serviceCenter,
          fieldExecutiveCode: mapped.fieldExecutive.code,
          fieldExecutiveName: mapped.fieldExecutive.name,
          fieldExecutiveId: mapped.fieldExecutive.id,
          vehicleNo: mapped.vehicleNo,
          vehicleType: mapped.vehicleType,
          fromKm: mapped.fromKm,
          toKm: mapped.toKm,
          vehicleOwner: mapped.vehicleOwner,
          vehicleOwnerContact: mapped.vehicleOwnerContact,
          driver: mapped.driver,
          driverContact: mapped.driverContact,
          runNo: mapped.runNo,
          remark: mapped.remark,
          awbLines: mapped.awbLines,
          costEntry: mapped.costEntry,
          attachments: mapped.attachments,
        };
      })
    : demoRows;

  const refreshLive = async () => {
    await queryClient.invalidateQueries({ queryKey: ["drs"] });
  };

  const deliveryCounters = useMemo(() => {
    if (authed && boardQuery.data) return countersFromBoard(boardQuery.data);
    return deriveDeliveryCounters(
      entryForm.awbLines.map((l) => ({
        outcome: l.outcome,
        shipmentStatus: l.shipmentStatus,
      })),
    );
  }, [authed, boardQuery.data, entryForm.awbLines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const d = rowDisplay(row);
      if (
        q &&
        ![d.drsNo, d.date, d.area, d.serviceCenter, d.fieldExecutive, row.status ?? ""].some((v) =>
          v.toLowerCase().includes(q),
        )
      ) {
        return false;
      }
      if (colFilters.drsNo && !d.drsNo.toLowerCase().includes(colFilters.drsNo.toLowerCase()))
        return false;
      if (colFilters.date && !d.date.toLowerCase().includes(colFilters.date.toLowerCase()))
        return false;
      if (colFilters.area && !d.area.toLowerCase().includes(colFilters.area.toLowerCase()))
        return false;
      if (
        colFilters.serviceCenter &&
        !d.serviceCenter.toLowerCase().includes(colFilters.serviceCenter.toLowerCase())
      ) {
        return false;
      }
      if (
        colFilters.fieldExecutive &&
        !d.fieldExecutive.toLowerCase().includes(colFilters.fieldExecutive.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [rows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const formStatus = editing?.status ?? (view === "entry" && !editing ? "DRAFT" : undefined);
  const isReadOnly = Boolean(formStatus && !canEditDrsStatus(formStatus));

  const openAdd = () => {
    setEditing(null);
    const branchCode = profile?.home_branch_id ? "HYD" : "HYD";
    setEntryForm({
      ...emptyEntryForm(),
      drsDate: todayIso(),
      drsTime: nowDrsTime(),
      serviceCentre: { code: branchCode, name: branchCode },
    });
    setAwbDraft("");
    setView("entry");
  };

  const openEntry = async (row: DrsRow) => {
    if (authed) {
      try {
        const lines = await fetchDrsLines(row.id);
        const full = (liveQuery.data?.rows ?? []).find((r) => r.id === row.id);
        if (!full) {
          toast.error("DRS not found");
          return;
        }
        const mapped = dbDrsToListRow(full);
        mapped.awbLines = lines.map((l) => ({
          id: crypto.randomUUID(),
          shipmentId: l.shipment_id,
          awbNo: l.awb_no,
          bookDate: l.book_date ? formatDisplayDate(l.book_date) : "",
          origin: l.origin_name || l.origin_code || "",
          destination: l.destination_name || l.destination_code || "",
          customer: l.customer_name || l.customer_code || "",
          consignee: l.consignee_name ?? "",
          pcs: String(l.pieces ?? ""),
          weight: String(l.charge_weight ?? ""),
          ewayBillNo: l.eway_bill_no ?? "",
          shipmentValue: l.shipment_value != null ? String(l.shipment_value) : "",
          outcome: l.outcome,
          attemptCount: l.attempt_count,
        }));
        try {
          const board = await getDrsCompletionBoard(row.id);
          const byShip = new Map(board.lines.map((b) => [b.shipment_id, b]));
          mapped.awbLines = mapped.awbLines.map((line) => {
            const b = line.shipmentId ? byShip.get(line.shipmentId) : undefined;
            return b
              ? {
                  ...line,
                  shipmentStatus: b.shipment_status,
                  outcome: b.outcome,
                  attemptCount: b.attempt_count,
                }
              : line;
          });
        } catch {
          /* board optional */
        }
        const uiRow: DrsRow = {
          id: mapped.id,
          rowVersion: mapped.rowVersion,
          status: mapped.status,
          drsNo: mapped.drsNo,
          drsDate: mapped.drsDate,
          drsTime: mapped.drsTime,
          serviceCentre: mapped.serviceCentre,
          areaCode: mapped.area.code,
          areaName: mapped.area.name,
          areaSeq: mapped.areaSeq,
          serviceCenter: mapped.serviceCenter,
          fieldExecutiveCode: mapped.fieldExecutive.code,
          fieldExecutiveName: mapped.fieldExecutive.name,
          fieldExecutiveId: mapped.fieldExecutive.id,
          vehicleNo: mapped.vehicleNo,
          vehicleType: mapped.vehicleType,
          fromKm: mapped.fromKm,
          toKm: mapped.toKm,
          vehicleOwner: mapped.vehicleOwner,
          vehicleOwnerContact: mapped.vehicleOwnerContact,
          driver: mapped.driver,
          driverContact: mapped.driverContact,
          runNo: mapped.runNo,
          remark: mapped.remark,
          awbLines: mapped.awbLines,
          costEntry: mapped.costEntry,
          attachments: mapped.attachments,
        };
        setEditing(uiRow);
        setEntryForm(rowToEntryForm(uiRow));
      } catch (err) {
        toast.error(toErrorMessage(err));
        return;
      }
    } else {
      setEditing(row);
      setEntryForm(rowToEntryForm(row));
    }
    setAwbDraft("");
    setView("entry");
  };

  const closeEntry = () => {
    setView("list");
    setEditing(null);
    setEntryForm(emptyEntryForm());
    setAwbDraft("");
  };

  const patchEntry = (patch: Partial<DrsEntryForm>) => setEntryForm((f) => ({ ...f, ...patch }));

  const persistEntry = async () => {
    if (!entryForm.area.code.trim() && !entryForm.area.name.trim()) {
      return toast.error("Area is required");
    }
    if (!entryForm.fieldExecutive.code.trim() && !entryForm.fieldExecutive.name.trim()) {
      return toast.error("Field Executive is required");
    }

    if (authed) {
      setSaving(true);
      try {
        const formForSave = editing
          ? entryForm
          : { ...entryForm, drsDate: todayIso(), drsTime: nowDrsTime() };
        const { fields, lines } = uiFormToDrsPayload(formForSave);
        const saved = await saveDrs({
          id: editing?.id ?? null,
          rowVersion: editing?.rowVersion ?? null,
          fields,
          lines,
        });
        toast.success(editing ? "DRS saved" : `DRS created (${saved.drs_no})`);
        await refreshLive();
        closeEntry();
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    const formForSave = editing
      ? entryForm
      : { ...entryForm, drsDate: todayIso(), drsTime: nowDrsTime() };
    const payload = entryFormToRow(formForSave, editing, demoRows);

    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)),
      );
      toast.success("DRS saved");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("DRS created");
    }
    closeEntry();
  };

  const handleDispatch = async () => {
    if (!editing) return;
    if (!canDispatchDrs(editing.status, entryForm.awbLines.length)) {
      return toast.error("DRS must be DRAFT with at least one shipment");
    }
    if (authed) {
      setSaving(true);
      try {
        const { fields, lines } = uiFormToDrsPayload(entryForm);
        const saved = await saveDrs({
          id: editing.id,
          rowVersion: editing.rowVersion ?? null,
          fields,
          lines,
        });
        await dispatchDrs({ id: saved.id, rowVersion: saved.row_version });
        toast.success("DRS dispatched");
        await refreshLive();
        closeEntry();
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    setDemoRows((prev) =>
      prev.map((r) =>
        r.id === editing.id
          ? { ...r, ...entryFormToRow(entryForm, editing, prev), status: "DISPATCHED" }
          : r,
      ),
    );
    toast.success("DRS dispatched");
    closeEntry();
  };

  const handleCancelDrs = async () => {
    if (!editing || !canCancelDrs(editing.status)) {
      return toast.error("Only DRAFT DRS can be cancelled");
    }
    if (authed) {
      setSaving(true);
      try {
        await cancelDrs({
          id: editing.id,
          rowVersion: editing.rowVersion ?? 1,
          reason: "Cancelled from DRS Scan",
        });
        toast.success("DRS cancelled");
        await refreshLive();
        closeEntry();
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    setDemoRows((prev) =>
      prev.map((r) => (r.id === editing.id ? { ...r, status: "CANCELLED", awbLines: [] } : r)),
    );
    toast.success("DRS cancelled");
    closeEntry();
  };

  const applyLocalOutcome = (lineId: string, outcome: DeliveryOutcome) => {
    const shipmentStatus = outcome;
    const lineOutcome =
      outcome === "DELIVERED_PENDING_POD"
        ? "DELIVERED"
        : outcome === "UNDELIVERED"
          ? "UNDELIVERED"
          : null;
    patchEntry({
      awbLines: entryForm.awbLines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              shipmentStatus,
              outcome: lineOutcome,
              attemptCount: (line.attemptCount ?? 0) + 1,
            }
          : line,
      ),
    });
  };

  const handleDeliveryOutcome = async (line: DrsAwbLine, outcome: DeliveryOutcome) => {
    if (!editing || !canRecordDeliveryAttempt(editing.status)) {
      return toast.error("Delivery outcomes require a DISPATCHED DRS");
    }
    if (authed) {
      setSaving(true);
      try {
        const result = await markShipmentDeliveryAttempt({
          drs_id: editing.id,
          shipment_id: line.shipmentId || null,
          awb_no: line.awbNo,
          outcome,
          remark: null,
        });
        toast.success(
          outcome === "DELIVERED_PENDING_POD"
            ? `AWB ${result.awb_no ?? line.awbNo} marked delivered (pending POD)`
            : outcome === "UNDELIVERED"
              ? `AWB ${result.awb_no ?? line.awbNo} marked undelivered`
              : `AWB ${result.awb_no ?? line.awbNo} delivery attempt recorded`,
        );
        await refreshLive();
        const board = await getDrsCompletionBoard(editing.id);
        const byShip = new Map(board.lines.map((b) => [b.shipment_id, b]));
        patchEntry({
          awbLines: entryForm.awbLines.map((l) => {
            const b = l.shipmentId ? byShip.get(l.shipmentId) : undefined;
            return b
              ? {
                  ...l,
                  shipmentStatus: b.shipment_status,
                  outcome: b.outcome,
                  attemptCount: b.attempt_count,
                }
              : l;
          }),
        });
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    applyLocalOutcome(line.id, outcome);
    toast.success(`AWB ${line.awbNo} updated`);
  };

  const handleCompleteDrs = async () => {
    if (!editing) return;
    const check = validateCompletionReady(deliveryCounters.pending);
    if (!canCompleteDrs(editing.status, deliveryCounters.pending)) {
      return toast.error(check.message);
    }
    if (authed) {
      setSaving(true);
      try {
        await completeDrs({ id: editing.id, rowVersion: editing.rowVersion ?? 1 });
        toast.success("DRS completed");
        await refreshLive();
        closeEntry();
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    setDemoRows((prev) =>
      prev.map((r) => (r.id === editing.id ? { ...r, status: "COMPLETED" } : r)),
    );
    toast.success("DRS completed");
    closeEntry();
  };

  const handleReopenDrs = async () => {
    if (!editing || !canReopenDrs(editing.status)) {
      return toast.error("Only COMPLETED DRS can be reopened");
    }
    if (authed) {
      setSaving(true);
      try {
        await reopenDrs({
          id: editing.id,
          rowVersion: editing.rowVersion ?? 1,
          reason: "Reopened from DRS Scan",
        });
        toast.success("DRS reopened");
        await refreshLive();
        const row = (await listDrs({ pageSize: 500 })).rows.find((r) => r.id === editing.id);
        if (row) await openEntry(dbDrsToListRow(row) as unknown as DrsRow);
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    setDemoRows((prev) =>
      prev.map((r) => (r.id === editing.id ? { ...r, status: "DISPATCHED" } : r)),
    );
    setEditing((prev) => (prev ? { ...prev, status: "DISPATCHED" } : prev));
    toast.success("DRS reopened");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (authed) {
      if (!canCancelDrs(deleteTarget.status)) {
        toast.error("Only DRAFT DRS can be cancelled");
        setDeleteTarget(null);
        return;
      }
      try {
        await cancelDrs({
          id: deleteTarget.id,
          rowVersion: deleteTarget.rowVersion ?? 1,
          reason: "Deleted from list",
        });
        toast.success(`Cancelled ${deleteTarget.drsNo}`);
        await refreshLive();
      } catch (err) {
        toast.error(toErrorMessage(err));
      }
      setDeleteTarget(null);
      return;
    }
    setDemoRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.drsNo}`);
    setDeleteTarget(null);
  };

  const handleRefresh = async () => {
    setSearch("");
    setColFilters(emptyColFilters());
    setPage(1);
    if (authed) await refreshLive();
    toast.success("List refreshed");
  };

  const clearColFilters = () => {
    setColFilters(emptyColFilters());
    setPage(1);
    toast.info("Column filters cleared");
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

  const addAwbLine = async () => {
    if (isReadOnly) return toast.error("DRS is not editable");
    if (!entryForm.area.code.trim() && !entryForm.area.name.trim()) {
      return toast.error("Area is required");
    }
    const q = awbDraft.trim();
    if (!q) return toast.error("Please enter AWB or Reference No");
    if (entryForm.awbLines.some((line) => line.awbNo.toLowerCase() === q.toLowerCase())) {
      return toast.error("AWB already added to DRS");
    }

    if (authed) {
      try {
        const ship = await lookupShipmentForDrs(q, scanBy);
        if (!ship) return toast.error(`Shipment not found for ${scanBy === "ref" ? "Reference" : "AWB"} '${q}'`);
        if (ship.current_status === "CANCELLED" || ship.current_status === "VOID") {
          return toast.error("Cancelled shipments cannot be assigned");
        }
        if (ship.current_status !== "MANIFEST_INSCANNED") {
          return toast.error(`Shipment must be MANIFEST_INSCANNED (currently ${ship.current_status})`);
        }
        const line: DrsAwbLine = {
          id: crypto.randomUUID(),
          shipmentId: ship.shipment_id,
          awbNo: ship.awb_no,
          bookDate: ship.book_date ? formatDisplayDate(ship.book_date) : "",
          origin: ship.origin_name || "HYD",
          destination: ship.destination_name || "",
          customer: ship.customer_name || "",
          consignee: ship.consignee_name ?? "",
          pcs: String(ship.pieces),
          weight: String(ship.charge_weight),
          ewayBillNo: ship.eway_bill_no ?? "",
          shipmentValue: ship.shipment_value != null ? String(ship.shipment_value) : "",
        };
        patchEntry({ awbLines: [...entryForm.awbLines, line] });
        setAwbDraft("");
        toast.success(`AWB ${ship.awb_no} added`);
      } catch (err) {
        toast.error(toErrorMessage(err));
      }
      return;
    }

    const dummyLine: DrsAwbLine = {
      id: crypto.randomUUID(),
      awbNo: q,
      bookDate: formatDisplayDate(todayIso()),
      origin: "HYD",
      destination: "TW",
      customer: "CUSTOMER",
      consignee: "CONSIGNEE",
      pcs: "1",
      weight: "1.000",
      ewayBillNo: "",
      shipmentValue: "500.00",
    };
    patchEntry({ awbLines: [...entryForm.awbLines, dummyLine] });
    setAwbDraft("");
    toast.success(`AWB ${q} added`);
  };

  const removeAwbLine = (lineId: string) => {
    if (isReadOnly) return;
    patchEntry({ awbLines: entryForm.awbLines.filter((line) => line.id !== lineId) });
  };

  // Cost Entry Handlers
  const openCostEntry = () => {
    setCostDraft(
      entryForm.costEntry || {
        hrCost: 0,
        otherCost: 0,
        vehicleCost: 0,
        totalCost: 0,
        voucherNo: "",
        voucherAmount: 0,
      },
    );
    setCostEntryOpen(true);
  };

  const handleCostSubmit = () => {
    const total = (costDraft.hrCost || 0) + (costDraft.otherCost || 0) + (costDraft.vehicleCost || 0);
    const finalized = { ...costDraft, totalCost: total };
    patchEntry({ costEntry: finalized });
    setCostEntryOpen(false);
    toast.success("Cost Entry saved for DRS");
  };

  // Bulk Upload Handlers
  const handleBulkUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploading(true);
    try {
      const parsed = await parseTabularFile(file);
      if (parsed.rows.length === 0) {
        toast.error("File is empty");
        return;
      }
      const existingAwbs = new Set(entryForm.awbLines.map((l) => l.awbNo.toLowerCase()));
      const addedLines: DrsAwbLine[] = [];
      const rejected: Array<{ awb: string; reason: string }> = [];

      for (const row of parsed.rows) {
        const awb = String(row["AWB No"] || row["awb_no"] || row["AWB"] || Object.values(row)[0] || "").trim();
        if (!awb) continue;
        if (existingAwbs.has(awb.toLowerCase())) {
          rejected.push({ awb, reason: "Duplicate in current DRS" });
          continue;
        }

        if (authed) {
          try {
            const ship = await lookupShipmentForDrs(awb, "awb");
            if (!ship) {
              rejected.push({ awb, reason: "Shipment not found" });
              continue;
            }
            if (ship.current_status !== "MANIFEST_INSCANNED") {
              rejected.push({ awb, reason: `Status is ${ship.current_status} (must be MANIFEST_INSCANNED)` });
              continue;
            }
            addedLines.push({
              id: crypto.randomUUID(),
              shipmentId: ship.shipment_id,
              awbNo: ship.awb_no,
              bookDate: ship.book_date ? formatDisplayDate(ship.book_date) : "",
              origin: ship.origin_name || "HYD",
              destination: ship.destination_name || "",
              customer: ship.customer_name || "",
              consignee: ship.consignee_name ?? "",
              pcs: String(ship.pieces),
              weight: String(ship.charge_weight),
              ewayBillNo: ship.eway_bill_no ?? "",
              shipmentValue: ship.shipment_value != null ? String(ship.shipment_value) : "",
            });
            existingAwbs.add(ship.awb_no.toLowerCase());
          } catch (err) {
            rejected.push({ awb, reason: toErrorMessage(err) });
          }
        } else {
          addedLines.push({
            id: crypto.randomUUID(),
            awbNo: awb,
            bookDate: formatDisplayDate(todayIso()),
            origin: "HYD",
            destination: "TW",
            customer: "DEMO",
            consignee: "DEMO",
            pcs: "1",
            weight: "1.000",
            ewayBillNo: "",
            shipmentValue: "100.00",
          });
          existingAwbs.add(awb.toLowerCase());
        }
      }

      patchEntry({ awbLines: [...entryForm.awbLines, ...addedLines] });
      setBulkSummary({
        total: parsed.rows.length,
        accepted: addedLines.length,
        rejected,
      });
      toast.success(`Imported ${addedLines.length} AWBs into DRS`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBulkUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadBulkTemplate = () => {
    downloadCsv("drs_awb_import_template.csv", ["AWB No", "Remarks"], [["30404019", "Express"], ["30404020", "Urgent"]]);
  };

  // Pre-DRS Handlers
  const handlePreDrsAdd = () => {
    const available = preDrsQuery.data ?? [];
    const chosen = available.filter((s) => preDrsSelected.has(s.shipment_id));
    const existing = new Set(entryForm.awbLines.map((l) => l.awbNo));
    const newLines: DrsAwbLine[] = [];

    for (const s of chosen) {
      if (!existing.has(s.awb_no)) {
        newLines.push({
          id: crypto.randomUUID(),
          shipmentId: s.shipment_id,
          awbNo: s.awb_no,
          bookDate: s.book_date ? formatDisplayDate(s.book_date) : "",
          origin: s.origin_name || "HYD",
          destination: s.destination_name || "",
          customer: s.customer_name || "",
          consignee: s.consignee_name || "",
          pcs: String(s.pieces),
          weight: String(s.charge_weight),
          ewayBillNo: "",
          shipmentValue: "",
        });
      }
    }

    patchEntry({ awbLines: [...entryForm.awbLines, ...newLines] });
    setPreDrsOpen(false);
    setPreDrsSelected(new Set());
    toast.success(`Added ${newLines.length} shipments from Pre-DRS list`);
  };

  // Print Run Sheet
  const handlePrintRunSheet = (row?: DrsRow) => {
    const target = row || (editing ? { ...editing, ...entryFormToRow(entryForm, editing, demoRows) } : null);
    if (!target) {
      toast.error("No DRS selected for printing");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocked. Allow popups to print DRS.");
      return;
    }
    const lines = target.awbLines || entryForm.awbLines;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Delivery Run Sheet — ${target.drsNo}</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 15px; }
            .header h1 { margin: 0 0 4px; font-size: 18px; text-transform: uppercase; }
            .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 15px; border-bottom: 1px dashed #666; padding-bottom: 10px; }
            .meta div { font-size: 12px; }
            .meta strong { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
            th { background-color: #f0f0f0; font-size: 11px; text-transform: uppercase; }
            .totals { margin-top: 15px; font-weight: bold; display: flex; justify-content: space-between; border-top: 1px solid #333; padding-top: 8px; }
            .signatures { margin-top: 50px; display: flex; justify-content: space-between; }
            .sig-line { width: 200px; border-top: 1px solid #333; text-align: center; padding-top: 4px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>SwiftForge Logistics — Delivery Run Sheet</h1>
            <div>DRS NO: <strong>${target.drsNo}</strong> | STATUS: <strong>${target.status || "DRAFT"}</strong></div>
          </div>
          <div class="meta">
            <div><strong>Date:</strong> ${formatDisplayDate(target.drsDate)} ${target.drsTime || ""}</div>
            <div><strong>Service Center:</strong> ${target.serviceCenter || target.serviceCentre?.code || "HYD"}</div>
            <div><strong>Area:</strong> ${target.areaCode || target.areaName} (Seq: ${target.areaSeq || "—"})</div>
            <div><strong>Field Executive:</strong> ${target.fieldExecutiveName || "—"}</div>
            <div><strong>Vehicle No:</strong> ${target.vehicleNo || "—"} (${target.vehicleType || "Bike"})</div>
            <div><strong>Run No:</strong> ${target.runNo || "—"}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 30px;">#</th>
                <th>AWB No</th>
                <th>Book Date</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Consignee</th>
                <th>Pcs</th>
                <th>Weight</th>
                <th>Sign / Proof</th>
              </tr>
            </thead>
            <tbody>
              ${lines
                .map(
                  (l, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${l.awbNo}</strong></td>
                  <td>${l.bookDate}</td>
                  <td>${l.origin}</td>
                  <td>${l.destination}</td>
                  <td>${l.consignee || "—"}</td>
                  <td>${l.pcs}</td>
                  <td>${l.weight}</td>
                  <td style="width: 120px;"></td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
          <div class="totals">
            <div>Total Shipments: ${lines.length}</div>
            <div>Total Pieces: ${lines.reduce((s, l) => s + (Number(l.pcs) || 0), 0)}</div>
            <div>Total Weight: ${lines.reduce((s, l) => s + (Number(l.weight) || 0), 0).toFixed(3)} kg</div>
          </div>
          <div class="signatures">
            <div class="sig-line">Field Executive Signature</div>
            <div class="sig-line">Supervisor Signature</div>
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

  // Excel Merging
  const handleExcelMerging = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      setBulkUploadOpen(true);
    }
  };

  if (view === "entry") {
    const isEditing = editing !== null;
    const displayDrsDate = isEditing ? entryForm.drsDate : todayIso();
    const displayDrsTime = isEditing ? entryForm.drsTime : nowDrsTime();
    const status = formStatus ?? "DRAFT";

    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "DRS Scan"]} />

        <Card className="min-w-0 overflow-hidden border p-0">
          <div className="space-y-4 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={drsStatusBadgeVariant(status)}>{status}</Badge>
                {!authed ? (
                  <span className="text-xs text-muted-foreground">Demo mode</span>
                ) : null}
                {(status === "DISPATCHED" || status === "COMPLETED") && (
                  <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
                    <span className="text-muted-foreground">Total: {deliveryCounters.total}</span>
                    <span className="text-amber-700 dark:text-amber-400">
                      Pending: {deliveryCounters.pending}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Delivered: {deliveryCounters.delivered}
                    </span>
                    <span className="text-destructive">
                      Undelivered: {deliveryCounters.undelivered}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openCostEntry}
                  className="h-8 gap-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Cost Entry
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUploadCopyOpen(true)}
                  className="h-8 gap-1 border-sky-600 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrintRunSheet()}
                  className="h-8 gap-1 border-amber-600 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Run Sheet
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExcelMerging}
                  className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Excel Merging
                </Button>
              </div>
            </div>

            {/* Header Form: 3 rows of rich metadata */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Service Center">
                <DualLookupInput
                  lookup="serviceCentre"
                  value={entryForm.serviceCentre}
                  disabled={isReadOnly}
                  onChange={(serviceCentre) => patchEntry({ serviceCentre })}
                />
              </FieldWrapper>
              <FieldWrapper label="DRS No.">
                <Input value={entryForm.drsNo} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="DRS Date">
                <Input
                  type="date"
                  value={entryForm.drsDate}
                  disabled={isReadOnly}
                  onChange={(e) => patchEntry({ drsDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="DRS Time">
                <Input
                  value={entryForm.drsTime}
                  disabled={isReadOnly}
                  placeholder="HHmm"
                  onChange={(e) => patchEntry({ drsTime: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                />
              </FieldWrapper>

              <FieldWrapper label="Field Executive" required>
                <DualLookupInput
                  lookup="fieldExecutive"
                  value={entryForm.fieldExecutive}
                  disabled={isReadOnly}
                  onChange={(fieldExecutive) => patchEntry({ fieldExecutive })}
                />
              </FieldWrapper>

              <FieldWrapper label="Area" required>
                <AreaLookupInput
                  value={entryForm.area}
                  areaSeq={entryForm.areaSeq}
                  disabled={isReadOnly}
                  onChange={(area) => patchEntry({ area })}
                  onAreaSeqChange={(areaSeq) => patchEntry({ areaSeq })}
                />
              </FieldWrapper>

              <FieldWrapper label="Vehicle No">
                <Input
                  value={entryForm.vehicleNo}
                  disabled={isReadOnly}
                  placeholder="e.g. TS09AB1234"
                  onChange={(e) => patchEntry({ vehicleNo: e.target.value })}
                />
              </FieldWrapper>

              <FieldWrapper label="Vehicle Type">
                <Select
                  value={entryForm.vehicleType}
                  disabled={isReadOnly}
                  onValueChange={(v) => patchEntry({ vehicleType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>

              <FieldWrapper label="From KM / To KM">
                <div className="flex gap-2">
                  <Input
                    value={entryForm.fromKm}
                    disabled={isReadOnly}
                    placeholder="From KM"
                    onChange={(e) => patchEntry({ fromKm: e.target.value })}
                  />
                  <Input
                    value={entryForm.toKm}
                    disabled={isReadOnly}
                    placeholder="To KM"
                    onChange={(e) => patchEntry({ toKm: e.target.value })}
                  />
                </div>
              </FieldWrapper>

              <FieldWrapper label="Vehicle Owner & Contact">
                <div className="flex gap-2">
                  <Input
                    value={entryForm.vehicleOwner.name}
                    disabled={isReadOnly}
                    placeholder="Owner"
                    onChange={(e) => patchEntry({ vehicleOwner: { ...entryForm.vehicleOwner, name: e.target.value } })}
                  />
                  <Input
                    value={entryForm.vehicleOwnerContact}
                    disabled={isReadOnly}
                    placeholder="Contact"
                    onChange={(e) => patchEntry({ vehicleOwnerContact: e.target.value })}
                  />
                </div>
              </FieldWrapper>

              <FieldWrapper label="Driver & Contact">
                <div className="flex gap-2">
                  <Input
                    value={entryForm.driver.name}
                    disabled={isReadOnly}
                    placeholder="Driver"
                    onChange={(e) => patchEntry({ driver: { ...entryForm.driver, name: e.target.value } })}
                  />
                  <Input
                    value={entryForm.driverContact}
                    disabled={isReadOnly}
                    placeholder="Contact"
                    onChange={(e) => patchEntry({ driverContact: e.target.value })}
                  />
                </div>
              </FieldWrapper>

              <FieldWrapper label="Run No.">
                <Input
                  value={entryForm.runNo}
                  disabled={isReadOnly}
                  placeholder="Run No."
                  onChange={(e) => patchEntry({ runNo: e.target.value })}
                />
              </FieldWrapper>

              <FieldWrapper label="Remark" className="xl:col-span-4">
                <Input
                  value={entryForm.remark}
                  disabled={isReadOnly}
                  placeholder="Delivery Run Sheet instructions or notes..."
                  onChange={(e) => patchEntry({ remark: e.target.value })}
                />
              </FieldWrapper>
            </div>

            {/* Scan Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Select value={scanBy} onValueChange={(v) => setScanBy(v as "awb" | "ref")}>
                  <SelectTrigger className="w-36 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="awb">AWB No</SelectItem>
                    <SelectItem value="ref">Reference No</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  value={awbDraft}
                  disabled={isReadOnly}
                  onChange={(e) => setAwbDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addAwbLine();
                    }
                  }}
                  placeholder={`Scan or type ${scanBy === "ref" ? "Reference No" : "AWB No"}...`}
                  className="h-9 w-64 bg-background"
                />

                <Button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => void addAwbLine()}
                  className="h-9 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPreDrsOpen(true)}
                  className="h-9 gap-1"
                >
                  <CheckSquare className="h-4 w-4 text-sky-600" />
                  Pre-DRS List
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBulkUploadOpen(true)}
                  className="h-9 gap-1"
                >
                  <Upload className="h-4 w-4 text-emerald-600" />
                  Bulk Excel
                </Button>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {!isReadOnly ? (
                  <Button
                    disabled={saving}
                    onClick={() => void persistEntry()}
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                  >
                    {saving ? "Saving…" : "Save DRS"}
                  </Button>
                ) : null}
                {isEditing && canDispatchDrs(status, entryForm.awbLines.length) ? (
                  <Button
                    disabled={saving}
                    onClick={() => void handleDispatch()}
                    className="bg-sky-600 text-white hover:bg-sky-600/90"
                  >
                    Dispatch
                  </Button>
                ) : null}
                {isEditing && canCancelDrs(status) ? (
                  <Button
                    disabled={saving}
                    variant="outline"
                    className="border-amber-600 text-amber-700"
                    onClick={() => void handleCancelDrs()}
                  >
                    Cancel DRS
                  </Button>
                ) : null}
                {isEditing && canCompleteDrs(status, deliveryCounters.pending) ? (
                  <Button
                    disabled={saving}
                    onClick={() => void handleCompleteDrs()}
                    className="bg-violet-700 text-white hover:bg-violet-700/90"
                  >
                    Complete DRS
                  </Button>
                ) : null}
                {isEditing && canReopenDrs(status) ? (
                  <Button
                    disabled={saving}
                    variant="outline"
                    onClick={() => void handleReopenDrs()}
                  >
                    Reopen DRS
                  </Button>
                ) : null}
                <Button variant="destructive" onClick={closeEntry}>
                  Close
                </Button>
              </div>
            </div>

            <p className="text-sm font-medium text-destructive">
              Total AWB Count : {entryForm.awbLines.length}
            </p>

            {/* Scan Grid */}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[1200px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">AWB No</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Book Date</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Origin</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Customer</TableHead>
                    {formSetupSettings.allowConsigneeName ? (
                      <TableHead className="whitespace-nowrap text-sidebar-foreground">Consignee</TableHead>
                    ) : null}
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Pcs</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Weight</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">E-Way Bill No</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Shipment Value</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Status</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entryForm.awbLines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={formSetupSettings.allowConsigneeName ? 12 : 11}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No shipments on this Delivery Run Sheet yet. Scan AWBs or click Pre-DRS List.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entryForm.awbLines.map((line) => {
                      const terminal =
                        line.outcome === "DELIVERED" ||
                        line.outcome === "UNDELIVERED" ||
                        line.shipmentStatus === "DELIVERED_PENDING_POD" ||
                        line.shipmentStatus === "UNDELIVERED" ||
                        line.shipmentStatus === "DELIVERED";
                      const canAttempt =
                        canRecordDeliveryAttempt(status) &&
                        !terminal &&
                        (line.shipmentStatus === "OUT_FOR_DELIVERY" ||
                          line.shipmentStatus === "DELIVERY_ATTEMPTED" ||
                          !line.shipmentStatus);
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono font-medium">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAwbDetail(line);
                                setAwbDetailOpen(true);
                              }}
                              className="text-sky-600 hover:underline"
                            >
                              {line.awbNo}
                            </button>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{line.bookDate}</TableCell>
                          <TableCell>{line.origin}</TableCell>
                          <TableCell>{line.destination}</TableCell>
                          <TableCell className="max-w-[10rem] truncate" title={line.customer}>
                            {line.customer}
                          </TableCell>
                          {formSetupSettings.allowConsigneeName ? (
                            <TableCell className="max-w-[10rem] truncate" title={line.consignee}>
                              {line.consignee}
                            </TableCell>
                          ) : null}
                          <TableCell>{line.pcs}</TableCell>
                          <TableCell className="whitespace-nowrap">{line.weight}</TableCell>
                          <TableCell>{line.ewayBillNo || ""}</TableCell>
                          <TableCell className="whitespace-nowrap">{line.shipmentValue}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {shipmentStatusLabel(
                              line.shipmentStatus ||
                                (line.outcome === "DELIVERED"
                                  ? "DELIVERED_PENDING_POD"
                                  : line.outcome === "UNDELIVERED"
                                    ? "UNDELIVERED"
                                    : null),
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-wrap justify-center gap-0.5">
                              {canAttempt ? (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={saving}
                                    className="h-7 px-1.5 text-xs text-emerald-700"
                                    onClick={() =>
                                      void handleDeliveryOutcome(line, "DELIVERED_PENDING_POD")
                                    }
                                  >
                                    Delivered
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={saving}
                                    className="h-7 px-1.5 text-xs text-destructive"
                                    onClick={() => void handleDeliveryOutcome(line, "UNDELIVERED")}
                                  >
                                    Undelivered
                                  </Button>
                                  {line.shipmentStatus !== "DELIVERY_ATTEMPTED" ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      disabled={saving}
                                      className="h-7 px-1.5 text-xs text-amber-700"
                                      onClick={() =>
                                        void handleDeliveryOutcome(line, "DELIVERY_ATTEMPTED")
                                      }
                                    >
                                      Attempt
                                    </Button>
                                  ) : null}
                                </>
                              ) : null}
                              <IconButton
                                label="View Detail"
                                variant="ghost"
                                size="row"
                                className="text-sky-600"
                                onClick={() => {
                                  setSelectedAwbDetail(line);
                                  setAwbDetailOpen(true);
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </IconButton>
                              {!isReadOnly ? (
                                <IconButton
                                  label="Remove AWB"
                                  variant="ghost"
                                  size="row"
                                  className="text-destructive"
                                  onClick={() => removeAwbLine(line.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconButton>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </table>
            </div>
          </div>
        </Card>

        {/* Hidden File Input for Excel Merging */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleBulkUploadFile}
        />

        {/* Dialog 1: Cost Entry */}
        <Dialog open={costEntryOpen} onOpenChange={setCostEntryOpen}>
          <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
            <div className="bg-sidebar px-4 py-3">
              <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                DRS Cost Entry
              </DialogTitle>
            </div>
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <FieldWrapper label="DRS No">
                <Input value={entryForm.drsNo} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="Field Executive">
                <Input value={entryForm.fieldExecutive.name || entryForm.fieldExecutive.code} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="Vehicle No">
                <Input
                  value={entryForm.vehicleNo}
                  onChange={(e) => patchEntry({ vehicleNo: e.target.value })}
                  placeholder="Vehicle No"
                />
              </FieldWrapper>
              <FieldWrapper label="HR Cost (₹)">
                <Input
                  type="number"
                  value={costDraft.hrCost || ""}
                  onChange={(e) => setCostDraft((c) => ({ ...c, hrCost: Number(e.target.value) || 0 }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Vehicle Cost (₹)">
                <Input
                  type="number"
                  value={costDraft.vehicleCost || ""}
                  onChange={(e) => setCostDraft((c) => ({ ...c, vehicleCost: Number(e.target.value) || 0 }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Other Cost (₹)">
                <Input
                  type="number"
                  value={costDraft.otherCost || ""}
                  onChange={(e) => setCostDraft((c) => ({ ...c, otherCost: Number(e.target.value) || 0 }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Total DRS Cost (₹)">
                <Input
                  value={((costDraft.hrCost || 0) + (costDraft.vehicleCost || 0) + (costDraft.otherCost || 0)).toFixed(2)}
                  disabled
                  readOnly
                  className="font-bold text-emerald-600"
                />
              </FieldWrapper>
              <FieldWrapper label="Voucher No">
                <Input
                  value={costDraft.voucherNo}
                  onChange={(e) => setCostDraft((c) => ({ ...c, voucherNo: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Voucher Amount (₹)">
                <Input
                  type="number"
                  value={costDraft.voucherAmount || ""}
                  onChange={(e) => setCostDraft((c) => ({ ...c, voucherAmount: Number(e.target.value) || 0 }))}
                />
              </FieldWrapper>
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button onClick={handleCostSubmit} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                Submit Cost
              </Button>
              <Button variant="outline" onClick={() => setCostEntryOpen(false)}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog 2: Bulk Upload Dialog */}
        <Dialog open={bulkUploadOpen} onOpenChange={setBulkUploadOpen}>
          <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
            <div className="bg-sidebar px-4 py-3">
              <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                Bulk Upload DRS Shipments
              </DialogTitle>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                Upload an Excel or CSV file containing AWB numbers to add them in batch.
              </p>
              <Button variant="outline" size="sm" onClick={downloadBulkTemplate} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Download Excel Template
              </Button>
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center">
                <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                <label className="cursor-pointer font-medium text-sky-600 hover:underline">
                  <span>Browse Excel/CSV File</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleBulkUploadFile}
                    disabled={bulkUploading}
                  />
                </label>
                {bulkUploading && <p className="mt-2 text-xs text-muted-foreground">Validating and adding AWBs...</p>}
              </div>

              {bulkSummary && (
                <div className="space-y-2 rounded-md border p-3 text-xs">
                  <div className="flex justify-between font-medium">
                    <span>Total Rows: {bulkSummary.total}</span>
                    <span className="text-emerald-600">Added: {bulkSummary.accepted}</span>
                    <span className="text-destructive">Rejected: {bulkSummary.rejected.length}</span>
                  </div>
                  {bulkSummary.rejected.length > 0 && (
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {bulkSummary.rejected.map((r, i) => (
                        <div key={i} className="text-destructive">
                          <strong>{r.awb}</strong>: {r.reason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={() => setBulkUploadOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog 3: Pre-DRS List (Eligible Manifest In-scanned shipments) */}
        <Dialog open={preDrsOpen} onOpenChange={setPreDrsOpen}>
          <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
            <div className="bg-sidebar px-4 py-3">
              <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                Pre-DRS Eligible Shipments (MANIFEST_INSCANNED)
              </DialogTitle>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-4">
              {preDrsQuery.isLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading eligible shipments...</p>
              ) : (preDrsQuery.data ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No unassigned MANIFEST_INSCANNED shipments found.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="p-2 text-left">
                        <Checkbox
                          checked={
                            (preDrsQuery.data ?? []).length > 0 &&
                            preDrsSelected.size === (preDrsQuery.data ?? []).length
                          }
                          onCheckedChange={(c) => {
                            if (c === true) {
                              setPreDrsSelected(new Set((preDrsQuery.data ?? []).map((s) => s.shipment_id)));
                            } else {
                              setPreDrsSelected(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="p-2 text-left">AWB No</th>
                      <th className="p-2 text-left">Book Date</th>
                      <th className="p-2 text-left">Customer</th>
                      <th className="p-2 text-left">Consignee</th>
                      <th className="p-2 text-left">Pcs</th>
                      <th className="p-2 text-left">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preDrsQuery.data ?? []).map((s) => (
                      <tr key={s.shipment_id} className="border-b hover:bg-muted/40">
                        <td className="p-2">
                          <Checkbox
                            checked={preDrsSelected.has(s.shipment_id)}
                            onCheckedChange={(c) => {
                              const next = new Set(preDrsSelected);
                              if (c === true) next.add(s.shipment_id);
                              else next.delete(s.shipment_id);
                              setPreDrsSelected(next);
                            }}
                          />
                        </td>
                        <td className="p-2 font-mono font-medium">{s.awb_no}</td>
                        <td className="p-2">{s.book_date ? formatDisplayDate(s.book_date) : "—"}</td>
                        <td className="p-2 max-w-[8rem] truncate">{s.customer_name}</td>
                        <td className="p-2 max-w-[8rem] truncate">{s.consignee_name}</td>
                        <td className="p-2">{s.pieces}</td>
                        <td className="p-2">{s.charge_weight.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-between border-t px-6 py-4">
              <span className="text-xs text-muted-foreground self-center">
                Selected: {preDrsSelected.size} shipments
              </span>
              <div className="flex gap-2">
                <Button
                  onClick={handlePreDrsAdd}
                  disabled={preDrsSelected.size === 0}
                  className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                >
                  Add Selected to DRS
                </Button>
                <Button variant="outline" onClick={() => setPreDrsOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog 4: AWB Details Preview */}
        <Dialog open={awbDetailOpen} onOpenChange={setAwbDetailOpen}>
          <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
            <div className="bg-sidebar px-4 py-3">
              <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                AWB Detail — {selectedAwbDetail?.awbNo}
              </DialogTitle>
            </div>
            {selectedAwbDetail && (
              <div className="grid grid-cols-2 gap-4 p-6 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">Book Date</span>
                  <p className="font-medium">{selectedAwbDetail.bookDate || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Status</span>
                  <p className="font-medium">{selectedAwbDetail.shipmentStatus || "MANIFEST_INSCANNED"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Origin</span>
                  <p className="font-medium">{selectedAwbDetail.origin || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Destination</span>
                  <p className="font-medium">{selectedAwbDetail.destination || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Customer</span>
                  <p className="font-medium">{selectedAwbDetail.customer || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Consignee</span>
                  <p className="font-medium">{selectedAwbDetail.consignee || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Pieces / Weight</span>
                  <p className="font-medium">
                    {selectedAwbDetail.pcs} pcs / {selectedAwbDetail.weight} kg
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Declared Value</span>
                  <p className="font-medium">₹{selectedAwbDetail.shipmentValue || "0.00"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">E-Way Bill No</span>
                  <p className="font-medium">{selectedAwbDetail.ewayBillNo || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Delivery Attempts</span>
                  <p className="font-medium">{selectedAwbDetail.attemptCount || 0}</p>
                </div>
              </div>
            )}
            <div className="flex justify-end border-t px-6 py-4">
              <Button variant="outline" onClick={() => setAwbDetailOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog 5: Upload DRS Copy */}
        <Dialog open={uploadCopyOpen} onOpenChange={setUploadCopyOpen}>
          <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
            <div className="bg-sidebar px-4 py-3">
              <DialogTitle className="text-base font-semibold text-sidebar-foreground">
                Upload Signed DRS Copy
              </DialogTitle>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center">
                <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
                <label className="cursor-pointer font-medium text-sky-600 hover:underline">
                  <span>Choose signed PDF / image</span>
                  <input
                    ref={copyFileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const att: DrsAttachment = {
                        id: crypto.randomUUID(),
                        fileName: file.name,
                        fileSize: file.size,
                        uploadedAt: new Date().toISOString(),
                      };
                      patchEntry({ attachments: [...(entryForm.attachments || []), att] });
                      toast.success(`Attached ${file.name}`);
                    }}
                  />
                </label>
              </div>

              {(entryForm.attachments || []).length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Attached Files:</span>
                  {(entryForm.attachments || []).map((att) => (
                    <div key={att.id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1 text-xs">
                      <span className="truncate">{att.fileName}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() =>
                          patchEntry({
                            attachments: (entryForm.attachments || []).filter((a) => a.id !== att.id),
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button onClick={() => setUploadCopyOpen(false)} className="bg-sidebar text-sidebar-foreground">
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "DRS Scan"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">DRS Scan</h1>
        <p className="text-sm text-muted-foreground">
          Create delivery run sheets and scan AWBs for field executives.
          {authed ? " Connected to live backend." : " Demo mode — sign in for live DRS."}
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <DataIoToolbar
              export={{
                filename: "drs-scan",
                title: "DRS Scan",
                columns: [
                  { key: "drsNo", header: "DRS No" },
                  { key: "date", header: "Date" },
                  { key: "area", header: "Area" },
                  { key: "serviceCenter", header: "Service Center" },
                  { key: "fieldExecutive", header: "Field Executive" },
                  { key: "status", header: "Status" },
                ],
                getRows: () =>
                  rows.map((r) => {
                    const d = rowDisplay(r);
                    return {
                      drsNo: d.drsNo,
                      date: d.date,
                      area: d.area,
                      serviceCenter: d.serviceCenter,
                      fieldExecutive: d.fieldExecutive,
                      status: r.status ?? "",
                    };
                  }),
              }}
            />
            <IconButton label="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <IconButton label="Clear filters" onClick={clearColFilters}>
              <Filter className="h-4 w-4" />
            </IconButton>
            <IconButton label="Form Setup" onClick={openFormSetup}>
              <Settings className="h-4 w-4" />
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
          <table className="w-full min-w-[900px] caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="whitespace-nowrap text-sidebar-foreground">DRS No.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Date</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Area</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Service Center
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Field Executive
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Status</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">
                  Action
                </TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["drsNo", "DRS No."],
                    ["date", "Date"],
                    ["area", "Area"],
                    ["serviceCenter", "Service Center"],
                    ["fieldExecutive", "Field Executive"],
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
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => {
                  const d = rowDisplay(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[12rem] truncate font-medium">
                        <button
                          type="button"
                          onClick={() => void openEntry(row)}
                          className="text-sky-600 hover:underline font-medium"
                        >
                          {d.drsNo}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{d.date}</TableCell>
                      <TableCell>{d.area}</TableCell>
                      <TableCell>{d.serviceCenter}</TableCell>
                      <TableCell>{d.fieldExecutive}</TableCell>
                      <TableCell>
                        <Badge variant={drsStatusBadgeVariant(row.status)}>
                          {row.status ?? "DRAFT"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-1 text-center">
                        <div className="flex justify-center gap-0">
                          <IconButton
                            label="Edit"
                            variant="ghost"
                            size="row"
                            className="text-sky-600"
                            onClick={() => void openEntry(row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Cancel"
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
                            className="text-amber-600"
                            onClick={() => handlePrintRunSheet(row)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Excel"
                            variant="ghost"
                            size="row"
                            className="text-emerald-600"
                            onClick={() => {
                              downloadCsv(`${row.drsNo.replace(/\//g, "-")}.csv`, ["DRS No", "Date", "Area", "Service Center", "Field Executive"], [[d.drsNo, d.date, d.area, d.serviceCenter, d.fieldExecutive]]);
                              toast.success("Exported DRS CSV");
                            }}
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          </IconButton>
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

      <Dialog open={formSetupOpen} onOpenChange={(o) => !o && closeFormSetup()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Form Setup
            </DialogTitle>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="allowConsigneeName"
                checked={formSetupDraft.allowConsigneeName}
                onCheckedChange={(c) =>
                  setFormSetupDraft((s) => ({ ...s, allowConsigneeName: c === true }))
                }
              />
              <label htmlFor="allowConsigneeName" className="text-sm text-foreground">
                Allow Consignee Name in DRS
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button
              onClick={handleFormSetupSave}
              className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            >
              Save
            </Button>
            <Button variant="destructive" onClick={closeFormSetup}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel DRS?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel {deleteTarget?.drsNo} and unassign its shipments (DRAFT only).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel DRS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DualLookupInput({
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
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-20"
          placeholder="Code"
        />
        <Button
          size="icon"
          variant="outline"
          disabled={disabled}
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label={`Search ${lookup}`}
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

function AreaLookupInput({
  value,
  areaSeq,
  onChange,
  onAreaSeqChange,
  disabled,
}: {
  value: LookupPair;
  areaSeq: string;
  onChange: (v: LookupPair) => void;
  onAreaSeqChange: (seq: string) => void;
  disabled?: boolean;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name || value.code}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, name: e.target.value, code: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Area"
        />
        <Input
          value={areaSeq}
          disabled={disabled}
          onChange={(e) => onAreaSeqChange(e.target.value)}
          className="w-16"
          placeholder="Seq"
        />
        <Button
          size="icon"
          variant="outline"
          disabled={disabled}
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search area"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup="area"
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
