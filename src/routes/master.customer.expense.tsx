import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  expenseHeadsResource,
  EXPENSE_IMPORT_HEADER_ALIASES,
  expenseCodeFromName,
  importExpenseHeadsChunked,
  normalizeExpenseImportRow,
  type ExpenseHeadRow as ExpenseDbRow,
} from "@/lib/masters/resources/expenseHeads";
import {
  expenseHeadCreateSchema,
  expenseHeadUpdateSchema,
} from "@/lib/masters/schemas/expenseHeads";
import type { ImportRow } from "@/lib/masters/core/import";
import { useMasterList, toErrorMessage, formatImportToast } from "@/lib/masters/screen";

type ExpenseKind = "Expense" | "Income";

type ExpenseRow = {
  id: string;
  code: string;
  name: string;
  kind: ExpenseKind;
  authorizationRequired: boolean;
  authorizedHoAmount: string;
  authorizedBranchAmount: string;
  documentRequired: boolean;
  documentRequiredAmount: string;
  row_version?: number;
};

type ExpenseForm = Omit<ExpenseRow, "id" | "row_version">;

const emptyForm = (): ExpenseForm => ({
  code: "",
  name: "",
  kind: "Expense",
  authorizationRequired: true,
  authorizedHoAmount: "0",
  authorizedBranchAmount: "0",
  documentRequired: true,
  documentRequiredAmount: "0",
});

const codeFromName = expenseCodeFromName;

function rowToView(r: ExpenseDbRow): ExpenseRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind === "INCOME" ? "Income" : "Expense",
    authorizationRequired: Boolean(r.authorization_required),
    authorizedHoAmount: String(r.authorized_ho_amount ?? 0),
    authorizedBranchAmount: String(r.authorized_branch_amount ?? 0),
    documentRequired: Boolean(r.document_required),
    documentRequiredAmount: String(r.document_required_amount ?? 0),
    row_version: r.row_version,
  };
}

function toRaw(form: ExpenseForm) {
  const name = form.name.trim();
  return {
    code: form.code.trim() || codeFromName(name),
    name,
    kind: form.kind === "Income" ? "INCOME" : "EXPENSE",
    expense_type: "OPERATIONAL" as const,
    authorization_required: form.authorizationRequired,
    authorized_ho_amount: form.authorizedHoAmount,
    authorized_branch_amount: form.authorizedBranchAmount,
    document_required: form.documentRequired,
    document_required_amount: form.documentRequiredAmount,
    status: "ACTIVE" as const,
  };
}

function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex h-10 overflow-hidden rounded-md border">
      <button
        type="button"
        className={cn(
          "flex-1 px-3 text-sm font-medium transition-colors",
          value ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:bg-muted",
        )}
        onClick={() => onChange(true)}
      >
        Yes
      </button>
      <button
        type="button"
        className={cn(
          "flex-1 border-l px-3 text-sm font-medium transition-colors",
          !value ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:bg-muted",
        )}
        onClick={() => onChange(false)}
      >
        No
      </button>
    </div>
  );
}

export const Route = createFileRoute("/master/customer/expense")({
  head: () => ({
    meta: [
      { title: "Expense — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage expense heads used across billing, invoicing, and accounting.",
      },
    ],
  }),
  component: ExpensePage,
});

function ExpensePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(expenseHeadsResource);
  const live = useMasterList(expenseHeadsResource, { enabled: authed });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<ExpenseRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ name: "", isAuthorized: "" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const rows: ExpenseRow[] = authed ? (live.rows as ExpenseDbRow[]).map(rowToView) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const authLabel = r.authorizationRequired ? "1" : "0";
      const authYesNo = r.authorizationRequired ? "yes" : "no";
      if (q && ![r.name, r.code, r.kind, authLabel, authYesNo].some((v) => v.toLowerCase().includes(q)))
        return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase()))
        return false;
      if (colFilters.isAuthorized) {
        const f = colFilters.isAuthorized.trim().toLowerCase();
        if (f === "1" || f === "yes" || f === "true") {
          if (!r.authorizationRequired) return false;
        } else if (f === "0" || f === "no" || f === "false") {
          if (r.authorizationRequired) return false;
        } else if (!authLabel.includes(f) && !authYesNo.includes(f)) {
          return false;
        }
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
    setOpen(true);
  };

  const openEdit = (row: ExpenseRow) => {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Expense Head is required");
    if (!form.kind) return toast.error("Expense Type is required");
    const raw = toRaw(form);
    if (authed) {
      setSaving(true);
      try {
        if (editing) {
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch: expenseHeadUpdateSchema.parse(raw),
          });
          toast.success("Expense updated");
        } else {
          await rc.create.mutateAsync(expenseHeadCreateSchema.parse(raw));
          toast.success("Expense added");
        }
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save expense"));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Expense updated");
    } else {
      setDemoRows((prev) => [
        { id: crypto.randomUUID(), ...form, code: form.code || codeFromName(form.name) },
        ...prev,
      ]);
      toast.success("Expense added");
    }
    setOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.name}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete expense"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.name}`);
    }
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(row.id);
      return n;
    });
    setDeleteTarget(null);
  };

  const confirmBulkDelete = async () => {
    const ids = selected;
    if (ids.size === 0) return;
    if (authed) {
      const targets = rows.filter((r) => ids.has(r.id));
      let ok = 0;
      for (const r of targets) {
        try {
          await rc.remove.mutateAsync({ id: r.id, rowVersion: r.row_version ?? 0 });
          ok++;
        } catch {
          /* keep going */
        }
      }
      if (ok === targets.length) toast.success(`Deleted ${ok} expense${ok === 1 ? "" : "s"}`);
      else toast.error(`Deleted ${ok} of ${targets.length}; some could not be removed`);
    } else {
      setDemoRows((prev) => prev.filter((r) => !ids.has(r.id)));
      toast.success(`Deleted ${ids.size} expense${ids.size === 1 ? "" : "s"}`);
    }
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };

  const pageIds = pageRows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));
  const togglePageAll = (checked: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) pageIds.forEach((id) => n.add(id));
      else pageIds.forEach((id) => n.delete(id));
      return n;
    });
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
      const mapped = mapCsvToImportRows(parsedRows, expenseHeadsResource.importColumns, {
        aliases: EXPENSE_IMPORT_HEADER_ALIASES,
      }).map((rec) => normalizeExpenseImportRow(rec));
      if (authed) {
        if (!rc.perms.canAdd) {
          toast.error("You don't have permission to import expenses");
          return;
        }
        const importRows = mapped.filter((r) => String(r.name || "").trim()) as ImportRow[];
        if (importRows.length === 0) {
          toast.error("No valid rows found");
          return;
        }
        const res = await importExpenseHeadsChunked("COMMIT", importRows);
        const toastRes = formatImportToast(res);
        if (toastRes.ok) toast.success(toastRes.message);
        else toast.error(toastRes.message);
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(expenseHeadsResource.key) });
        return;
      }
      const imported: ExpenseRow[] = [];
      for (const rec of mapped) {
        const name = String(rec.name || "").trim();
        if (!name) continue;
        const kindRaw = String(rec.kind || "Expense").trim().toLowerCase();
        const authRaw = String(rec.authorization_required || "1").trim().toLowerCase();
        imported.push({
          id: crypto.randomUUID(),
          code: String(rec.code || "").trim() || codeFromName(name),
          name,
          kind: kindRaw.startsWith("inc") ? "Income" : "Expense",
          authorizationRequired: !(
            authRaw === "0" ||
            authRaw === "no" ||
            authRaw === "false"
          ),
          authorizedHoAmount: String(rec.authorized_ho_amount || "0"),
          authorizedBranchAmount: String(rec.authorized_branch_amount || "0"),
          documentRequired: true,
          documentRequiredAmount: String(rec.document_required_amount || "0"),
        });
      }
      if (imported.length === 0) {
        toast.error("No valid rows found");
        return;
      }
      setDemoRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters({ name: "", isAuthorized: "" });
    setPage(1);
    if (authed) {
      void queryClient.invalidateQueries({ queryKey: masterKeys.all(expenseHeadsResource.key) });
    }
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Customer", "Expense"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expense</h1>
        <p className="text-sm text-muted-foreground">
          Manage expense heads used across billing, invoicing, and accounting entries.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1">
              <DataIoToolbar
                export={{
                  filename: "expenses",
                  title: "Expenses",
                  columns: [
                    { key: "name", header: "Name" },
                    { key: "isAuthorized", header: "Is Authorized" },
                    { key: "kind", header: "Expense Type" },
                    { key: "authorizedHoAmount", header: "Authorised By HO Amount" },
                    { key: "authorizedBranchAmount", header: "Authorised By Branch Amount" },
                    { key: "documentRequired", header: "Document Required" },
                    { key: "documentRequiredAmount", header: "Document Required For Amount" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      name: r.name,
                      isAuthorized: r.authorizationRequired ? "1" : "0",
                      kind: r.kind,
                      authorizedHoAmount: r.authorizedHoAmount,
                      authorizedBranchAmount: r.authorizedBranchAmount,
                      documentRequired: r.documentRequired ? "Yes" : "No",
                      documentRequiredAmount: r.documentRequiredAmount,
                    })),
                }}
                import={{ onRows: handleImportRows }}
              />
              <IconButton label="Refresh" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            </div>
          </TooltipProvider>
          <div className="flex items-center gap-2">
            {selected.size > 0 && canDelete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
                className="h-9 gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selected.size})
              </Button>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search..."
                className="h-9 w-56 pl-8"
              />
            </div>
            {canAdd && (
              <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="w-10 text-sidebar-foreground">
                  <Checkbox
                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => togglePageAll(v === true)}
                    aria-label="Select all on page"
                    className="border-sidebar-foreground/60 data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary"
                  />
                </TableHead>
                <TableHead className="text-sidebar-foreground">Name</TableHead>
                <TableHead className="text-sidebar-foreground">Is Authorized</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead />
                <TableHead className="py-2">
                  <Input
                    value={colFilters.name}
                    onChange={(e) => {
                      setColFilters((f) => ({ ...f, name: e.target.value }));
                      setPage(1);
                    }}
                    placeholder="Name"
                    className="h-8"
                  />
                </TableHead>
                <TableHead className="py-2">
                  <Input
                    value={colFilters.isAuthorized}
                    onChange={(e) => {
                      setColFilters((f) => ({ ...f, isAuthorized: e.target.value }));
                      setPage(1);
                    }}
                    placeholder="Is Authorized"
                    className="h-8"
                  />
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, v === true)}
                        aria-label={`Select ${r.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.authorizationRequired ? "1" : "0"}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        {canModify && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                            aria-label={`Edit ${r.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(r)}
                            aria-label={`Delete ${r.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Expense" : "Expenses"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <FieldWrapper label="Expense Type" required>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as ExpenseKind }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Expense">Expense</SelectItem>
                  <SelectItem value="Income">Income</SelectItem>
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Expense Head" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Authorisation Required">
              <YesNoToggle
                value={form.authorizationRequired}
                onChange={(v) => setForm((f) => ({ ...f, authorizationRequired: v }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Authorised By HO Amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.authorizedHoAmount}
                onChange={(e) => setForm((f) => ({ ...f, authorizedHoAmount: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Authorised By Branch Amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.authorizedBranchAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, authorizedBranchAmount: e.target.value }))
                }
              />
            </FieldWrapper>
            <FieldWrapper label="Document Required">
              <YesNoToggle
                value={form.documentRequired}
                onChange={(v) => setForm((f) => ({ ...f, documentRequired: v }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Document Required For Amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.documentRequiredAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, documentRequiredAmount: e.target.value }))
                }
              />
            </FieldWrapper>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              Save
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span> from the
              expense master.
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

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} expense{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected expenses from the expense master. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
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
