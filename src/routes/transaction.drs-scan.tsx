import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  RefreshCw,
  Filter,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Printer,
  FileSpreadsheet,
  Search,
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
} from "@/lib/transactions/drsUiMap";

type DrsRow = {
  id: string;
  rowVersion?: number;
  status?: string;
  drsNo: string;
  drsDate: string;
  drsTime: string;
  areaCode: string;
  areaName: string;
  areaSeq: string;
  serviceCenter: string;
  fieldExecutiveCode: string;
  fieldExecutiveName: string;
  fieldExecutiveId?: string;
  remark: string;
  vehicleNo?: string;
  awbLines: DrsAwbLine[];
};

type DrsEntryForm = {
  drsNo: string;
  drsDate: string;
  drsTime: string;
  area: LookupPair;
  areaSeq: string;
  fieldExecutive: LookupPair;
  remark: string;
  vehicleNo: string;
  awbLines: DrsAwbLine[];
};

type ColFilterKey = "drsNo" | "date" | "area" | "serviceCenter" | "fieldExecutive";

type FormSetupSettings = {
  allowConsigneeName: boolean;
};

type PageView = "list" | "entry";

const SEED_AWB_TESTDEL: Omit<DrsAwbLine, "id"> = {
  awbNo: "TESTDEL",
  bookDate: "11/08/2025",
  origin: "HYD",
  destination: "TW",
  customer: "JUST EXPRESS WORLDWIDE",
  consignee: "NEW-IN CO LTD",
  pcs: "1",
  weight: "0.100",
  ewayBillNo: "",
  shipmentValue: "5",
};

const SEED_AWB_LINES: Omit<DrsAwbLine, "id">[] = [
  SEED_AWB_TESTDEL,
  {
    awbNo: "30404019",
    bookDate: "04/07/2026",
    origin: "HYD",
    destination: "US",
    customer: "RASHMIKA ENT",
    consignee: "MIDHUN NARNE",
    pcs: "1",
    weight: "20.000",
    ewayBillNo: "",
    shipmentValue: "7185.00",
  },
  {
    awbNo: "30404020",
    bookDate: "04/07/2026",
    origin: "HYD",
    destination: "BOM",
    customer: "TECH SOLUTIONS",
    consignee: "JOHN SMITH",
    pcs: "2",
    weight: "15.500",
    ewayBillNo: "EWB123456",
    shipmentValue: "5420.00",
  },
];

const SEED_ROWS: Omit<DrsRow, "id">[] = [
  {
    drsNo: "HYD/HYD/2025/2",
    drsDate: "2025-08-11",
    drsTime: "1758",
    areaCode: "HYD",
    areaName: "HYD",
    areaSeq: "1",
    serviceCenter: "HYD",
    fieldExecutiveCode: "CHANDU",
    fieldExecutiveName: "CHANDU",
    remark: "",
    vehicleNo: "",
    status: "DRAFT",
    awbLines: [{ id: crypto.randomUUID(), ...SEED_AWB_TESTDEL }],
  },
  {
    drsNo: "HYD/HYD/2025/1",
    drsDate: "2025-01-20",
    drsTime: "1015",
    areaCode: "HYD",
    areaName: "HYD",
    areaSeq: "1",
    serviceCenter: "HYD",
    fieldExecutiveCode: "CHANDU",
    fieldExecutiveName: "CHANDU",
    remark: "",
    vehicleNo: "",
    status: "DISPATCHED",
    awbLines: [
      {
        id: crypto.randomUUID(),
        awbNo: "30403918",
        bookDate: "20/01/2025",
        origin: "HYD",
        destination: "DEL",
        customer: "COURIERWALA",
        consignee: "DELHI TRADERS",
        pcs: "1",
        weight: "12.000",
        ewayBillNo: "",
        shipmentValue: "3200.00",
      },
    ],
  },
];

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
  area: emptyPair(),
  areaSeq: "",
  fieldExecutive: emptyPair(),
  remark: "",
  vehicleNo: "",
  awbLines: [],
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
  area: { code: row.areaCode, name: row.areaName },
  areaSeq: row.areaSeq,
  fieldExecutive: {
    id: row.fieldExecutiveId,
    code: row.fieldExecutiveCode,
    name: row.fieldExecutiveName,
  },
  remark: row.remark,
  vehicleNo: row.vehicleNo ?? "",
  awbLines: row.awbLines.map((line) => ({ ...line })),
});

