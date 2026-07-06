import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  CloudUpload,
  RefreshCw,
  Filter,
  FileText,
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
type PageView = "list" | "entry";

type ReceiptForm = {
  receiptNo: string;
  date: string;
  customer: LookupPair;
  serviceCenter: LookupPair;
  bankName: string;
  amount: string;
  narration: string;
};

type ReceiptRow = {
  id: string;
  receiptNo: string;
  date: string;
  customerName: string;
  serviceCenter: string;
  bankName: string;
  amount: string;
  narration: string;
  form: ReceiptForm;
};

type ReportForm = {
  fromDate: string;
  toDate: string;
  customer: LookupPair;
  serviceCenter: LookupPair;
  bankCash: LookupPair;
  summary: boolean;
};

const BANK_OPTIONS = [
  { code: "IDFC", name: "IDFC FIRST BANK" },
  { code: "HDFC", name: "HDFC BANK" },
  { code: "ICICI", name: "ICICI BANK" },
  { code: "CASH", name: "Cash" },
] as const;

const SEED_TEMPLATE: Omit<ReceiptRow, "id" | "receiptNo" | "form">[] = [
  { date: "04/07/2026", customerName: "ARS INTERNATIONAL", serviceCenter: "HYD", bankName: "IDFC FIRST BANK", amount: "4500.00", narration: "IDFC FIRST BANK" },
  { date: "04/07/2026", customerName: "UNIK ENTERPRISE", serviceCenter: "HYD", bankName: "IDFC FIRST BANK", amount: "3300.00", narration: "IDFC FIRST BANK" },
  { date: "04/07/2026", customerName: "NILESH", serviceCenter: "HYD", bankName: "IDFC FIRST BANK", amount: "5821.00", narration: "IDFC FIRST BANK" },
  { date: "04/07/2026", customerName: "RL EXPRESS", serviceCenter: "HYD", bankName: "IDFC FIRST BANK", amount: "9503.00", narration: "IDFC FIRST BANK" },
  { date: "04/07/2026", customerName: "NRI COURIER", serviceCenter: "HYD", bankName: "IDFC FIRST BANK", amount: "5265.00", narration: "IDFC FIRST BANK" },
  { date: "04/07/2026", customerName: "AIHAN ENTERPRISES", serviceCenter: "HYD", bankName: "IDFC FIRST BANK", amount: "29000.00", narration: "IDFC FIRST BANK" },
  { date: "04/07/2026", customerName: "HYDERABAD EXPORTS", serviceCenter: "HYD", bankName: "HDFC BANK", amount: "12500.00", narration: "HDFC BANK" },
  { date: "04/07/2026", customerName: "METRO LOGISTICS", serviceCenter: "HYD", bankName: "IDFC FIRST BANK", amount: "7800.00", narration: "IDFC FIRST BANK" },
  { date: "03/07/2026", customerName: "GLOBAL TRADERS PVT LTD", serviceCenter: "HYD", bankName: "ICICI BANK", amount: "15400.00", narration: "ICICI BANK" },
  { date: "03/07/2026", customerName: "TPC ADDANKI", serviceCenter: "HYD", bankName: "IDFC FIRST BANK", amount: "6200.00", narration: "IDFC FIRST BANK" },
];

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

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): ReceiptForm => ({
  receiptNo: "",
  date: todayIso(),
  customer: emptyPair(),
  serviceCenter: { code: "HYD", name: "HYDERABAD" },
  bankName: "IDFC FIRST BANK",
  amount: "",
  narration: "",
});

const emptyReportForm = (): ReportForm => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  customer: emptyPair(),
  serviceCenter: { code: "HYD", name: "HYDERABAD" },
  bankCash: { code: "IDFC", name: "IDFC FIRST BANK" },
  summary: false,
});

const templateToForm = (row: Omit<ReceiptRow, "id" | "receiptNo" | "form">, receiptNo: string): ReceiptForm => ({
  receiptNo,
  date: parseDisplayDate(row.date),
  customer: { code: row.customerName.slice(0, 4).toUpperCase(), name: row.customerName },
  serviceCenter: { code: row.serviceCenter, name: row.serviceCenter },
  bankName: row.bankName,
  amount: row.amount,
  narration: row.narration,
});

