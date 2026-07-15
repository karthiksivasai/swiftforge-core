import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { BRANCHES } from "@/lib/branches-data";
import { BranchSelect } from "@/components/branch-select";
import { DOMESTIC_DESTINATIONS } from "@/lib/destinations-data";
import { INTERNATIONAL_DESTINATIONS } from "@/lib/destinations-international-data";
import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  destinationsResource,
  type DestinationRow as DestinationDbRow,
} from "@/lib/masters/resources/destinations";
import {
  destinationCreateSchema,
  destinationUpdateSchema,
} from "@/lib/masters/schemas/destinations";
import {
  useMasterList,
  useBranchOptions,
  toErrorMessage,
  importSummary,
} from "@/lib/masters/screen";
import { LookupCombobox, EntityCombobox } from "@/components/masters/lookup-combobox";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { toast } from "sonner";
import { DataIoToolbar } from "@/components/data-io-toolbar";

type DestinationType = "Domestic" | "International" | "Local";
type Status = "Active" | "In-Active";

type Destination = {
  id: string;
  type: DestinationType;
  code: string;
  name: string;
  country: string;
  state: string;
  serviceType: string;
  status: Status;
  email?: string;
  mobile?: string;
  mainBranch?: string;
  zone?: string;
  branchManifest?: string;
  countryId?: string;
  stateId?: string;
  zoneId?: string;
  mainBranchId?: string;
  manifestBranchId?: string;
  row_version?: number;
};

const TYPE_TO_DB: Record<DestinationType, "DOMESTIC" | "INTERNATIONAL" | "LOCAL"> = {
  Domestic: "DOMESTIC",
  International: "INTERNATIONAL",
  Local: "LOCAL",
};
const DB_TO_TYPE: Record<string, DestinationType> = {
  DOMESTIC: "Domestic",
  INTERNATIONAL: "International",
  LOCAL: "Local",
};

const STATES = [
  "Andaman & Nicobar Isands",
  "Andhra Pradesh",
  "Andhra Pradesh (New)",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra & Nagar Heveli",
  "Daman & Diu",
  "Delhi",
  "Goa",
  "GUJARAT",
  "Haryana",
  "Himachal Pradesh",
  "INTERNATIONAL",
  "Jammu & Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Lakshadweep",
  "Madhya Pradesh",
  "MAHARASHTRA",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Orissa",
  "Pondicherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarnchal",
  "West Bengal",
];

const ZONES = [
  "DOMESTIC",
  "INTERNATIONAL",
  "INTERNATIONAL ZONE 1",
  "INTERNATIONAL ZONE 2",
  "INTERNATIONAL ZONE 3",
  "INTERNATIONAL ZONE 4",
  "INTERNATIONAL ZONE 5",
  "INTERNATIONAL ZONE 6",
  "INTERNATIONAL ZONE 6A",
  "INTERNATIONAL ZONE 7",
  "INTERNATIONAL ZONE 7A",
  "INTERNATIONAL ZONE 8",
  "INTERNATIONAL ZONE 9",
  "INTERNATIONAL ZONE 10",
  "INTERNATIONAL ZONE 11",
  "INTERNATIONAL ZONE 12",
  "INTERNATIONAL ZONE 13",
  "INTERNATIONAL ZONE 14",
  "INTERNATIONAL ZONE 15",
  "INTERNATIONAL ZONE 16",
  "INTERNATIONAL ZONE 17",
  "INTERNATIONAL ZONE 18",
  "INTERNATIONAL ZONE AU",
  "INTERNATIONAL ZONE CA",
  "INTERNATIONAL ZONE CZ",
  "INTERNATIONAL ZONE DE",
  "INTERNATIONAL ZONE HU",
  "INTERNATIONAL ZONE NZ",
  "INTERNATIONAL ZONE PL",
  "INTERNATIONAL ZONE RO",
  "INTERNATIONAL ZONE SG",
  "INTERNATIONAL ZONE US",
];

const SERVICE_TYPES = ["REGULAR", "METRO", "REMOTE"];

// Main Branch and Branch Manifest share the same seeded list (from Main_Branch_List.xlsx).
const BRANCH_OPTIONS = BRANCHES.map((b) => b.name);

const SEED: Destination[] = [
  ...DOMESTIC_DESTINATIONS.map((d, i) => ({
    id: `dom-${i + 1}`,
    type: "Domestic" as DestinationType,
    ...d,
  })),
  ...INTERNATIONAL_DESTINATIONS.map((d, i) => ({
    id: `intl-${i + 1}`,
    type: "International" as DestinationType,
    ...d,
  })),
];

