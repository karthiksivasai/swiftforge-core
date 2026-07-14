import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Upload, Download, RefreshCw, Filter, Printer, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { listExpenseEntries, saveExpense } from "@/lib/transactions/resources/finance";
import { dbExpenseToUi, expenseFormToFields } from "@/lib/transactions/financeUiMap";
import { canUpdateExpense } from "@/lib/transactions/schemas/finance";

type PageView = "list" | "entry";
type EntryKind = "Expense" | "Income";
type DebitCredit = "E" | "I";

type ExpenseForm = {
  entryNo: string;
  kind: EntryKind;
  date: string;
  expenseHead: string;
  cashBank: string;
  awbNo: string;
  description: string;
  amount: string;
  documentName: string;
};

type ExpenseRow = {
  id: string;
  entryNo: string;
  branchName: string;
  expenseDate: string;
  expenseName: string;
  bankCash: string;
  awbNo: string;
  description: string;
  debitCredit: DebitCredit;
  authorized: "Y" | "N" | "R";
  amount: string;
  documentName: string;
  status: string;
  rowVersion: number;
  form: ExpenseForm;
};

type ColFilterKey =
  | "entryNo"
  | "branchName"
  | "expenseDate"
  | "expenseName"
  | "bankCash"
  | "awbNo"
  | "description"
  | "debitCredit"
  | "authorized"
  | "amount";

const EXPENSE_HEADS = [
  "FOOD",
  "STATIONARY",
  "OFFICE EXPENSES",
  "ATLANTIC",
  "ASD LOGISTICS",
  "ICL",
  "WORLD FIRST",
  "NSS CARGO",
  "TRAVEL",
  "MAINTENANCE",
] as const;

const INCOME_HEADS = ["FREIGHT INCOME", "SERVICE CHARGE", "MISC INCOME", "REFUND"] as const;

const CASH_BANK_OPTIONS = ["Cash", "Bank"] as const;