const formToRow = (form: ReceiptForm, id: string): ReceiptRow => ({
  id,
  receiptNo: form.receiptNo,
  date: formatDisplayDate(form.date),
  customerName: form.customer.name || form.customer.code,
  serviceCenter: form.serviceCenter.code || form.serviceCenter.name,
  bankName: form.bankName,
  amount: form.amount,
  narration: form.narration,
  form: { ...form },
});

const buildSeedRows = (): ReceiptRow[] => {
  const rows: ReceiptRow[] = [];
  let receiptNo = 34509;
  for (let batch = 0; batch < 25; batch += 1) {
    for (const template of SEED_TEMPLATE) {
      const no = String(receiptNo--);
      rows.push({
        id: crypto.randomUUID(),
        receiptNo: no,
        ...template,
        form: templateToForm(template, no),
      });
    }
  }
  return rows;
};

const nextReceiptNo = (rows: ReceiptRow[]) => {
  const nums = rows.map((r) => Number.parseInt(r.receiptNo, 10)).filter((n) => Number.isFinite(n));
  return String((nums.length > 0 ? Math.max(...nums) : 34509) + 1);
};

export const Route = createFileRoute("/transaction/receipt/receipt-entry")({
  head: () => ({
    meta: [
      { title: "Receipt Entry — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage customer receipt entries." },
    ],
  }),
  component: ReceiptEntryPage,
});