const PAGE_SIZE = 10;

export const Route = createFileRoute("/master/sales/destination")({
  head: () => ({
    meta: [
      { title: "Destination — Master — Courier ERP" },
      {
        name: "description",
        content:
          "Manage destination master records for Domestic, International, and Local shipments.",
      },
    ],
  }),
  component: DestinationPage,
});

function emptyForm(type: DestinationType): Omit<Destination, "id"> {
  return {
    type,
    code: "",
    name: "",
    country: type === "Domestic" ? "IN" : "",
    state: "",
    serviceType: "",
    status: "Active",
    email: "",
    mobile: "",
    mainBranch: "",
    zone: "",
    branchManifest: "",
  };
}

function getPageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push("…");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("…");
  items.push(total);
  return items;
}

function rowToView(r: DestinationDbRow & Record<string, unknown>): Destination {
  return {
    id: r.id,
    type: DB_TO_TYPE[r.dest_type] ?? "Domestic",
    code: r.code,
    name: r.name,
    country: (r.country_name as string) ?? "",
    countryId: r.country_id ?? "",
    state: (r.state_name as string) ?? "",
    stateId: r.state_id ?? "",
    zone: (r.zone_name as string) ?? "",
    zoneId: r.zone_id ?? "",
    serviceType: r.service_type ?? "",
    status: r.status === "INACTIVE" ? "In-Active" : "Active",
    email: r.email ?? "",
    mobile: r.mobile ?? "",
    mainBranch: (r.main_branch_name as string) ?? "",
    mainBranchId: r.main_branch_id ?? "",
    branchManifest: (r.manifest_branch_name as string) ?? "",
    manifestBranchId: r.manifest_branch_id ?? "",
    row_version: r.row_version,
  };
}

function DestinationPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(destinationsResource);
  const live = useMasterList(destinationsResource, {
    enabled: authed,
    labelRefs: [
      { idField: "country_id", table: "countries", as: "country" },
      { idField: "state_id", table: "states", as: "state" },
      { idField: "zone_id", table: "zones", as: "zone" },
      { idField: "main_branch_id", table: "branches", as: "main_branch" },
      { idField: "manifest_branch_id", table: "branches", as: "manifest_branch" },
    ],
  });
  const branches = useBranchOptions(authed);
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<Destination[]>(SEED);
  const rows: Destination[] = authed
    ? (live.rows as (DestinationDbRow & Record<string, unknown>)[]).map(rowToView)
    : demoRows;
  const setRows = setDemoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<DestinationType>("Domestic");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Destination | null>(null);
  const [form, setForm] = useState<Omit<Destination, "id">>(emptyForm("Domestic"));
  const [deleteTarget, setDeleteTarget] = useState<Destination | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const scoped = useMemo(() => rows.filter((r) => r.type === type), [rows, type]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((r) =>
      [r.code, r.name, r.country, r.state, r.serviceType, r.status].some((v) =>
        String(v).toLowerCase().includes(q),
      ),
    );
  }, [scoped, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(type));
    setOpen(true);
  };

  const openEdit = (row: Destination) => {
    setEditing(row);
    const { id: _id, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const toRaw = (f: Omit<Destination, "id">) => ({
    dest_type: TYPE_TO_DB[f.type],
    code: f.code,
    name: f.name,
    country_id: f.countryId || null,
    state_id: f.stateId || null,
    zone_id: f.zoneId || null,
    service_type: f.serviceType || null,
    main_branch_id: f.mainBranchId || null,
    manifest_branch_id: f.manifestBranchId || null,
    email: f.email || null,
    mobile: f.mobile || null,
    status: f.status === "In-Active" ? "INACTIVE" : "ACTIVE",
  });

  const handleSave = async () => {
    if (authed) {
      setSaving(true);
      try {
        const raw = toRaw(form);
        if (editing) {
          const patch = destinationUpdateSchema.parse(raw);
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          toast.success("Destination updated");
        } else {
          const values = destinationCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Destination added");
        }
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save destination"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!form.code.trim()) {
      toast.error("Destination Code is required");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Destination Name is required");
      return;
    }
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Destination updated");
    } else {
      const id = crypto.randomUUID();
      setRows((prev) => [{ id, ...form }, ...prev]);
      toast.success("Destination added");
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
        toast.error(toErrorMessage(err, "Could not delete destination"));
      }
    } else {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
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
          /* keep going; report aggregate below */
        }
      }
      if (ok === targets.length) toast.success(`Deleted ${ok} destination${ok === 1 ? "" : "s"}`);
      else toast.error(`Deleted ${ok} of ${targets.length}; some could not be removed`);
    } else {
      setRows((prev) => prev.filter((r) => !ids.has(r.id)));
      toast.success(`Deleted ${ids.size} destination${ids.size === 1 ? "" : "s"}`);
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
    if (authed) {
      const importRows = mapCsvToImportRows(
        parsedRows,
        destinationsResource.importColumns,
      ) as ImportRow[];
      const res = await rc.commitImport.mutateAsync(importRows);
      toast.success(importSummary(res));
      return;
    }
    const imported: Destination[] = [];
    for (const rec of parsedRows) {
      const code = (rec["Destination Code"] ?? rec["code"] ?? "").trim();
      if (!code) continue;
      const status = (rec["Status"] ?? rec["status"] ?? "").trim();
      imported.push({
        id: crypto.randomUUID(),
        type,
        code,
        name: (rec["Destination Name"] ?? rec["name"] ?? "").trim(),
        country: (rec["Country"] ?? rec["country_code"] ?? "").trim(),
        state: (rec["State"] ?? rec["state_code"] ?? "").trim(),
        serviceType: (rec["Service Type"] ?? rec["service_type"] ?? "").trim(),
        status: status === "In-Active" ? "In-Active" : "Active",
      });
    }
    if (imported.length === 0) {
      toast.error("No valid rows found");
      return;
    }
    setRows((prev) => [...imported, ...prev]);
    toast.success(`Imported ${imported.length} destination${imported.length === 1 ? "" : "s"}`);
  };

  const handleRefresh = () => {
    setSearch("");
    setPage(1);
    if (authed)
      queryClient.invalidateQueries({ queryKey: masterKeys.all(destinationsResource.key) });
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">Master</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">Sales</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Destination</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Destination</h1>
        <p className="text-sm text-muted-foreground">
          Manage domestic, international, and local destinations used across bookings and shipments.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Type</Label>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as DestinationType);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Domestic">Domestic</SelectItem>
              <SelectItem value="International">International</SelectItem>
              <SelectItem value="Local">Local</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <DataIoToolbar
                export={{
                  filename: `destinations-${type.toLowerCase()}`,
                  title: `Destinations (${type})`,
                  columns: [
                    { key: "code", header: "Destination Code" },
                    { key: "name", header: "Destination Name" },
                    { key: "country", header: "Country" },
                    { key: "state", header: "State" },
                    { key: "serviceType", header: "Service Type" },
                    { key: "status", header: "Status" },
                  ],
                  getRows: () =>
                    scoped.map((r) => ({
                      code: r.code,
                      name: r.name,
                      country: r.country,
                      state: r.state,
                      serviceType: r.serviceType,
                      status: r.status,
                    })),
                }}
                import={canAdd ? { onRows: handleImportRows } : null}
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
            {canAdd ? (
              <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            ) : null}
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
                <TableHead className="text-sidebar-foreground">Destination Code</TableHead>
                <TableHead className="text-sidebar-foreground">Destination Name</TableHead>
                <TableHead className="text-sidebar-foreground">Country</TableHead>
                <TableHead className="text-sidebar-foreground">State</TableHead>
                <TableHead className="text-sidebar-foreground">Service Type</TableHead>
                <TableHead className="text-sidebar-foreground">Status</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, v === true)}
                        aria-label={`Select ${r.code}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.country}</TableCell>
                    <TableCell>{r.state}</TableCell>
                    <TableCell>{r.serviceType}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        {canModify ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                            aria-label={`Edit ${r.code}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(r)}
                            aria-label={`Delete ${r.code}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            Showing {startIdx} to {endIdx} of {filtered.length} entries
          </span>
          <div className="flex items-center gap-1">
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(1)}>
              <ChevronsLeft className="h-4 w-4" />
            </PagerButton>
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </PagerButton>
            {getPageItems(currentPage, totalPages).map((item, i) =>
              item === "…" ? (
                <span
                  key={`e${i}`}
                  className="h-8 min-w-8 px-2 text-sm text-muted-foreground grid place-items-center"
                >
                  …
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item)}
                  className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors ${
                    item === currentPage
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  {item}
                </button>
              ),
            )}
            <PagerButton
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </PagerButton>
            <PagerButton disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>
              <ChevronsRight className="h-4 w-4" />
            </PagerButton>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Destination" : "Add Destination"}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-6 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as DestinationType }))}
              >
                <SelectTrigger className="h-10 w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Domestic">Domestic</SelectItem>
                  <SelectItem value="International">International</SelectItem>
                  <SelectItem value="Local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <fieldset className="rounded-md border p-4">
              <legend className="rounded bg-sidebar px-2 py-0.5 text-xs font-medium text-sidebar-foreground">
                Destination
              </legend>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="Destination Code" required>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Destination Name" required>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Email">
                  <Input
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Mobile">
                  <Input
                    value={form.mobile ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                  />
                </FieldWrapper>

                <FieldWrapper label="Main Branch">
                  {authed ? (
                    <EntityCombobox
                      items={branches.options}
                      value={form.mainBranchId ?? ""}
                      valueLabel={form.mainBranch}
                      loading={branches.isLoading}
                      onChange={(id, item) =>
                        setForm((f) => ({ ...f, mainBranchId: id, mainBranch: item?.name ?? "" }))
                      }
                      placeholder="Select Main Branch"
                    />
                  ) : (
                    <BranchSelect
                      value={form.mainBranch}
                      onChange={(v) => setForm((f) => ({ ...f, mainBranch: v }))}
                      options={BRANCH_OPTIONS}
                      placeholder="Select Main Branch"
                    />
                  )}
                </FieldWrapper>

                <FieldWrapper label="State">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="state"
                      value={form.stateId ?? ""}
                      valueLabel={form.state}
                      onChange={(id, item) =>
                        setForm((f) => ({ ...f, stateId: id, state: item?.name ?? "" }))
                      }
                      placeholder="Select State"
                    />
                  ) : (
                    <Select
                      value={form.state || undefined}
                      onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select State" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FieldWrapper>

                <FieldWrapper label="Zone">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="zone"
                      value={form.zoneId ?? ""}
                      valueLabel={form.zone}
                      onChange={(id, item) =>
                        setForm((f) => ({ ...f, zoneId: id, zone: item?.name ?? "" }))
                      }
                      placeholder="Select Zone"
                    />
                  ) : (
                    <Select
                      value={form.zone || undefined}
                      onValueChange={(v) => setForm((f) => ({ ...f, zone: v }))}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select Zone" />
                      </SelectTrigger>
                      <SelectContent>
                        {ZONES.map((z) => (
                          <SelectItem key={z} value={z}>
                            {z}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FieldWrapper>

                <FieldWrapper label="Service Type">
                  <Select
                    value={form.serviceType || undefined}
                    onValueChange={(v) => setForm((f) => ({ ...f, serviceType: v }))}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select Service" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>

                <FieldWrapper label="Branch Manifest">
                  {authed ? (
                    <EntityCombobox
                      items={branches.options}
                      value={form.manifestBranchId ?? ""}
                      valueLabel={form.branchManifest}
                      loading={branches.isLoading}
                      onChange={(id, item) =>
                        setForm((f) => ({
                          ...f,
                          manifestBranchId: id,
                          branchManifest: item?.name ?? "",
                        }))
                      }
                      placeholder="Select Manifest Branch"
                    />
                  ) : (
                    <BranchSelect
                      value={form.branchManifest}
                      onChange={(v) => setForm((f) => ({ ...f, branchManifest: v }))}
                      options={BRANCH_OPTIONS}
                      placeholder="Select Manifest Branch"
                    />
                  )}
                </FieldWrapper>

                <FieldWrapper label="Status">
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="In-Active">In-Active</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldWrapper>
              </div>
            </fieldset>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete destination?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the destination master.
              This action cannot be undone.
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
              Delete {selected.size} destination{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected destinations from the destination master.
              This action cannot be undone.
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

function FieldWrapper({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 bg-background"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PagerButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function BranchCombobox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Search branch..." />
          <CommandList className="max-h-72 overflow-y-auto overscroll-contain">
            <CommandEmpty>No branch found.</CommandEmpty>
            <CommandGroup>
              {BRANCH_OPTIONS.map((b) => (
                <CommandItem
                  key={b}
                  value={b}
                  onSelect={() => {
                    onChange(b);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === b ? "opacity-100" : "opacity-0")}
                  />
                  {b}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
