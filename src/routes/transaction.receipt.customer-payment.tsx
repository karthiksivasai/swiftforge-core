import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { FilePlus, RefreshCw, Filter, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import {
  approveCustomerPayment,
  listCustomerPayments,
  rejectCustomerPayment,
  saveCustomerPayment,
} from "@/lib/transactions/resources/finance";
import { dbPaymentToUi, paymentFormToFields } from "@/lib/transactions/financeUiMap";
import {
  canApproveCustomerPayment,
  canRejectCustomerPayment,
  canUpdateCustomerPayment,
} from "@/lib/transactions/schemas/finance";
import { cn } from "@/lib/utils";

type LookupPair = { id?: string; code: string; name: string };
type PageView = "list" | "entry";
type ApprovalStatus = "Pending" | "Approved" | "Rejected";

type PaymentForm = {
  date: string;
  paidDate: string;
  amount: string;
  remark: string;
  customer: LookupPair;
  fileName: string;
};

type PaymentRow = {
  id: string;
  date: string;
  customerName: string;
  paidDate: string;
  amount: string;
  remark: string;
  approved: ApprovalStatus;
  fileName: string;
  status: string;
  rowVersion: number;
  form: PaymentForm;
};

type ColFilterKey = "date" | "customerName" | "paidDate" | "amount" | "remark" | "approved";

const SEED_ROWS: Omit<PaymentRow, "id" | "form" | "status" | "rowVersion">[] = [
  {
    date: "06/05/2026",
    customerName: "DAP COURIERS AND LOGISTICS PRIVATE LIMITED",
    paidDate: "06/05/2026",
    amount: "16800.00",
    remark: "",
    approved: "Pending",
    fileName: "",
  },
  {
    date: "01/02/2026",
    customerName: "RASHMIKA ENT",
    paidDate: "03/02/2026",
    amount: "10000.00",
    remark: "",
    approved: "Pending",
    fileName: "",
  },
  {
    date: "06/03/2025",
    customerName: "GK INTERNATIONAL COURIER SERVICE",
    paidDate: "21/03/2025",
    amount: "5000.00",
    remark: "",
    approved: "Pending",
    fileName: "",
  },
  {
    date: "09/09/2024",
    customerName: "SBR INTERNATIONAL",
    paidDate: "09/09/2024",
    amount: "24000.00",
    remark: "cash",
    approved: "Pending",
    fileName: "",
  },
  {
    date: "16/01/2024",
    customerName: "VAMSHI INTERNATIONAL",
    paidDate: "16/01/2024",
    amount: "1.00",
    remark: "BANK",
    approved: "Rejected",
    fileName: "",
  },
  {
    date: "08/01/2024",
    customerName: "COURGIANT EXPRESS PRIVATE LIMITED",
    paidDate: "08/01/2024",
    amount: "1.00",
    remark: "",
    approved: "Approved",
    fileName: "payment-receipt.pdf",
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

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): PaymentForm => ({
  date: todayIso(),
  paidDate: todayIso(),
  amount: "",
  remark: "",
  customer: emptyPair(),
  fileName: "",
});

const rowToForm = (
  row: Omit<PaymentRow, "id" | "form" | "status" | "rowVersion">,
): PaymentForm => ({
  date: parseDisplayDate(row.date),
  paidDate: parseDisplayDate(row.paidDate),
  amount: row.amount,
  remark: row.remark,
  customer: { code: row.customerName.slice(0, 4).toUpperCase(), name: row.customerName },
  fileName: row.fileName,
});

const statusFromApproved = (approved: ApprovalStatus): string =>
  approved === "Approved" ? "APPROVED" : approved === "Rejected" ? "REJECTED" : "PENDING";

const formToRow = (
  form: PaymentForm,
  id: string,
  approved: ApprovalStatus,
  rowVersion = 1,
): PaymentRow => ({
  id,
  date: formatDisplayDate(form.date),
  customerName: form.customer.name || form.customer.code,
  paidDate: formatDisplayDate(form.paidDate),
  amount: form.amount,
  remark: form.remark,
  approved,
  fileName: form.fileName,
  status: statusFromApproved(approved),
  rowVersion,
  form: { ...form },
});

const buildSeedRows = (): PaymentRow[] =>
  SEED_ROWS.map((row) => ({
    id: crypto.randomUUID(),
    ...row,
    status: statusFromApproved(row.approved),
    rowVersion: 1,
    form: rowToForm(row),
  }));

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  date: "",
  customerName: "",
  paidDate: "",
  amount: "",
  remark: "",
  approved: "",
});