function ReceiptEntryPage() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<PageView>("list");
  const [rows, setRows] = useState<ReceiptRow[]>(buildSeedRows);
  const [editing, setEditing] = useState<ReceiptRow | null>(null);
  const [form, setForm] = useState<ReceiptForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ReceiptRow | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState<ReportForm>(emptyReportForm());

  const patchForm = (patch: Partial<ReceiptForm>) => setForm((f) => ({ ...f, ...patch }));
  const patchReport = (patch: Partial<ReportForm>) => setReportForm((f) => ({ ...f, ...patch }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.receiptNo,
        row.date,
        row.customerName,
        row.serviceCenter,
        row.bankName,
        row.amount,
        row.narration,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setView("entry");
  };

  const openEntry = (row: ReceiptRow) => {
    setEditing(row);
    setForm({ ...row.form });
    setView("entry");
  };

  const closeEntry = () => {
    setView("list");
    setEditing(null);
    setForm(emptyForm());
  };

  const persistEntry = () => {
    if (!form.customer.code.trim() && !form.customer.name.trim()) {
      return toast.error("Customer is required");
    }
    if (!form.serviceCenter.code.trim() && !form.serviceCenter.name.trim()) {
      return toast.error("Service Center is required");
    }
    if (!form.bankName.trim()) return toast.error("Bank Name is required");
    if (!form.amount.trim()) return toast.error("Amount is required");

    const receiptNo = editing?.receiptNo ?? nextReceiptNo(rows);
    const payload = formToRow(
      {
        ...form,
        receiptNo,
        date: editing ? form.date : todayIso(),
        narration: form.narration || form.bankName,
      },
      editing?.id ?? crypto.randomUUID(),
    );

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? payload : r)));
      toast.success(`Receipt ${receiptNo} saved`);
    } else {
      setRows((prev) => [payload, ...prev]);
      toast.success(`Receipt ${receiptNo} created`);
    }
    closeEntry();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted receipt ${deleteTarget.receiptNo}`);
    setDeleteTarget(null);
  };

  const handleRefresh = () => {
    setSearch("");
    setPage(1);
    toast.success("List refreshed");
  };

  const clearFilters = () => {
    setSearch("");
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
    if (!reportForm.serviceCenter.code.trim() && !reportForm.serviceCenter.name.trim()) {
      return toast.error("Service Center is required");
    }
    if (!reportForm.bankCash.code.trim() && !reportForm.bankCash.name.trim()) {
      return toast.error("Bank/Cash is required");
    }

    let reportRows = filtered.filter((row) => {
      const iso = parseDisplayDate(row.date);
      if (reportForm.fromDate && iso < reportForm.fromDate) return false;
      if (reportForm.toDate && iso > reportForm.toDate) return false;
      if (reportForm.customer.name.trim()) {
        if (!row.customerName.toLowerCase().includes(reportForm.customer.name.toLowerCase())) {
          return false;
        }
      }
      if (reportForm.serviceCenter.code.trim()) {
        if (row.serviceCenter !== reportForm.serviceCenter.code) return false;
      }
      if (reportForm.bankCash.name.trim()) {
        if (!row.bankName.toLowerCase().includes(reportForm.bankCash.name.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    if (reportForm.summary) {
      const total = reportRows.reduce((sum, row) => sum + (Number.parseFloat(row.amount) || 0), 0);
      downloadCsv(
        "receipt-entry-report-summary.csv",
        ["Total Receipts", "Total Amount"],
        [[String(reportRows.length), total.toFixed(2)]],
      );
    } else {
      downloadCsv(
        "receipt-entry-report.csv",
        ["Receipt No.", "Date", "Customer", "Service Center", "Bank Name", "Amount", "Narration"],
        reportRows.map((row) => [
          row.receiptNo,
          row.date,
          row.customerName,
          row.serviceCenter,
          row.bankName,
          row.amount,
          row.narration,
        ]),
      );
    }

    toast.success("Receipt report exported");
    closeReport();
  };

  const printRow = (row: ReceiptRow) => {
    toast.success(`Print prepared for receipt ${row.receiptNo}`);
  };

  if (view === "entry") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Receipt Entry"]} />

        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FieldWrapper label="Receipt No.">
              <Input value={editing?.receiptNo ?? "(Auto)"} disabled readOnly />
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
            <FieldWrapper label="Service Center" required>
              <LookupPairInput
                lookup="serviceCentre"
                value={form.serviceCenter}
                onChange={(serviceCenter) => patchForm({ serviceCenter })}
              />
            </FieldWrapper>
            <FieldWrapper label="Bank Name" required>
              <Input value={form.bankName} onChange={(e) => patchForm({ bankName: e.target.value })} />
            </FieldWrapper>
            <FieldWrapper label="Amount" required>
              <Input
                value={form.amount}
                onChange={(e) => patchForm({ amount: e.target.value })}
                inputMode="decimal"
              />
            </FieldWrapper>
            <FieldWrapper label="Narration" className="md:col-span-2 xl:col-span-2">
              <Input value={form.narration} onChange={(e) => patchForm({ narration: e.target.value })} />
            </FieldWrapper>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button onClick={persistEntry} className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90">
              Save
            </Button>
            <Button variant="destructive" onClick={closeEntry} className="min-w-24">
              Cancel
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Receipt Entry"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Receipt Entry</h1>
        <p className="text-sm text-muted-foreground">
          Record customer receipts against bank accounts and service centres.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <IconButton label="Import" onClick={handleImport}>
              <CloudUpload className="h-4 w-4" />
            </IconButton>
            <IconButton label="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <IconButton label="Clear filters" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
            </IconButton>
            <IconButton label="Report" onClick={openReport}>
              <FileText className="h-4 w-4" />
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
          <table className="w-full min-w-[960px] caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Receipt No.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Date</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Customer</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Service Center</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Bank Name</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Amount</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Narration</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
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
                        {row.receiptNo}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                    <TableCell className="max-w-[12rem] truncate" title={row.customerName}>
                      {row.customerName}
                    </TableCell>
                    <TableCell>{row.serviceCenter}</TableCell>
                    <TableCell className="max-w-[10rem] truncate" title={row.bankName}>
                      {row.bankName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">{row.amount}</TableCell>
                    <TableCell className="max-w-[10rem] truncate" title={row.narration}>
                      {row.narration}
                    </TableCell>
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
            <FieldWrapper label="Service Center" required>
              <LookupPairInput
                lookup="serviceCentre"
                value={reportForm.serviceCenter}
                onChange={(serviceCenter) => patchReport({ serviceCenter })}
              />
            </FieldWrapper>
            <FieldWrapper label="Bank/Cash" required>
              <BankLookupInput
                value={reportForm.bankCash}
                onChange={(bankCash) => patchReport({ bankCash })}
              />
            </FieldWrapper>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={reportForm.summary}
                onCheckedChange={(checked) => patchReport({ summary: checked === true })}
              />
              Summary
            </label>
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
            <AlertDialogTitle>Delete receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will permanently remove receipt ${deleteTarget.receiptNo}.`
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

function BankLookupInput({
  value,
  onChange,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
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
          aria-label="Search bank"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {lookupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-md border bg-card p-4 shadow-lg">
            <p className="mb-3 text-sm font-medium">Select Bank / Cash</p>
            <div className="space-y-1">
              {BANK_OPTIONS.map((bank) => (
                <button
                  key={bank.code}
                  type="button"
                  className="flex w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onChange({ code: bank.code, name: bank.name });
                    setLookupOpen(false);
                  }}
                >
                  {bank.name}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="mt-3 w-full" onClick={() => setLookupOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
