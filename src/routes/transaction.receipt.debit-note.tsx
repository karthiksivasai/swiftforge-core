import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Upload,
  RefreshCw,
  Filter,
  FileText,
  ScrollText,
  Plus,
  Search,
  Pencil,
  Trash2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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

type LookupPair = { code: string; name: string };
type PageView = "list" | "entry" | "irn";
type RegisterType = "" | "B2B" | "B2C" | "SEZWP" | "SEZWOP";
type IrnStatus = "All" | "Approved" | "Pending";

type LineDraft = {
  awbNo: string;
  remark: string;
  amount: string;
  total: string;
  igst: string;
  sgst: string;
  cgst: string;
  grandTotal: string;
};

type DebitLine = {
  id: string;
  awbNo: string;
  destination: string;
  product: string;
  weight: string;
  pcs: string;
  remark: string;
  amount: string;
  igst: string;
  sgst: string;
  cgst: string;
  total: string;
};

type DebitNoteForm = {
  noteNo: string;
  date: string;
  customer: LookupPair;
  invoiceRef: string;
  narration: string;
  gst: boolean;
  approvalOnEInvoice: boolean;
  irn: string;
  lines: DebitLine[];
};

type DebitNoteRow = {
  id: string;
  debitNoteNo: string;
  date: string;
  customerName: string;
  invoiceRef: string;
  narration: string;
  grandTotal: string;
  form: DebitNoteForm;
};

type ReportForm = {
  fromDate: string;
  toDate: string;
  customer: LookupPair;
  registerType: RegisterType;
};

type IrnForm = {
  fromDate: string;
  toDate: string;
  serviceCenter: LookupPair;
  customer: LookupPair;
  status: IrnStatus;
};

type ColFilterKey =
  | "debitNoteNo"
  | "date"
  | "customerName"
  | "invoiceRef"
  | "narration"
  | "grandTotal";

const DEMO_AWBS: Record<
  string,
  { destination: string; product: string; weight: string; pcs: string }
> = {
  "30403918": { destination: "DEL", product: "DOX", weight: "12.000", pcs: "1" },
  "30404019": { destination: "US", product: "SPX", weight: "20.000", pcs: "1" },
  "30404020": { destination: "BOM", product: "DOX", weight: "15.500", pcs: "2" },
};

const SEED_ROWS: Omit<DebitNoteRow, "id" | "form">[] = [
  {
    debitNoteNo: "2",
    date: "01/01/2025",
    customerName: "AADYAM LOGI SOLUTIONS",
    invoiceRef: "",
    narration: "",
    grandTotal: "500.00",
  },
  {
    debitNoteNo: "1",
    date: "18/01/2024",
    customerName: "VAMSHI INTERNATIONAL",
    invoiceRef: "3009381",
    narration: "",
    grandTotal: "0.00",
  },
];

const REGISTER_TYPES = ["B2B", "B2C", "SEZWP", "SEZWOP"] as const;
const IRN_STATUS_OPTIONS: IrnStatus[] = ["All", "Approved", "Pending"];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  if (iso.includes("/")) return iso;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const parseDisplayDate = (display: string) => {
  if (display.includes("-")) return display;
  const [d, m, y] = display.split("/");
  if (!d || !m || !y) return display;
  return `${y}-${m}-${d}`;
};

const parseNum = (value: string) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (value: number) => value.toFixed(2);

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyLineDraft = (): LineDraft => ({
  awbNo: "",
  remark: "",
  amount: "0",
  total: "0",
  igst: "0",
  sgst: "0",
  cgst: "0",
  grandTotal: "0",
});

const emptyForm = (noteNo = ""): DebitNoteForm => ({
  noteNo,
  date: todayIso(),
  customer: emptyPair(),
  invoiceRef: "",
  narration: "",
  gst: false,
  approvalOnEInvoice: false,
  irn: "",
  lines: [],
});