const entryFormToRow = (
  form: DrsEntryForm,
  editing: DrsRow | null,
  allRows: DrsRow[],
): Omit<DrsRow, "id"> => ({
  drsNo: editing?.drsNo ?? nextDrsNo(allRows),
  drsDate: form.drsDate,
  drsTime: form.drsTime.trim(),
  areaCode: form.area.code.trim() || form.area.name.trim(),
  areaName: form.area.name.trim() || form.area.code.trim(),
  areaSeq: form.areaSeq.trim(),
  serviceCenter: form.area.code.trim() || editing?.serviceCenter || "HYD",
  fieldExecutiveCode: form.fieldExecutive.code.trim() || form.fieldExecutive.name.trim(),
  fieldExecutiveName: form.fieldExecutive.name.trim() || form.fieldExecutive.code.trim(),
  fieldExecutiveId: form.fieldExecutive.id,
  remark: form.remark.trim(),
  vehicleNo: form.vehicleNo.trim(),
  status: editing?.status ?? "DRAFT",
  rowVersion: editing?.rowVersion,
  awbLines: form.awbLines,
});

const lookupAwb = (awbNo: string, drsDate?: string): Omit<DrsAwbLine, "id"> => {
  if (awbNo.toUpperCase() === "TESTDEL") return { ...SEED_AWB_TESTDEL };
  const seed = SEED_AWB_LINES.find((line) => line.awbNo === awbNo);
  if (seed) return { ...seed };
  return {
    awbNo,
    bookDate: drsDate ? formatDisplayDate(drsDate) : formatDisplayDate(todayIso()),
    origin: "HYD",
    destination: "US",
    customer: "SAMPLE CUSTOMER",
    consignee: "SAMPLE CONSIGNEE",
    pcs: "1",
    weight: "10.000",
    ewayBillNo: "",
    shipmentValue: "1000.00",
  };
};

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
  const { isAuthenticated: authed } = useAuth();
  const queryClient = useQueryClient();
  const [demoRows, setDemoRows] = useState<DrsRow[]>(() =>
    SEED_ROWS.map((row) => ({ id: crypto.randomUUID(), ...row })),
  );
  const [view, setView] = useState<PageView>("list");
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DrsRow | null>(null);
  const [entryForm, setEntryForm] = useState<DrsEntryForm>(emptyEntryForm);
  const [awbDraft, setAwbDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DrsRow | null>(null);
  const [formSetupOpen, setFormSetupOpen] = useState(false);
  const [formSetupSettings, setFormSetupSettings] = useState<FormSetupSettings>(defaultFormSetup);
  const [formSetupDraft, setFormSetupDraft] = useState<FormSetupSettings>(defaultFormSetup);
  const [saving, setSaving] = useState(false);

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
          areaCode: mapped.area.code,
          areaName: mapped.area.name,
          areaSeq: mapped.areaSeq,
          serviceCenter: mapped.serviceCenter,
          fieldExecutiveCode: mapped.fieldExecutive.code,
          fieldExecutiveName: mapped.fieldExecutive.name,
          fieldExecutiveId: mapped.fieldExecutive.id,
          remark: mapped.remark,
          vehicleNo: mapped.vehicleNo,
          awbLines: mapped.awbLines,
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
    setEntryForm({ ...emptyEntryForm(), drsDate: todayIso(), drsTime: nowDrsTime() });
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
          areaCode: mapped.area.code,
          areaName: mapped.area.name,
          areaSeq: mapped.areaSeq,
          serviceCenter: mapped.serviceCenter,
          fieldExecutiveCode: mapped.fieldExecutive.code,
          fieldExecutiveName: mapped.fieldExecutive.name,
          fieldExecutiveId: mapped.fieldExecutive.id,
          remark: mapped.remark,
          vehicleNo: mapped.vehicleNo,
          awbLines: mapped.awbLines,
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
        const { fields, lines } = uiFormToDrsPayload({
          ...formForSave,
          vehicleNo: formForSave.vehicleNo,
        });
        const saved = await saveDrs({
          id: editing?.id ?? null,
          rowVersion: editing?.rowVersion ?? null,
          fields,
          lines,
        });
        toast.success(editing ? "DRS saved" : "DRS created");
        await refreshLive();
        closeEntry();
        void saved;
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
        // persist latest lines first
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
    if (editing) {
      setEditing((prev) =>
        prev
          ? {
              ...prev,
              awbLines: prev.awbLines.map((line) =>
                line.id === lineId
                  ? {
                      ...line,
                      shipmentStatus,
                      outcome: lineOutcome,
                      attemptCount: (line.attemptCount ?? 0) + 1,
                    }
                  : line,
              ),
            }
          : prev,
      );
    }
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
        const refreshed = (await listDrs({ pageSize: 500 })).rows.find((r) => r.id === editing.id);
        if (refreshed) {
          setEditing((prev) =>
            prev ? { ...prev, rowVersion: refreshed.row_version, status: refreshed.status } : prev,
          );
        }
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
        if (row)
          await openEntry({
            id: row.id,
            rowVersion: row.row_version,
            status: row.status,
            drsNo: row.drs_no,
            drsDate: row.drs_date,
            drsTime: "",
            areaCode: row.area_code ?? "",
            areaName: row.area_name ?? "",
            areaSeq: row.area_seq ?? "",
            serviceCenter: row.branches?.code ?? "",
            fieldExecutiveCode: row.field_executives?.code ?? "",
            fieldExecutiveName: row.field_executives?.name ?? "",
            fieldExecutiveId: row.delivery_executive_id ?? undefined,
            remark: row.remarks ?? "",
            vehicleNo: row.vehicle_no ?? "",
            awbLines: [],
          });
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

  const handleExport = () => {
    downloadCsv(
      "drs-scan.csv",
      ["DRS No", "Date", "Area", "Service Center", "Field Executive", "Status"],
      rows.map((r) => {
        const d = rowDisplay(r);
        return [d.drsNo, d.date, d.area, d.serviceCenter, d.fieldExecutive, r.status ?? ""];
      }),
    );
    toast.success("Exported drs-scan.csv");
  };

  const exportDrsRowExcel = (row: DrsRow) => {
    const d = rowDisplay(row);
    const safeName = row.drsNo.replace(/\//g, "-");
    const awbHeaders = [
      "AWB No",
      "Book Date",
      "Origin",
      "Destination",
      "Customer",
      "Consignee",
      "Pcs",
      "Weight",
      "E-Way Bill No",
      "Shipment Value",
    ];

    if (row.awbLines.length > 0) {
      downloadCsv(
        `${safeName}.csv`,
        awbHeaders,
        row.awbLines.map((line) => [
          line.awbNo,
          line.bookDate,
          line.origin,
          line.destination,
          line.customer,
          line.consignee,
          line.pcs,
          line.weight,
          line.ewayBillNo,
          line.shipmentValue,
        ]),
      );
    } else {
      downloadCsv(
        `${safeName}.csv`,
        ["DRS No", "Date", "Area", "Service Center", "Field Executive", "DRS Time", "Remark"],
        [[d.drsNo, d.date, d.area, d.serviceCenter, d.fieldExecutive, row.drsTime, row.remark]],
      );
    }
    toast.success(`Exported ${safeName}.csv`);
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

  const patchEntry = (patch: Partial<DrsEntryForm>) => setEntryForm((f) => ({ ...f, ...patch }));

  const addAwbLine = async () => {
    if (isReadOnly) return toast.error("DRS is not editable");
    if (!entryForm.area.code.trim() && !entryForm.area.name.trim()) {
      return toast.error("Area is required");
    }
    const awb = awbDraft.trim();
    if (!awb) return toast.error("AWB No is required");
    if (entryForm.awbLines.some((line) => line.awbNo === awb)) {
      return toast.error("AWB already added");
    }

    if (authed) {
      try {
        const ship = await lookupShipmentForDrs(awb);
        if (!ship) return toast.error("Shipment not found");
        if (ship.current_status === "CANCELLED" || ship.current_status === "VOID") {
          return toast.error("Cancelled shipments cannot be assigned");
        }
        if (ship.current_status !== "MANIFEST_INSCANNED") {
          return toast.error(`Shipment must be MANIFEST_INSCANNED (is ${ship.current_status})`);
        }
        const line: DrsAwbLine = {
          id: crypto.randomUUID(),
          shipmentId: ship.shipment_id,
          awbNo: ship.awb_no,
          bookDate: ship.book_date ? formatDisplayDate(ship.book_date) : "",
          origin: "",
          destination: "",
          customer: "",
          consignee: ship.consignee_name ?? "",
          pcs: String(ship.pieces),
          weight: String(ship.charge_weight),
          ewayBillNo: "",
          shipmentValue: "",
        };
        patchEntry({ awbLines: [...entryForm.awbLines, line] });
        setAwbDraft("");
        toast.success(`AWB ${awb} added`);
      } catch (err) {
        toast.error(toErrorMessage(err));
      }
      return;
    }

    const line: DrsAwbLine = {
      id: crypto.randomUUID(),
      ...lookupAwb(awb, editing ? entryForm.drsDate : todayIso()),
    };
    patchEntry({ awbLines: [...entryForm.awbLines, line] });
    setAwbDraft("");
    toast.success(`AWB ${awb} added`);
  };

  const removeAwbLine = (lineId: string) => {
    if (isReadOnly) return;
    patchEntry({ awbLines: entryForm.awbLines.filter((line) => line.id !== lineId) });
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
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={drsStatusBadgeVariant(status)}>{status}</Badge>
                  {!authed ? (
                    <span className="text-xs text-muted-foreground">Demo mode</span>
                  ) : null}
                  {(status === "DISPATCHED" || status === "COMPLETED") && (
                    <div className="ml-auto flex flex-wrap gap-3 text-xs sm:text-sm">
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FieldWrapper label="DRS No.">
                    <Input value={entryForm.drsNo} disabled readOnly />
                  </FieldWrapper>
                  <FieldWrapper label="DRS Date">
                    <Input value={formatDisplayDate(displayDrsDate)} disabled readOnly />
                  </FieldWrapper>
                  <FieldWrapper label="DRS Time">
                    <Input value={displayDrsTime} disabled readOnly placeholder="HHmm" />
                  </FieldWrapper>
                  <FieldWrapper label="Field Executive">
                    <NameCodeLookupInput
                      lookup="fieldExecutive"
                      value={entryForm.fieldExecutive}
                      onChange={(fieldExecutive) => patchEntry({ fieldExecutive })}
                      disabled={isReadOnly}
                    />
                  </FieldWrapper>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FieldWrapper label="Area" required>
                    <AreaLookupInput
                      value={entryForm.area}
                      areaSeq={entryForm.areaSeq}
                      onChange={(area) => patchEntry({ area })}
                      onAreaSeqChange={(areaSeq) => patchEntry({ areaSeq })}
                      disabled={isReadOnly}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Remark" className="md:col-span-1 xl:col-span-2">
                    <Input
                      value={entryForm.remark}
                      disabled={isReadOnly}
                      onChange={(e) => patchEntry({ remark: e.target.value })}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="AWB No.">
                    <div className="flex gap-1">
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
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => void addAwbLine()}
                        className="shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </FieldWrapper>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {!isReadOnly ? (
                  <Button
                    disabled={saving}
                    onClick={() => void persistEntry()}
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                  >
                    {saving ? "Saving…" : "Save"}
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
                {!isEditing ? (
                  <Button
                    onClick={() => toast.info("Excel merging will be enabled with backend wiring")}
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                  >
                    Excel Merging
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="border-sky-600 text-sky-600 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950"
                  onClick={() => toast.info("Print will be enabled with backend wiring")}
                >
                  Print
                </Button>
                <Button variant="destructive" onClick={closeEntry}>
                  Close
                </Button>
              </div>
            </div>

            <p className="text-sm font-medium text-destructive">
              Total AWB Count : {entryForm.awbLines.length}
            </p>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[1200px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      AWB No
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      Book Date
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      Origin
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      Destination
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      Customer
                    </TableHead>
                    {formSetupSettings.allowConsigneeName ? (
                      <TableHead className="whitespace-nowrap text-sidebar-foreground">
                        Consignee
                      </TableHead>
                    ) : null}
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Pcs</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      Weight
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      E-Way Bill No
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      Shipment Value
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">
                      Status
                    </TableHead>
                    <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entryForm.awbLines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={formSetupSettings.allowConsigneeName ? 12 : 11}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No data available in table
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
                          <TableCell>{line.awbNo}</TableCell>
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
            <IconButton label="Export" onClick={handleExport}>
              <Download className="h-4 w-4" />
            </IconButton>
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
                        {d.drsNo}
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
                            onClick={() =>
                              toast.info(`Print ${row.drsNo} will be enabled with backend wiring`)
                            }
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Excel"
                            variant="ghost"
                            size="row"
                            className="text-emerald-600"
                            onClick={() => exportDrsRowExcel(row)}
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

function NameCodeLookupInput({
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
          className="w-24"
          placeholder="Code"
        />
        <Button
          size="icon"
          variant="outline"
          disabled={disabled}
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