const approvalClass = (status: ApprovalStatus) =>
  cn(
    status === "Pending" && "font-medium text-destructive",
    status === "Approved" && "text-foreground",
    status === "Rejected" && "text-foreground",
  );

export const Route = createFileRoute("/transaction/receipt/customer-payment")({
  head: () => ({
    meta: [
      { title: "Customer Payment — Transaction — Courier ERP" },
      { name: "description", content: "Record and track customer payment submissions." },
    ],
  }),
  component: CustomerPaymentPage,
});

function CustomerPaymentPage() {
  const { isAuthenticated: authed } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<PageView>("list");
  const [demoRows, setDemoRows] = useState<PaymentRow[]>(buildSeedRows);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [form, setForm] = useState<PaymentForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRow | null>(null);
  const [saving, setSaving] = useState(false);

  const liveQuery = useQuery({
    queryKey: ["customer_payments", "list"],
    queryFn: () => listCustomerPayments({ pageSize: 500 }),
    enabled: authed,
  });

  const rows: PaymentRow[] = authed ? (liveQuery.data?.rows ?? []).map(dbPaymentToUi) : demoRows;

  const refreshLive = async () => {
    await queryClient.invalidateQueries({ queryKey: ["customer_payments"] });
  };

  const patchForm = (patch: Partial<PaymentForm>) => setForm((f) => ({ ...f, ...patch }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const hay = [row.date, row.customerName, row.paidDate, row.amount, row.remark, row.approved]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const cf = colFilters;
      if (cf.date && !row.date.includes(cf.date)) return false;
      if (
        cf.customerName &&
        !row.customerName.toLowerCase().includes(cf.customerName.toLowerCase())
      ) {
        return false;
      }
      if (cf.paidDate && !row.paidDate.includes(cf.paidDate)) return false;
      if (cf.amount && !row.amount.includes(cf.amount)) return false;
      if (cf.remark && !row.remark.toLowerCase().includes(cf.remark.toLowerCase())) return false;
      if (cf.approved && !row.approved.toLowerCase().includes(cf.approved.toLowerCase())) {
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

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setView("entry");
  };

  const openEntry = (row: PaymentRow) => {
    if (authed && !canUpdateCustomerPayment(row.status)) {
      return toast.error("Only pending payments can be edited");
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
    if (!form.customer.code.trim() && !form.customer.name.trim()) {
      return toast.error("Customer is required");
    }
    if (!form.amount.trim()) return toast.error("Amount is required");

    if (authed) {
      setSaving(true);
      try {
        await saveCustomerPayment({
          id: editing?.id ?? null,
          row_version: editing?.rowVersion ?? null,
          fields: paymentFormToFields(form),
        });
        await refreshLive();
        toast.success(editing ? "Customer payment saved" : "Customer payment created");
        closeEntry();
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    const payload = formToRow(
      form,
      editing?.id ?? crypto.randomUUID(),
      editing?.approved ?? "Pending",
      editing?.rowVersion ?? 1,
    );

    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? payload : r)));
      toast.success("Customer payment saved (demo)");
    } else {
      setDemoRows((prev) => [payload, ...prev]);
      toast.success("Customer payment created (demo)");
    }
    closeEntry();
  };

  const approveRow = async (row: PaymentRow) => {
    if (!canApproveCustomerPayment(row.status)) {
      return toast.error("Only pending payments can be approved");
    }
    if (authed) {
      try {
        await approveCustomerPayment({ id: row.id, row_version: row.rowVersion });
        await refreshLive();
        toast.success("Customer payment approved");
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      return;
    }
    setDemoRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              approved: "Approved" as const,
              status: "APPROVED",
              rowVersion: r.rowVersion + 1,
            }
          : r,
      ),
    );
    toast.success("Customer payment approved (demo)");
  };

  const rejectRow = async (row: PaymentRow) => {
    if (!canRejectCustomerPayment(row.status)) {
      return toast.error("Only pending payments can be rejected");
    }
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    if (authed) {
      try {
        await rejectCustomerPayment({
          id: row.id,
          row_version: row.rowVersion,
          reason: reason.trim() || null,
        });
        await refreshLive();
        toast.success("Customer payment rejected");
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      return;
    }
    setDemoRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              approved: "Rejected" as const,
              status: "REJECTED",
              rowVersion: r.rowVersion + 1,
            }
          : r,
      ),
    );
    toast.success("Customer payment rejected (demo)");
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (authed) {
      toast.info("Delete is not available for finance history");
      setDeleteTarget(null);
      return;
    }
    setDemoRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success("Customer payment deleted");
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

  if (view === "entry") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Customer Payment"]} />

        <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
          <FormSection title="Customer Payment">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FieldWrapper label="Date">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => patchForm({ date: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Paid Date">
                <Input
                  type="date"
                  value={form.paidDate}
                  onChange={(e) => patchForm({ paidDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Amount" required>
                <Input
                  value={form.amount}
                  onChange={(e) => patchForm({ amount: e.target.value })}
                  inputMode="decimal"
                />
              </FieldWrapper>
              <FieldWrapper label="Remark">
                <Input
                  value={form.remark}
                  onChange={(e) => patchForm({ remark: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper label="Customer" required className="md:col-span-2">
                <LookupPairInput
                  lookup="customer"
                  value={form.customer}
                  onChange={(customer) => patchForm({ customer })}
                />
              </FieldWrapper>
              <FieldWrapper label="File Upload" className="md:col-span-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      patchForm({ fileName: file?.name ?? "" });
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
                    {form.fileName || "No file selected"}
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
              Close
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Receipt / Expenses", "Customer Payment"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Customer Payment</h1>
        <p className="text-sm text-muted-foreground">
          Record customer payment submissions and track approval status.
          {authed
            ? " Connected to live backend."
            : " Demo mode — sign in for live customer payments."}
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <IconButton label="Add" onClick={openAdd}>
              <FilePlus className="h-4 w-4" />
            </IconButton>
            <IconButton label="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
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
          <table className="w-full min-w-[960px] caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Date</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Customer Name
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Paid Date
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Amount</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Remark</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">
                  Approved
                </TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Image</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">
                  Action
                </TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["date", "Date"],
                    ["customerName", "Customer"],
                    ["paidDate", "Paid Date"],
                    ["amount", "Amount"],
                    ["remark", "Remark"],
                    ["approved", "Approved"],
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
                  <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                    <TableCell className="max-w-[16rem] truncate" title={row.customerName}>
                      {row.customerName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.paidDate}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{row.amount}</TableCell>
                    <TableCell>{row.remark}</TableCell>
                    <TableCell className={approvalClass(row.approved)}>{row.approved}</TableCell>
                    <TableCell>
                      {row.fileName ? (
                        <button
                          type="button"
                          className="text-sky-600 hover:underline dark:text-sky-400"
                          onClick={() => toast.info(`Opening ${row.fileName}`)}
                        >
                          View
                        </button>
                      ) : null}
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
                        {row.approved === "Pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-emerald-600"
                              onClick={() => approveRow(row)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive"
                              onClick={() => rejectRow(row)}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will permanently remove the payment record for ${deleteTarget.customerName}.`
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
          aria-label="Search customer"
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