const seedForm = (row: Omit<DebitNoteRow, "id" | "form">): DebitNoteForm => ({
  noteNo: row.debitNoteNo,
  date: parseDisplayDate(row.date),
  customer: { code: row.customerName.slice(0, 4).toUpperCase(), name: row.customerName },
  invoiceRef: row.invoiceRef,
  narration: row.narration,
  gst: parseNum(row.grandTotal) > parseNum("500"),
  approvalOnEInvoice: false,
  irn: "",
  lines:
    row.debitNoteNo === "2"
      ? [
          {
            id: crypto.randomUUID(),
            awbNo: "30403918",
            destination: "DEL",
            product: "DOX",
            weight: "12.000",
            pcs: "1",
            remark: "",
            amount: "423.73",
            igst: "0",
            sgst: "38.14",
            cgst: "38.13",
            total: "500.00",
          },
        ]
      : [],
});

const buildSeedRows = (): DebitNoteRow[] =>
  SEED_ROWS.map((row) => ({
    id: crypto.randomUUID(),
    ...row,
    form: seedForm(row),
  }));

const nextNoteNo = (rows: DebitNoteRow[]) => {
  const nums = rows.map((r) => Number.parseInt(r.debitNoteNo, 10)).filter((n) => Number.isFinite(n));
  return String((nums.length > 0 ? Math.max(...nums) : 2) + 1);
};

const sumLines = (lines: DebitLine[]) => {
  const amount = lines.reduce((s, l) => s + parseNum(l.amount), 0);
  const igst = lines.reduce((s, l) => s + parseNum(l.igst), 0);
  const sgst = lines.reduce((s, l) => s + parseNum(l.sgst), 0);
  const cgst = lines.reduce((s, l) => s + parseNum(l.cgst), 0);
  const total = lines.reduce((s, l) => s + parseNum(l.total), 0);
  const gst = igst + sgst + cgst;
  return { amount, igst, sgst, cgst, gst, total };
};

const formToRow = (form: DebitNoteForm, id: string): DebitNoteRow => {
  const totals = sumLines(form.lines);
  return {
    id,
    debitNoteNo: form.noteNo,
    date: formatDisplayDate(form.date),
    customerName: form.customer.name || form.customer.code,
    invoiceRef: form.invoiceRef,
    narration: form.narration,
    grandTotal: fmt(totals.total),
    form: { ...form, lines: form.lines.map((l) => ({ ...l })) },
  };
};

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  debitNoteNo: "",
  date: "",
  customerName: "",
  invoiceRef: "",
  narration: "",
  grandTotal: "",
});

const emptyReportForm = (): ReportForm => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  customer: emptyPair(),
  registerType: "",
});

const emptyIrnForm = (): IrnForm => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  serviceCenter: emptyPair(),
  customer: emptyPair(),
  status: "All",
});

export const Route = createFileRoute("/transaction/receipt/debit-note")({
  head: () => ({
    meta: [
      { title: "Debit Note — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage customer debit notes." },
    ],
  }),
  component: DebitNotePage,
});

