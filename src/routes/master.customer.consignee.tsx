import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
  StatusPill,
  TablePager,
} from "@/components/master-table-kit";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupKey } from "@/lib/master-lookups";
import { LookupCombobox } from "@/components/masters/lookup-combobox";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  consigneesResource,
  type ConsigneeRow as ConsigneeDbRow,
} from "@/lib/masters/resources/consignees";
import { consigneeCreateSchema, consigneeUpdateSchema } from "@/lib/masters/schemas/consignees";
import { useMasterList, toErrorMessage, importSummary } from "@/lib/masters/screen";

type Status = "Active" | "In-Active";

type ConsigneeRow = {
  id: string;
  code: string;
  name: string;
  customer: string;
  customerId: string;
  mobile: string;
  email: string;
  address: string;
  pinCode: string;
  city: string;
  state: string;
  country: string;
  status: Status;
  stateId: string;
  countryId: string;
  row_version?: number;
};

type ConsigneeForm = Omit<ConsigneeRow, "id" | "row_version">;

const emptyForm = (): ConsigneeForm => ({
  code: "",
  name: "",
  customer: "",
  customerId: "",
  mobile: "",
  email: "",
  address: "",
  pinCode: "",
  city: "",
  state: "",
  country: "India",
  status: "Active",
  stateId: "",
  countryId: "",
});

function rowToView(r: ConsigneeDbRow & Record<string, unknown>): ConsigneeRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    customer: (r.customer_name as string) ?? (r.customer as string) ?? "",
    customerId: r.customer_id ?? "",
    mobile: r.mobile,
    email: r.email ?? "",
    address: r.address ?? "",
    pinCode: r.pin_code ?? "",
    city: r.city ?? "",
    state: (r.state_name as string) ?? "",
    country: (r.country_name as string) ?? "",
    status: r.status === "INACTIVE" ? "In-Active" : "Active",
    stateId: r.state_id ?? "",
    countryId: r.country_id ?? "",
    row_version: r.row_version,
  };
}

function toRaw(form: ConsigneeForm) {
  return {
    code: form.code,
    name: form.name,
    customer_id: form.customerId || null,
    customer_name: form.customer || null,
    mobile: form.mobile,
    email: form.email || null,
    address: form.address || null,
    pin_code: form.pinCode || null,
    city: form.city || null,
    state_id: form.stateId || null,
    country_id: form.countryId || null,
    status: form.status === "In-Active" ? "INACTIVE" : "ACTIVE",
  };
}

export const Route = createFileRoute("/master/customer/consignee")({
  head: () => ({
    meta: [
      { title: "Consignee — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage consignee (receiver) directory with contact and delivery address details.",
      },
    ],
  }),
  component: ConsigneePage,
});

function ConsigneePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(consigneesResource);
  const live = useMasterList(consigneesResource, {
    enabled: authed,
    labelRefs: [
      { idField: "state_id", table: "states", as: "state" },
      { idField: "country_id", table: "countries", as: "country" },
      { idField: "customer_id", table: "customers", as: "customer" },
    ],
  });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<ConsigneeRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    code: "",
    name: "",
    customer: "",
    mobile: "",
    city: "",
    status: "",
  });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ConsigneeRow | null>(null);
  const [form, setForm] = useState<ConsigneeForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ConsigneeRow | null>(null);
  const [saving, setSaving] = useState(false);

  const rows: ConsigneeRow[] = authed ? (live.rows as ConsigneeDbRow[]).map(rowToView) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        ![r.code, r.name, r.customer, r.mobile, r.email, r.city, r.state, r.status].some((v) =>
          String(v).toLowerCase().includes(q),
        )
      )
        return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase()))
        return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase()))
        return false;
      if (
        colFilters.customer &&
        !r.customer.toLowerCase().includes(colFilters.customer.toLowerCase())
      )
        return false;
      if (colFilters.mobile && !r.mobile.toLowerCase().includes(colFilters.mobile.toLowerCase()))
        return false;
      if (colFilters.city && !r.city.toLowerCase().includes(colFilters.city.toLowerCase()))
        return false;
      if (colFilters.status && !r.status.toLowerCase().includes(colFilters.status.toLowerCase()))
        return false;
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

  const openEdit = (row: ConsigneeRow) => {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = async () => {
    const raw = toRaw(form);
    if (authed) {
      setSaving(true);
      try {
        if (editing) {
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch: consigneeUpdateSchema.parse(raw),
          });
          toast.success("Consignee updated");
        } else {
          await rc.create.mutateAsync(consigneeCreateSchema.parse(raw));
          toast.success("Consignee added");
        }
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save consignee"));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!form.code.trim()) return toast.error("Consignee Code is required");
    if (!form.name.trim()) return toast.error("Consignee Name is required");
    if (!form.mobile.trim()) return toast.error("Mobile is required");
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Consignee updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Consignee added");
    }
    setOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.code}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete consignee"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
      if (authed) {
        const importRows = mapCsvToImportRows(
          parsedRows,
          consigneesResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        toast.success(importSummary(res));
        return;
      }
      const imported: ConsigneeRow[] = [];
      for (const rec of mapCsvToImportRows(parsedRows, consigneesResource.importColumns)) {
        if (!rec.code?.trim()) continue;
        const status =
          (rec.status || "").trim().toLowerCase() === "in-active" ? "In-Active" : "Active";
        imported.push({
          id: crypto.randomUUID(),
          code: rec.code.trim(),
          name: (rec.name || "").trim(),
          customer: (rec.customer || rec.customer_name || "").trim(),
          customerId: "",
          mobile: (rec.mobile || "").trim(),
          email: (rec.email || "").trim(),
          address: (rec.address || "").trim(),
          pinCode: (rec.pin_code || rec.pincode || "").trim(),
          city: (rec.city || "").trim(),
          state: (rec.state || rec.state_code || "").trim(),
          country: (rec.country || rec.country_code || "India").trim(),
          status: status as Status,
          stateId: "",
          countryId: "",
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
    setColFilters({ code: "", name: "", customer: "", mobile: "", city: "", status: "" });
    setPage(1);
    if (authed) {
      void queryClient.invalidateQueries({ queryKey: masterKeys.all(consigneesResource.key) });
    }
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Customer", "Consignee"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Consignee</h1>
        <p className="text-sm text-muted-foreground">
          Manage consignee (receiver) directory with contact details and delivery address.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <DataIoToolbar
                export={{
                  filename: "consignees",
                  title: "Consignees",
                  columns: [
                    { key: "code", header: "Code" },
                    { key: "name", header: "Name" },
                    { key: "customer", header: "Customer" },
                    { key: "mobile", header: "Mobile" },
                    { key: "email", header: "Email" },
                    { key: "address", header: "Address" },
                    { key: "pinCode", header: "PinCode" },
                    { key: "city", header: "City" },
                    { key: "state", header: "State" },
                    { key: "country", header: "Country" },
                    { key: "status", header: "Status" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      code: r.code,
                      name: r.name,
                      customer: r.customer,
                      mobile: r.mobile,
                      email: r.email,
                      address: r.address,
                      pinCode: r.pinCode,
                      city: r.city,
                      state: r.state,
                      country: r.country,
                      status: r.status,
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
                <TableHead className="text-sidebar-foreground">Code</TableHead>
                <TableHead className="text-sidebar-foreground">Consignee Name</TableHead>
                <TableHead className="text-sidebar-foreground">Customer</TableHead>
                <TableHead className="text-sidebar-foreground">Mobile</TableHead>
                <TableHead className="text-sidebar-foreground">City</TableHead>
                <TableHead className="text-sidebar-foreground">Status</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(["code", "name", "customer", "mobile", "city", "status"] as const).map((k) => (
                  <TableHead key={k} className="py-2">
                    <Input
                      value={colFilters[k]}
                      onChange={(e) => {
                        setColFilters((f) => ({ ...f, [k]: e.target.value }));
                        setPage(1);
                      }}
                      placeholder={k[0].toUpperCase() + k.slice(1)}
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
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.customer}</TableCell>
                    <TableCell>{r.mobile}</TableCell>
                    <TableCell>{r.city}</TableCell>
                    <TableCell>
                      <StatusPill status={r.status} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        {canModify && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                            aria-label={`Edit ${r.code}`}
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
                            aria-label={`Delete ${r.code}`}
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
            <DialogTitle>{editing ? "Edit Consignee" : "Consignee Details"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-3">
            <FieldWrapper label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. CN001"
              />
            </FieldWrapper>
            <FieldWrapper label="Consignee Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Customer">
              {authed ? (
                <LookupCombobox
                  lookupKey="customer"
                  value={form.customerId ?? ""}
                  valueLabel={form.customer}
                  onChange={(id, item) =>
                    setForm((f) => ({
                      ...f,
                      customerId: id,
                      customer: item?.name ?? "",
                    }))
                  }
                  placeholder="Search customer..."
                />
              ) : (
                <LookupInput
                  lookup="serviceCentre"
                  value={form.customer}
                  onChange={(v) => setForm((f) => ({ ...f, customer: v }))}
                />
              )}
            </FieldWrapper>
            <FieldWrapper label="Mobile" required>
              <Input
                value={form.mobile}
                onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Pin Code">
              {authed ? (
                <Input
                  value={form.pinCode}
                  onChange={(e) => setForm((f) => ({ ...f, pinCode: e.target.value }))}
                />
              ) : (
                <LookupInput
                  lookup="pinCode"
                  returnField="code"
                  value={form.pinCode}
                  onChange={(v) => setForm((f) => ({ ...f, pinCode: v }))}
                />
              )}
            </FieldWrapper>
            <FieldWrapper label="City">
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="State">
              {authed ? (
                <LookupCombobox
                  lookupKey="state"
                  value={form.stateId ?? ""}
                  valueLabel={form.state}
                  onChange={(id, item) =>
                    setForm((f) => ({
                      ...f,
                      stateId: id,
                      state: item?.name ?? "",
                    }))
                  }
                  placeholder="Search state..."
                />
              ) : (
                <LookupInput
                  lookup="state"
                  value={form.state}
                  onChange={(v) => setForm((f) => ({ ...f, state: v }))}
                />
              )}
            </FieldWrapper>
            <FieldWrapper label="Country">
              {authed ? (
                <LookupCombobox
                  lookupKey="country"
                  value={form.countryId ?? ""}
                  valueLabel={form.country}
                  onChange={(id, item) =>
                    setForm((f) => ({
                      ...f,
                      countryId: id,
                      country: item?.name ?? "",
                    }))
                  }
                  placeholder="Search country..."
                />
              ) : (
                <LookupInput
                  lookup="country"
                  value={form.country}
                  onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                />
              )}
            </FieldWrapper>
            <FieldWrapper label="Address" className="md:col-span-3">
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="In-Active">In-Active</SelectItem>
                </SelectContent>
              </Select>
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
            <AlertDialogTitle>Delete consignee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the consignee master.
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

function LookupInput({
  value,
  onChange,
  lookup,
  returnField = "name",
}: {
  value: string;
  onChange: (v: string) => void;
  lookup: LookupKey;
  returnField?: "code" | "name" | "code-name";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <MasterLookupDialog
        open={open}
        onOpenChange={setOpen}
        lookup={lookup}
        returnField={returnField}
        onSelect={(v) => onChange(v)}
      />
    </div>
  );
}