const SEED_TEMPLATE: Omit<ExpenseRow, "id" | "entryNo" | "form" | "status" | "rowVersion">[] = [
  {
    branchName: "HYD",
    expenseDate: "30/05/2026",
    expenseName: "OFFICE EXPENSES",
    bankCash: "Cash",
    awbNo: "",
    description: "WF SANDEEP",
    debitCredit: "E",
    authorized: "Y",
    amount: "173400.00",
    documentName: "wf-sandeep.pdf",
  },
  {
    branchName: "HYD",
    expenseDate: "30/05/2026",
    expenseName: "FOOD",
    bankCash: "Cash",
    awbNo: "",
    description: "SNACKS",
    debitCredit: "E",
    authorized: "Y",
    amount: "400.00",
    documentName: "",
  },
  {
    branchName: "HYD",
    expenseDate: "30/05/2026",
    expenseName: "OFFICE EXPENSES",
    bankCash: "Cash",
    awbNo: "",
    description: "PETROL",
    debitCredit: "E",
    authorized: "Y",
    amount: "500.00",
    documentName: "petrol-receipt.pdf",
  },
  {
    branchName: "HYD",
    expenseDate: "29/05/2026",
    expenseName: "FOOD",
    bankCash: "Cash",
    awbNo: "",
    description: "TEA",
    debitCredit: "E",
    authorized: "Y",
    amount: "120.00",
    documentName: "",
  },
  {
    branchName: "HYD",
    expenseDate: "29/05/2026",
    expenseName: "TRAVEL",
    bankCash: "Cash",
    awbNo: "30404019",
    description: "AUTO FARE",
    debitCredit: "E",
    authorized: "N",
    amount: "180.00",
    documentName: "",
  },
  {
    branchName: "HYD",
    expenseDate: "28/05/2026",
    expenseName: "STATIONARY",
    bankCash: "Bank",
    awbNo: "",
    description: "PAPER SUPPLIES",
    debitCredit: "E",
    authorized: "Y",
    amount: "920.00",
    documentName: "stationery.pdf",
  },
  {
    branchName: "HYD",
    expenseDate: "28/05/2026",
    expenseName: "MAINTENANCE",
    bankCash: "Bank",
    awbNo: "",
    description: "PRINTER REPAIR",
    debitCredit: "E",
    authorized: "Y",
    amount: "3200.00",
    documentName: "",
  },
  {
    branchName: "HYD",
    expenseDate: "27/05/2026",
    expenseName: "FOOD",
    bankCash: "Cash",
    awbNo: "",
    description: "LUNCH",
    debitCredit: "E",
    authorized: "Y",
    amount: "650.00",
    documentName: "",
  },
  {
    branchName: "HYD",
    expenseDate: "27/05/2026",
    expenseName: "OFFICE EXPENSES",
    bankCash: "Cash",
    awbNo: "",
    description: "COURIER CHARGES",
    debitCredit: "E",
    authorized: "N",
    amount: "5400.00",
    documentName: "",
  },
  {
    branchName: "HYD",
    expenseDate: "26/05/2026",
    expenseName: "FREIGHT INCOME",
    bankCash: "Bank",
    awbNo: "30403918",
    description: "AWB COLLECTION",
    debitCredit: "I",
    authorized: "Y",
    amount: "12500.00",
    documentName: "",
  },
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

const emptyForm = (kind: EntryKind = "Expense"): ExpenseForm => ({
  entryNo: "",
  kind,
  date: todayIso(),
  expenseHead: "",
  cashBank: "",
  awbNo: "",
  description: "",
  amount: "",
  documentName: "",
});

const templateToForm = (
  row: Omit<ExpenseRow, "id" | "entryNo" | "form" | "status" | "rowVersion">,
  entryNo: string,
): ExpenseForm => ({
  entryNo,
  kind: row.debitCredit === "I" ? "Income" : "Expense",
  date: parseDisplayDate(row.expenseDate),
  expenseHead: row.expenseName,
  cashBank: row.bankCash,
  awbNo: row.awbNo,
  description: row.description,
  amount: row.amount,
  documentName: row.documentName,
});

const authFromStatus = (status: string): "Y" | "N" | "R" =>
  status === "AUTHORIZED" ? "Y" : status === "REJECTED" ? "R" : "N";

const formToRow = (
  form: ExpenseForm,
  id: string,
  status = "UNAUTHORIZED",
  rowVersion = 1,
): ExpenseRow => ({
  id,
  entryNo: form.entryNo,
  branchName: "HYD",
  expenseDate: formatDisplayDate(form.date),
  expenseName: form.expenseHead,
  bankCash: form.cashBank,
  awbNo: form.awbNo,
  description: form.description,
  debitCredit: form.kind === "Income" ? "I" : "E",
  authorized: authFromStatus(status),
  amount: form.amount,
  documentName: form.documentName,
  status,
  rowVersion,
  form: { ...form },
});

const buildSeedRows = (): ExpenseRow[] => {
  const rows: ExpenseRow[] = [];
  let entryNo = 31722;
  for (let batch = 0; batch < 50; batch += 1) {
    for (const template of SEED_TEMPLATE) {
      const no = String(entryNo--);
      const status =
        template.authorized === "Y"
          ? "AUTHORIZED"
          : template.authorized === "R"
            ? "REJECTED"
            : "UNAUTHORIZED";
      rows.push({
        id: crypto.randomUUID(),
        entryNo: no,
        ...template,
        status,
        rowVersion: 1,
        form: templateToForm(template, no),
      });
    }
  }
  return rows;
};

const nextEntryNo = (rows: ExpenseRow[]) => {
  const nums = rows.map((r) => Number.parseInt(r.entryNo, 10)).filter((n) => Number.isFinite(n));
  return String((nums.length > 0 ? Math.max(...nums) : 31722) + 1);
};

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  entryNo: "",
  branchName: "",
  expenseDate: "",
  expenseName: "",
  bankCash: "",
  awbNo: "",
  description: "",
  debitCredit: "",
  authorized: "",
  amount: "",
});

export const Route = createFileRoute("/transaction/receipt/expense-entry")({
  head: () => ({
    meta: [
      { title: "Expense Entry — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage expense and income entries." },
    ],
  }),
  component: ExpenseEntryPage,
});