function DebitNotePage() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<PageView>("list");
  const [rows, setRows] = useState<DebitNoteRow[]>(buildSeedRows);
  const [editing, setEditing] = useState<DebitNoteRow | null>(null);
  const [form, setForm] = useState<DebitNoteForm>(emptyForm());
  const [lineDraft, setLineDraft] = useState<LineDraft>(emptyLineDraft());
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<DebitNoteRow | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState<ReportForm>(emptyReportForm());
  const [irnForm, setIrnForm] = useState<IrnForm>(emptyIrnForm());

  const patchForm = (patch: Partial<DebitNoteForm>) => setForm((f) => ({ ...f, ...patch }));
  const patchReport = (patch: Partial<ReportForm>) => setReportForm((f) => ({ ...f, ...patch }));
  const patchIrn = (patch: Partial<IrnForm>) => setIrnForm((f) => ({ ...f, ...patch }));
  const patchDraft = (patch: Partial<LineDraft>) => setLineDraft((d) => ({ ...d, ...patch }));

  const lineTotals = sumLines(form.lines);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const hay = [
          row.debitNoteNo,
          row.date,
          row.customerName,
          row.invoiceRef,
          row.narration,
          row.grandTotal,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const cf = colFilters;
      if (cf.debitNoteNo && !row.debitNoteNo.includes(cf.debitNoteNo)) return false;
      if (cf.date && !row.date.includes(cf.date)) return false;
      if (cf.customerName && !row.customerName.toLowerCase().includes(cf.customerName.toLowerCase())) {
        return false;
      }
      if (cf.invoiceRef && !row.invoiceRef.toLowerCase().includes(cf.invoiceRef.toLowerCase())) {
        return false;
      }
      if (cf.narration && !row.narration.toLowerCase().includes(cf.narration.toLowerCase())) {
        return false;
      }
      if (cf.grandTotal && !row.grandTotal.includes(cf.grandTotal)) return false;
      return true;
    });
  }, [rows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    const noteNo = nextNoteNo(rows);
    setEditing(null);
    setForm(emptyForm(noteNo));
    setLineDraft(emptyLineDraft());
    setView("entry");
  };

  const openEntry = (row: DebitNoteRow) => {
    setEditing(row);
    setForm({ ...row.form, lines: row.form.lines.map((l) => ({ ...l })) });
    setLineDraft(emptyLineDraft());
    setView("entry");
  };

  const closeEntry = () => {
    setView("list");
    setEditing(null);
    setForm(emptyForm());
    setLineDraft(emptyLineDraft());
  };

  const persistEntry = () => {
    if (!form.customer.code.trim() && !form.customer.name.trim()) {
      return toast.error("Customer is required");
    }
    if (form.lines.length === 0) return toast.error("Add at least one AWB line");

    const noteNo = editing?.debitNoteNo ?? (form.noteNo || nextNoteNo(rows));
    const payload = formToRow({ ...form, noteNo }, editing?.id ?? crypto.randomUUID());

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? payload : r)));
      toast.success(`Debit Note ${noteNo} saved`);
    } else {
      setRows((prev) => [payload, ...prev]);
      toast.success(`Debit Note ${noteNo} created`);
    }
    closeEntry();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted debit note ${deleteTarget.debitNoteNo}`);
    setDeleteTarget(null);
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters(emptyColFilters());
    setPage(1);
    toast.success("List refreshed");
  };

  const clearFilters = () => {
    setSearch("");
    setColFilters(emptyColFilters());
    setPage(1);
    toast.success("Filters cleared");
  };

  const handleImport = () => importInputRef.current?.click();

  const openReport = () => {
    setReportForm(emptyReportForm());
    setReportOpen(true);
  };

  const closeReport = () => {
    setReportOpen(false);
    setReportForm(emptyReportForm());
  };

  const handleReportOk = () => {
    if (!reportForm.fromDate.trim()) return toast.error("From Date is required");
    if (!reportForm.toDate.trim()) return toast.error("To Date is required");

    const reportRows = filtered.filter((row) => {
      const iso = parseDisplayDate(row.date);
      if (reportForm.fromDate && iso < reportForm.fromDate) return false;
      if (reportForm.toDate && iso > reportForm.toDate) return false;
      if (reportForm.customer.name.trim()) {
        if (!row.customerName.toLowerCase().includes(reportForm.customer.name.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    downloadCsv(
      "debit-note-report.csv",
      [
        "Debit Note No.",
        "Date",
        "Customer Name",
        "Invoice Ref.",
        "Narration",
        "Grand Total",
        "Register Type",
      ],
      reportRows.map((row) => [
        row.debitNoteNo,
        row.date,
        row.customerName,
        row.invoiceRef,
        row.narration,
        row.grandTotal,
        reportForm.registerType || "All",
      ]),
    );
    toast.success("Debit note report exported");
    closeReport();
  };

  const openIrn = () => {
    setIrnForm(emptyIrnForm());
    setView("irn");
  };

  const closeIrn = () => {
    setView("list");
    setIrnForm(emptyIrnForm());
  };

  const handleIrnView = () => {
    if (!irnForm.fromDate.trim()) return toast.error("From Date is required");
    if (!irnForm.toDate.trim()) return toast.error("To Date is required");

    const matches = rows.filter((row) => {
      const iso = parseDisplayDate(row.date);
      if (irnForm.fromDate && iso < irnForm.fromDate) return false;
      if (irnForm.toDate && iso > irnForm.toDate) return false;
      if (irnForm.customer.name.trim()) {
        if (!row.customerName.toLowerCase().includes(irnForm.customer.name.toLowerCase())) {
          return false;
        }
      }
      if (irnForm.status === "Approved") {
        return row.form.approvalOnEInvoice || parseNum(row.grandTotal) > 0;
      }
      if (irnForm.status === "Pending") {
        return !row.form.approvalOnEInvoice && parseNum(row.grandTotal) > 0;
      }
      return true;
    });

    downloadCsv(
      "debit-note-irn-generation.csv",
      ["Debit Note No.", "Date", "Customer Name", "Invoice Ref.", "IRN", "Grand Total", "Status"],
      matches.map((row) => [
        row.debitNoteNo,
        row.date,
        row.customerName,
        row.invoiceRef,
        row.form.irn,
        row.grandTotal,
        row.form.approvalOnEInvoice ? "Approved" : "Pending",
      ]),
    );
    toast.success(`${matches.length} debit note(s) ready for IRN generation`);
  };

  const printRow = (row: DebitNoteRow) => {
    toast.success(`Print prepared for debit note ${row.debitNoteNo}`);
  };

  const recalcDraftTax = (draft: LineDraft, gst: boolean) => {
    const amount = parseNum(draft.amount);
    if (!gst || amount <= 0) {
      return {
        ...draft,
        igst: "0",
        sgst: "0",
        cgst: "0",
        total: fmt(amount),
        grandTotal: fmt(amount),
      };
    }
    const sgst = amount * 0.09;
    const cgst = amount * 0.09;
    const total = amount + sgst + cgst;
    return {
      ...draft,
      igst: "0",
      sgst: fmt(sgst),
      cgst: fmt(cgst),
      total: fmt(total),
      grandTotal: fmt(total),
    };
  };

  const addLine = () => {
    if (!lineDraft.awbNo.trim()) return toast.error("AWB No. is required");
    const awbMeta = DEMO_AWBS[lineDraft.awbNo.trim()];
    const draft = recalcDraftTax(lineDraft, form.gst);
    const line: DebitLine = {
      id: crypto.randomUUID(),
      awbNo: lineDraft.awbNo.trim(),
      destination: awbMeta?.destination ?? "",
      product: awbMeta?.product ?? "",
      weight: awbMeta?.weight ?? "",
      pcs: awbMeta?.pcs ?? "1",
      remark: lineDraft.remark,
      amount: draft.amount,
      igst: draft.igst,
      sgst: draft.sgst,
      cgst: draft.cgst,
      total: draft.grandTotal,
    };
    patchForm({ lines: [...form.lines, line] });
    setLineDraft(emptyLineDraft());
    toast.success("AWB line added");
  };

  const removeLine = (id: string) => {
    patchForm({ lines: form.lines.filter((l) => l.id !== id) });
  };

  if (view === "irn") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Debit Note"]} />

        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <FormSection title="IRN Generation">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="From Date" required>
                <Input
                  type="date"
                  value={irnForm.fromDate}
                  onChange={(e) => patchIrn({ fromDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="To Date" required>
                <Input
                  type="date"
                  value={irnForm.toDate}
                  onChange={(e) => patchIrn({ toDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Service Center">
                <LookupPairInput
                  lookup="serviceCentre"
                  value={irnForm.serviceCenter}
                  onChange={(serviceCenter) => patchIrn({ serviceCenter })}
                />
              </FieldWrapper>
              <FieldWrapper label="Customer">
                <LookupPairInput
                  lookup="customer"
                  value={irnForm.customer}
                  onChange={(customer) => patchIrn({ customer })}
                />
              </FieldWrapper>
              <FieldWrapper label="Status">
                <Select
                  value={irnForm.status}
                  onValueChange={(value) => patchIrn({ status: value as IrnStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IRN_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
            </div>
          </FormSection>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              onClick={handleIrnView}
              className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            >
              View
            </Button>
            <Button variant="destructive" onClick={closeIrn} className="min-w-24">
              Close
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (view === "entry") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Debit Note"]} />

        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <FormSection title="Debit Note">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Note No">
                <Input value={form.noteNo} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="Debit Note">
                <Input value={form.noteNo} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="Date">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => patchForm({ date: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Customer" required>
                <LookupPairInput
                  lookup="customer"
                  value={form.customer}
                  onChange={(customer) => patchForm({ customer })}
                />
              </FieldWrapper>
              <FieldWrapper label="Invoice Ref">
                <Input
                  value={form.invoiceRef}
                  onChange={(e) => patchForm({ invoiceRef: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Narration" className="md:col-span-2">
                <Input
                  value={form.narration}
                  onChange={(e) => patchForm({ narration: e.target.value })}
                />
              </FieldWrapper>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.gst}
                    onCheckedChange={(checked) => patchForm({ gst: checked === true })}
                  />
                  GST
                </label>
              </div>
            </div>

            <p className="mt-3 text-sm font-medium text-destructive">
              Amount : {fmt(lineTotals.amount)} GST : {fmt(lineTotals.gst)} Total Amount :{" "}
              {fmt(lineTotals.total)}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
              <FieldWrapper label="Total">
                <Input value={fmt(lineTotals.amount)} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="IGST">
                <Input value={fmt(lineTotals.igst)} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="SGST">
                <Input value={fmt(lineTotals.sgst)} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="CGST">
                <Input value={fmt(lineTotals.cgst)} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="Grand Total">
                <Input value={fmt(lineTotals.total)} disabled readOnly />
              </FieldWrapper>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.approvalOnEInvoice}
                  onCheckedChange={(checked) => patchForm({ approvalOnEInvoice: checked === true })}
                />
                Approval on E-Invoice
              </label>
              <FieldWrapper label="IRN">
                <Input value={form.irn} onChange={(e) => patchForm({ irn: e.target.value })} />
              </FieldWrapper>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
              <FieldWrapper label="AWB No.">
                <Input
                  value={lineDraft.awbNo}
                  onChange={(e) => patchDraft({ awbNo: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Remark">
                <Input
                  value={lineDraft.remark}
                  onChange={(e) => patchDraft({ remark: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Amount">
                <Input
                  value={lineDraft.amount}
                  onChange={(e) => {
                    const next = recalcDraftTax({ ...lineDraft, amount: e.target.value }, form.gst);
                    setLineDraft(next);
                  }}
                  inputMode="decimal"
                />
              </FieldWrapper>
              <FieldWrapper label="Total">
                <Input value={lineDraft.total} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="IGST">
                <Input value={lineDraft.igst} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="SGST">
                <Input value={lineDraft.sgst} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="CGST">
                <Input value={lineDraft.cgst} disabled readOnly />
              </FieldWrapper>
              <FieldWrapper label="Grand Total">
                <div className="flex gap-1">
                  <Input value={lineDraft.grandTotal} disabled readOnly className="min-w-0 flex-1" />
                  <Button
                    type="button"
                    className="shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                    onClick={addLine}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </FieldWrapper>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1100px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="text-sidebar-foreground">AWB No.</TableHead>
                    <TableHead className="text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="text-sidebar-foreground">Product</TableHead>
                    <TableHead className="text-sidebar-foreground">Weight</TableHead>
                    <TableHead className="text-sidebar-foreground">PCS</TableHead>
                    <TableHead className="text-sidebar-foreground">Remark</TableHead>
                    <TableHead className="text-sidebar-foreground">Amount</TableHead>
                    <TableHead className="text-sidebar-foreground">IGST</TableHead>
                    <TableHead className="text-sidebar-foreground">SGST</TableHead>
                    <TableHead className="text-sidebar-foreground">CGST</TableHead>
                    <TableHead className="text-sidebar-foreground">Total</TableHead>
                    <TableHead className="text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                        No AWB lines added
                      </TableCell>
                    </TableRow>
                  ) : (
                    form.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.awbNo}</TableCell>
                        <TableCell>{line.destination}</TableCell>
                        <TableCell>{line.product}</TableCell>
                        <TableCell>{line.weight}</TableCell>
                        <TableCell>{line.pcs}</TableCell>
                        <TableCell>{line.remark}</TableCell>
                        <TableCell className="text-right">{line.amount}</TableCell>
                        <TableCell className="text-right">{line.igst}</TableCell>
                        <TableCell className="text-right">{line.sgst}</TableCell>
                        <TableCell className="text-right">{line.cgst}</TableCell>
                        <TableCell className="text-right">{line.total}</TableCell>
                        <TableCell className="text-center">
                          <IconButton
                            label="Delete line"
                            variant="ghost"
                            size="row"
                            className="text-destructive"
                            onClick={() => removeLine(line.id)}
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

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button onClick={persistEntry} className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90">
              Save
            </Button>
            <Button variant="destructive" onClick={closeEntry} className="min-w-24">
              Close
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Debit Note"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Debit Note</h1>
        <p className="text-sm text-muted-foreground">
          Issue debit notes against customer invoices with AWB-wise charge lines.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <IconButton label="Import" onClick={handleImport}>
              <Upload className="h-4 w-4" />
            </IconButton>
            <IconButton label="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <IconButton label="Report" onClick={openReport}>
              <FileText className="h-4 w-4" />
            </IconButton>
            <IconButton label="IRN Generation" onClick={openIrn}>
              <ScrollText className="h-4 w-4" />
            </IconButton>
            <IconButton label="Clear filters" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
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
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Debit Note No.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Date</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Customer Name</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Invoice Ref.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Narration</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Grand Total</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["debitNoteNo", "Debit Note No."],
                    ["date", "Date"],
                    ["customerName", "Customer"],
                    ["invoiceRef", "Invoice Ref."],
                    ["narration", "Narration"],
                    ["grandTotal", "Grand Total"],
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
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
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
                        className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        {row.debitNoteNo}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                    <TableCell className="max-w-[14rem] truncate" title={row.customerName}>
                      {row.customerName}
                    </TableCell>
                    <TableCell>{row.invoiceRef}</TableCell>
                    <TableCell className="max-w-[12rem] truncate" title={row.narration}>
                      {row.narration}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">{row.grandTotal}</TableCell>
                    <TableCell className="whitespace-nowrap px-1 text-center">
                      <div className="flex justify-center gap-0">
                        <IconButton
                          label="Edit"
                          variant="ghost"
                          size="row"
                          className="text-sky-600"
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
                          onClick={() => printRow(row)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium uppercase tracking-wide text-foreground/80">
            Total Record(s) Found: {filtered.length}
          </span>
          <TablePager
            startIdx={startIdx}
            endIdx={endIdx}
            total={filtered.length}
            currentPage={currentPage}
            totalPages={totalPages}
            setPage={setPage}
          />
        </div>
      </Card>

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={() => toast.info("Import will be enabled with backend wiring")}
      />

      <Dialog open={reportOpen} onOpenChange={(open) => !open && closeReport()}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Report</DialogTitle>
          </div>
          <div className="space-y-4 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldWrapper label="From Date" required>
                <Input
                  type="date"
                  value={reportForm.fromDate}
                  onChange={(e) => patchReport({ fromDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="To Date" required>
                <Input
                  type="date"
                  value={reportForm.toDate}
                  onChange={(e) => patchReport({ toDate: e.target.value })}
                />
              </FieldWrapper>
            </div>
            <FieldWrapper label="Customer">
              <LookupPairInput
                lookup="customer"
                value={reportForm.customer}
                onChange={(customer) => patchReport({ customer })}
              />
            </FieldWrapper>
            <FieldWrapper label="Register Type">
              <Select
                value={reportForm.registerType || undefined}
                onValueChange={(value) => patchReport({ registerType: value as RegisterType })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {REGISTER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleReportOk} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
              OK
            </Button>
            <Button variant="destructive" onClick={closeReport}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete debit note?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will permanently remove debit note ${deleteTarget.debitNoteNo}.`
                : ""}
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