function ExpenseEntryPage() {
  const { isAuthenticated: authed } = useAuth();
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<PageView>("list");
  const [demoRows, setDemoRows] = useState<ExpenseRow[]>(buildSeedRows);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [saving, setSaving] = useState(false);

  const liveQuery = useQuery({
    queryKey: ["expense_entries", "list"],
    queryFn: () => listExpenseEntries({ pageSize: 500 }),
    enabled: authed,
  });

  const rows: ExpenseRow[] = authed ? (liveQuery.data?.rows ?? []).map(dbExpenseToUi) : demoRows;

  const refreshLive = async () => {
    await queryClient.invalidateQueries({ queryKey: ["expense_entries"] });
  };

  const patchForm = (patch: Partial<ExpenseForm>) => setForm((f) => ({ ...f, ...patch }));

  const headOptions = form.kind === "Income" ? INCOME_HEADS : EXPENSE_HEADS;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const hay = [
          row.entryNo,
          row.branchName,
          row.expenseDate,
          row.expenseName,
          row.bankCash,
          row.awbNo,
          row.description,
          row.debitCredit,
          row.authorized,
          row.amount,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const cf = colFilters;
      if (cf.entryNo && !row.entryNo.includes(cf.entryNo)) return false;
      if (cf.branchName && !row.branchName.toLowerCase().includes(cf.branchName.toLowerCase())) {
        return false;
      }
      if (cf.expenseDate && !row.expenseDate.includes(cf.expenseDate)) return false;
      if (cf.expenseName && !row.expenseName.toLowerCase().includes(cf.expenseName.toLowerCase())) {
        return false;
      }
      if (cf.bankCash && !row.bankCash.toLowerCase().includes(cf.bankCash.toLowerCase())) {
        return false;
      }
      if (cf.awbNo && !row.awbNo.toLowerCase().includes(cf.awbNo.toLowerCase())) return false;
      if (cf.description && !row.description.toLowerCase().includes(cf.description.toLowerCase())) {
        return false;
      }
      if (cf.debitCredit && !row.debitCredit.toLowerCase().includes(cf.debitCredit.toLowerCase())) {
        return false;
      }
      if (cf.authorized && !row.authorized.toLowerCase().includes(cf.authorized.toLowerCase())) {
        return false;
      }
      if (cf.amount && !row.amount.includes(cf.amount)) return false;
      return true;
    });
  }, [rows, search, colFilters]);

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

  const openEntry = (row: ExpenseRow) => {
    if (authed && !canUpdateExpense(row.status)) {
      return toast.error("Only unauthorized entries can be edited");
    }
    setEditing(row);
    setForm({ ...row.form });
    setView("entry");
  };

  const closeEntry = () => {
    setView("list");
    setEditing(null);
    setForm(emptyForm());
  };

  const persistEntry = async () => {
    if (!form.expenseHead.trim()) {
      return toast.error(`${form.kind === "Income" ? "Income" : "Expense"} Head is required`);
    }
    if (!form.cashBank.trim()) return toast.error("Cash/Bank is required");
    if (!form.description.trim()) return toast.error("Description is required");
    if (!form.amount.trim()) return toast.error("Amount is required");
    if (!form.documentName.trim()) return toast.error("Upload Document is required");

    if (authed) {
      setSaving(true);
      try {
        await saveExpense({
          id: editing?.id ?? null,
          row_version: editing?.rowVersion ?? null,
          fields: expenseFormToFields(form),
        });
        await refreshLive();
        toast.success(editing ? `Entry ${editing.entryNo} saved` : "Entry created");
        closeEntry();
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    const entryNo = editing?.entryNo ?? nextEntryNo(rows);
    const payload = formToRow(
      { ...form, entryNo },
      editing?.id ?? crypto.randomUUID(),
      editing?.status ?? "UNAUTHORIZED",
      editing?.rowVersion ?? 1,
    );

    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? payload : r)));
      toast.success(`Entry ${entryNo} saved (demo)`);
    } else {
      setDemoRows((prev) => [payload, ...prev]);
      toast.success(`Entry ${entryNo} created (demo)`);
    }
    closeEntry();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (authed) {
      toast.info("Delete is not available for finance history");
      setDeleteTarget(null);
      return;
    }
    setDemoRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted entry ${deleteTarget.entryNo}`);
    setDeleteTarget(null);
  };

  const handleRefresh = async () => {
    setSearch("");
    setColFilters(emptyColFilters());
    setPage(1);
    if (authed) await refreshLive();
    toast.success("List refreshed");
  };

  const clearFilters = () => {
    setSearch("");
    setColFilters(emptyColFilters());
    setPage(1);
    toast.success("Filters cleared");
  };

  const handleImport = () => importInputRef.current?.click();

  const handleExport = () => {
    downloadCsv(
      "expense-entry.csv",
      [
        "Entry No",
        "Branch Name",
        "Expense Date",
        "Expense Name",
        "Bank / Cash",
        "AWB No.",
        "Description",
        "Debit/Credit",
        "Authorized",
        "Amount",
      ],
      filtered.map((row) => [
        row.entryNo,
        row.branchName,
        row.expenseDate,
        row.expenseName,
        row.bankCash,
        row.awbNo,
        row.description,
        row.debitCredit,
        row.authorized,
        row.amount,
      ]),
    );
    toast.success("Exported expense-entry.csv");
  };

  const printRow = (row: ExpenseRow) => {
    toast.success(`Print prepared for entry ${row.entryNo}`);
  };

  const setKind = (kind: EntryKind) => {
    const options = kind === "Income" ? INCOME_HEADS : EXPENSE_HEADS;
    patchForm({
      kind,
      expenseHead: (options as readonly string[]).includes(form.expenseHead)
        ? form.expenseHead
        : "",
    });
  };

  if (view === "entry") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Expense Entry"]} />

        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <FormSection title="Expense Entry">
            <div className="mb-4 flex flex-wrap gap-2">
              {(["Expense", "Income"] as const).map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant={form.kind === kind ? "default" : "outline"}
                  className={
                    form.kind === kind ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : ""
                  }
                  onClick={() => setKind(kind)}
                >
                  {kind}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Date" required>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => patchForm({ date: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper
                label={form.kind === "Income" ? "Income Head" : "Expense Head"}
                required
              >
                <Select
                  value={form.expenseHead || undefined}
                  onValueChange={(value) => patchForm({ expenseHead: value })}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={`Select ${form.kind === "Income" ? "Income" : "Expense"}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {headOptions.map((head) => (
                      <SelectItem key={head} value={head}>
                        {head}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Cash/Bank" required>
                <Select
                  value={form.cashBank || undefined}
                  onValueChange={(value) => patchForm({ cashBank: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {CASH_BANK_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="AWB No.">
                <Input value={form.awbNo} onChange={(e) => patchForm({ awbNo: e.target.value })} />
              </FieldWrapper>
              <FieldWrapper label="Description" required>
                <Input
                  value={form.description}
                  onChange={(e) => patchForm({ description: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Amount" required>
                <Input
                  value={form.amount}
                  onChange={(e) => patchForm({ amount: e.target.value })}
                  inputMode="decimal"
                />
              </FieldWrapper>
              <FieldWrapper
                label="Upload Document"
                required
                className="md:col-span-2 xl:col-span-2"
              >
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      patchForm({ documentName: file?.name ?? "" });
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {form.documentName || "No file selected"}
                  </span>
                </div>
              </FieldWrapper>
            </div>
          </FormSection>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              onClick={persistEntry}
              disabled={saving}
              className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
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
      <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Expense Entry"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expense Entry</h1>
        <p className="text-sm text-muted-foreground">
          Record branch expenses and income with supporting documents.
          {authed
            ? " Connected to live backend."
            : " Demo mode — sign in for live expense entries."}
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
            <IconButton label="Clear filters" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
            </IconButton>
            <IconButton label="Export" onClick={handleExport}>
              <Download className="h-4 w-4" />
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
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Entry No
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Branch Name
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Expense Date
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Expense Name
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Bank / Cash
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">AWB No.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Description
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Debit/Credit
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Authorized
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Amount</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">
                  Action
                </TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["entryNo", "Entry No"],
                    ["branchName", "Branch"],
                    ["expenseDate", "Date"],
                    ["expenseName", "Name"],
                    ["bankCash", "Bank/Cash"],
                    ["awbNo", "AWB No."],
                    ["description", "Description"],
                    ["debitCredit", "D/C"],
                    ["authorized", "Auth"],
                    ["amount", "Amount"],
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
                  <TableCell
                    colSpan={11}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
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
                        {row.entryNo}
                      </button>
                    </TableCell>
                    <TableCell>{row.branchName}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.expenseDate}</TableCell>
                    <TableCell className="max-w-[10rem] truncate" title={row.expenseName}>
                      {row.expenseName}
                    </TableCell>
                    <TableCell>{row.bankCash}</TableCell>
                    <TableCell>{row.awbNo}</TableCell>
                    <TableCell className="max-w-[10rem] truncate" title={row.description}>
                      {row.description}
                    </TableCell>
                    <TableCell>{row.debitCredit}</TableCell>
                    <TableCell>{row.authorized}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{row.amount}</TableCell>
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
          <span>
            Showing {startIdx} to {endIdx} of {filtered.length} entries
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `This will permanently remove entry ${deleteTarget.entryNo}.` : ""}
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
