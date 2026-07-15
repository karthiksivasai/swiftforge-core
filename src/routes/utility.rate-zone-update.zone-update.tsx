import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Download, Plus, Search } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import type { LookupKey, LookupOption } from "@/lib/master-lookups";
import { toErrorMessage } from "@/lib/masters/screen";
import { createZoneUpdateJob, executeZoneUpdateJob } from "@/lib/zone-update/resources";
import type { ZoneUpdateFilters } from "@/lib/zone-update/types";

type LookupPair = { code: string; name: string };
type LookupField =
  | "vendor"
  | "product"
  | "origin"
  | "zone"
  | "country"
  | "destination"
  | "customer"
  | "service"
  | "branch";
type ZoneMode = "export" | "import" | "update";

type ExportForm = {
  exportType: string;
  vendor: LookupPair;
  date: string;
  product: LookupPair;
  origin: LookupPair;
  zone: LookupPair;
  country: LookupPair;
  destination: LookupPair;
  customer: LookupPair;
  service: LookupPair;
};

type ImportForm = {
  importType: string;
  date: string;
  fileName: string;
};

type ZoneUpdateForm = {
  date: string;
  origin: LookupPair;
  vendor: LookupPair;
  service: LookupPair;
  product: LookupPair;
  country: LookupPair;
  destination: LookupPair;
  zone: LookupPair;
};

type ShipmentZoneForm = {
  fromDate: string;
  toDate: string;
  branch: LookupPair;
  customer: LookupPair;
  product: LookupPair;
  destination: LookupPair;
  zone: LookupPair;
  rerateAfterUpdate: boolean;
  addToJobQueue: boolean;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyExportForm = (): ExportForm => ({
  exportType: "Domestic",
  vendor: emptyPair(),
  date: todayIso(),
  product: emptyPair(),
  origin: emptyPair(),
  zone: emptyPair(),
  country: emptyPair(),
  destination: emptyPair(),
  customer: emptyPair(),
  service: emptyPair(),
});

const emptyImportForm = (): ImportForm => ({
  importType: "Zone Updation",
  date: todayIso(),
  fileName: "",
});

const emptyZoneUpdateForm = (): ZoneUpdateForm => ({
  date: todayIso(),
  origin: emptyPair(),
  vendor: emptyPair(),
  service: emptyPair(),
  product: emptyPair(),
  country: emptyPair(),
  destination: emptyPair(),
  zone: emptyPair(),
});

const emptyShipmentZoneForm = (): ShipmentZoneForm => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  branch: emptyPair(),
  customer: emptyPair(),
  product: emptyPair(),
  destination: emptyPair(),
  zone: emptyPair(),
  rerateAfterUpdate: false,
  addToJobQueue: false,
});

export const Route = createFileRoute("/utility/rate-zone-update/zone-update")({
  head: () => ({
    meta: [
      { title: "Zone Update — Utility — Courier ERP" },
      { name: "description", content: "Export, import, and update shipment zones." },
    ],
  }),
  component: ZoneUpdatePage,
});

function ZoneUpdatePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ZoneMode>("update");
  const [exportForm, setExportForm] = useState<ExportForm>(emptyExportForm);
  const [importForm, setImportForm] = useState<ImportForm>(emptyImportForm);
  const [shipmentForm, setShipmentForm] = useState<ShipmentZoneForm>(emptyShipmentZoneForm);
  const [addOpen, setAddOpen] = useState(false);
  const [zoneForm, setZoneForm] = useState<ZoneUpdateForm>(emptyZoneUpdateForm);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupField | null>(null);
  const [lookupTarget, setLookupTarget] = useState<"export" | "add" | "update">("update");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const patchExport = (updates: Partial<ExportForm>) =>
    setExportForm((current) => ({ ...current, ...updates }));
  const patchImport = (updates: Partial<ImportForm>) =>
    setImportForm((current) => ({ ...current, ...updates }));
  const patchZone = (updates: Partial<ZoneUpdateForm>) =>
    setZoneForm((current) => ({ ...current, ...updates }));
  const patchShipment = (updates: Partial<ShipmentZoneForm>) =>
    setShipmentForm((current) => ({ ...current, ...updates }));

  const openLookup = (
    target: "export" | "add" | "update",
    field: LookupField,
    lookup: LookupKey,
  ) => {
    setLookupTarget(target);
    setLookupField(field);
    setLookupOpen(lookup);
  };

  const handleLookupSelect = (_value: string, option: LookupOption) => {
    if (!lookupField) return;
    const pair = { code: option.code, name: option.name };
    if (lookupTarget === "export") patchExport({ [lookupField]: pair });
    else if (lookupTarget === "add") patchZone({ [lookupField]: pair });
    else patchShipment({ [lookupField]: pair });
    setLookupOpen(null);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    patchImport({ fileName: event.target.files?.[0]?.name ?? "" });
  };

  const resetImport = () => {
    setImportForm(emptyImportForm());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleShipmentOk = async () => {
    if (!shipmentForm.fromDate || !shipmentForm.toDate) {
      return toast.error("Date range is required");
    }

    const filters: ZoneUpdateFilters = {
      from_date: shipmentForm.fromDate,
      to_date: shipmentForm.toDate,
      customer_code: shipmentForm.customer.code.trim() || null,
      product_code: shipmentForm.product.code.trim() || null,
      destination_code: shipmentForm.destination.code.trim() || null,
      branch_code: shipmentForm.branch.code.trim() || null,
      zone_code: shipmentForm.zone.code.trim() || null,
    };

    setBusy(true);
    try {
      const job = await createZoneUpdateJob({
        filters,
        rerateAfterUpdate: shipmentForm.rerateAfterUpdate,
      });
      if (shipmentForm.addToJobQueue) {
        toast.success("Zone update job queued");
        void navigate({ to: "/utility/rate-zone-update/zone-update-jobs" });
        return;
      }
      const result = await executeZoneUpdateJob(job.id);
      toast.success(
        `Updated ${result.updated_shipments}, skipped ${result.skipped_shipments}, failed ${result.failed_shipments}`,
      );
      void navigate({ to: "/utility/rate-zone-update/zone-update-jobs" });
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Rate / Zone Update", "Zone Update"]} />

      <Card className="min-w-0 border p-4">
        {mode === "import" ? (
          <button
            type="button"
            onClick={() => toast.success("Zone update Excel format download started")}
            className="mb-2 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Click Here To Download Excel File Format
          </button>
        ) : null}

        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <TabButton active={mode === "update"} onClick={() => setMode("update")}>
              Update Shipments
            </TabButton>
            <TabButton active={mode === "export"} onClick={() => setMode("export")}>
              Export
            </TabButton>
            <TabButton active={mode === "import"} onClick={() => setMode("import")}>
              Import
            </TabButton>
          </div>
          <Button
            onClick={() => {
              setZoneForm(emptyZoneUpdateForm());
              setAddOpen(true);
            }}
            className="h-8 gap-1.5 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          >
            <Plus className="h-4 w-4" />
            Add Mapping
          </Button>
        </div>

        {mode === "export" ? (
          <ExportPanel
            form={exportForm}
            patch={patchExport}
            onLookupOpen={(field, lookup) => openLookup("export", field, lookup)}
          />
        ) : mode === "import" ? (
          <ImportPanel
            form={importForm}
            patch={patchImport}
            fileInputRef={fileInputRef}
            onFile={handleFile}
            onReset={resetImport}
          />
        ) : (
          <ShipmentUpdatePanel
            form={shipmentForm}
            patch={patchShipment}
            busy={busy}
            onOk={() => void handleShipmentOk()}
            onLookupOpen={(field, lookup) => openLookup("update", field, lookup)}
          />
        )}
      </Card>

      <AddUpdateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        form={zoneForm}
        patch={patchZone}
        onLookupOpen={(field, lookup) => openLookup("add", field, lookup)}
      />

      <MasterLookupDialog
        open={lookupOpen !== null}
        lookup={lookupOpen ?? "customer"}
        onOpenChange={(open) => {
          if (!open) setLookupOpen(null);
        }}
        onSelect={handleLookupSelect}
      />
    </div>
  );
}

function ShipmentUpdatePanel({
  form,
  patch,
  busy,
  onOk,
  onLookupOpen,
}: {
  form: ShipmentZoneForm;
  patch: (updates: Partial<ShipmentZoneForm>) => void;
  busy: boolean;
  onOk: () => void;
  onLookupOpen: (field: LookupField, lookup: LookupKey) => void;
}) {
  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        Resolves each shipment zone via existing zone mappings. Locked / invoiced / cancelled AWBs
        and unchanged zones are skipped.
      </p>
      <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
        <FieldWrapper label="From Date" required>
          <Input
            type="date"
            value={form.fromDate}
            onChange={(event) => patch({ fromDate: event.target.value })}
            className="h-9"
          />
        </FieldWrapper>
        <FieldWrapper label="To Date" required>
          <Input
            type="date"
            value={form.toDate}
            onChange={(event) => patch({ toDate: event.target.value })}
            className="h-9"
          />
        </FieldWrapper>
        <FieldWrapper label="Branch">
          <LookupPairInput
            value={form.branch}
            onChange={(branch) => patch({ branch })}
            onLookupOpen={() => onLookupOpen("branch", "serviceCentre")}
          />
        </FieldWrapper>
        <FieldWrapper label="Customer">
          <LookupPairInput
            value={form.customer}
            onChange={(customer) => patch({ customer })}
            onLookupOpen={() => onLookupOpen("customer", "customer")}
          />
        </FieldWrapper>
        <FieldWrapper label="Product">
          <LookupPairInput
            value={form.product}
            onChange={(product) => patch({ product })}
            onLookupOpen={() => onLookupOpen("product", "product")}
          />
        </FieldWrapper>
        <FieldWrapper label="Destination">
          <LookupPairInput
            value={form.destination}
            onChange={(destination) => patch({ destination })}
            onLookupOpen={() => onLookupOpen("destination", "destination")}
          />
        </FieldWrapper>
        <FieldWrapper label="Current Zone">
          <LookupPairInput
            value={form.zone}
            onChange={(zone) => patch({ zone })}
            onLookupOpen={() => onLookupOpen("zone", "zone")}
          />
        </FieldWrapper>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-red-500">Note : Data Update Limit - 92 Days</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            to="/utility/rate-zone-update/zone-update-jobs"
            className="text-sm font-semibold text-blue-700 underline"
          >
            Click Here Open Job Queue
          </Link>
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
            <Checkbox
              checked={form.rerateAfterUpdate}
              onCheckedChange={(value) => patch({ rerateAfterUpdate: Boolean(value) })}
            />
            Recalculate Rating After Zone Update
          </label>
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
            <Checkbox
              checked={form.addToJobQueue}
              onCheckedChange={(value) => patch({ addToJobQueue: Boolean(value) })}
            />
            Add to Job Queue
          </label>
          <Button
            disabled={busy}
            onClick={onOk}
            className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
          >
            Ok
          </Button>
          <Button
            onClick={() => patch(emptyShipmentZoneForm())}
            className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
          >
            Reset
          </Button>
        </div>
      </div>
    </>
  );
}

function ExportPanel({
  form,
  patch,
  onLookupOpen,
}: {
  form: ExportForm;
  patch: (updates: Partial<ExportForm>) => void;
  onLookupOpen: (field: LookupField, lookup: LookupKey) => void;
}) {
  return (
    <>
      <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
        <SelectField
          label="Export Type"
          value={form.exportType}
          options={["Domestic", "International"]}
          onChange={(exportType) => patch({ exportType })}
        />
        <FieldWrapper label="Vendor">
          <LookupPairInput
            value={form.vendor}
            onChange={(vendor) => patch({ vendor })}
            onLookupOpen={() => onLookupOpen("vendor", "vendor")}
          />
        </FieldWrapper>
        <FieldWrapper label="Date">
          <Input
            type="date"
            value={form.date}
            onChange={(event) => patch({ date: event.target.value })}
            className="h-9"
          />
        </FieldWrapper>
        <FieldWrapper label="Product">
          <LookupPairInput
            value={form.product}
            onChange={(product) => patch({ product })}
            onLookupOpen={() => onLookupOpen("product", "product")}
          />
        </FieldWrapper>
        <FieldWrapper label="Origin">
          <LookupPairInput
            value={form.origin}
            onChange={(origin) => patch({ origin })}
            onLookupOpen={() => onLookupOpen("origin", "serviceCentre")}
          />
        </FieldWrapper>
        <FieldWrapper label="Zone">
          <LookupPairInput
            value={form.zone}
            onChange={(zone) => patch({ zone })}
            onLookupOpen={() => onLookupOpen("zone", "zone")}
          />
        </FieldWrapper>
        <FieldWrapper label="Country">
          <LookupPairInput
            value={form.country}
            onChange={(country) => patch({ country })}
            onLookupOpen={() => onLookupOpen("country", "country")}
          />
        </FieldWrapper>
        <FieldWrapper label="Destination">
          <LookupPairInput
            value={form.destination}
            onChange={(destination) => patch({ destination })}
            onLookupOpen={() => onLookupOpen("destination", "destination")}
          />
        </FieldWrapper>
        <FieldWrapper label="Customer">
          <LookupPairInput
            value={form.customer}
            onChange={(customer) => patch({ customer })}
            onLookupOpen={() => onLookupOpen("customer", "customer")}
          />
        </FieldWrapper>
        <FieldWrapper label="Service">
          <LookupPairInput
            value={form.service}
            onChange={(service) => patch({ service })}
            onLookupOpen={() => onLookupOpen("service", "serviceType")}
          />
        </FieldWrapper>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          onClick={() => toast.success("Zone export search started")}
          className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
        >
          Search
        </Button>
        <Button
          onClick={() => patch(emptyExportForm())}
          className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
        >
          Reset
        </Button>
      </div>
    </>
  );
}

function ImportPanel({
  form,
  patch,
  fileInputRef,
  onFile,
  onReset,
}: {
  form: ImportForm;
  patch: (updates: Partial<ImportForm>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}) {
  return (
    <>
      <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
        <SelectField
          label="Import Type"
          value={form.importType}
          options={["Zone Updation"]}
          onChange={(importType) => patch({ importType })}
        />
        <FieldWrapper label="Date">
          <Input
            type="date"
            value={form.date}
            onChange={(event) => patch({ date: event.target.value })}
            className="h-9"
          />
        </FieldWrapper>
        <FieldWrapper label="Select File">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={onFile}
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 px-6"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose
            </Button>
            <span className="truncate text-xs text-muted-foreground">
              {form.fileName || "No file selected"}
            </span>
          </div>
        </FieldWrapper>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          onClick={() =>
            form.fileName
              ? toast.success("Zone update import started")
              : toast.error("Please select import file")
          }
          className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
        >
          Import
        </Button>
        <Button
          onClick={onReset}
          className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
        >
          Reset
        </Button>
      </div>
    </>
  );
}

function AddUpdateDialog({
  open,
  onOpenChange,
  form,
  patch,
  onLookupOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ZoneUpdateForm;
  patch: (updates: Partial<ZoneUpdateForm>) => void;
  onLookupOpen: (field: LookupField, lookup: LookupKey) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="bg-sidebar px-4 py-3 text-sidebar-foreground">
          <DialogTitle className="text-sm">Add/Update</DialogTitle>
        </DialogHeader>
        <div className="grid gap-x-3 gap-y-2 p-4 lg:grid-cols-3">
          <FieldWrapper label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={(event) => patch({ date: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>
          <FieldWrapper label="Origin" required>
            <LookupPairInput
              value={form.origin}
              onChange={(origin) => patch({ origin })}
              onLookupOpen={() => onLookupOpen("origin", "serviceCentre")}
            />
          </FieldWrapper>
          <FieldWrapper label="Vendor">
            <LookupPairInput
              value={form.vendor}
              onChange={(vendor) => patch({ vendor })}
              onLookupOpen={() => onLookupOpen("vendor", "vendor")}
            />
          </FieldWrapper>
          <FieldWrapper label="Service">
            <LookupPairInput
              value={form.service}
              onChange={(service) => patch({ service })}
              onLookupOpen={() => onLookupOpen("service", "serviceType")}
            />
          </FieldWrapper>
          <FieldWrapper label="Product">
            <LookupPairInput
              value={form.product}
              onChange={(product) => patch({ product })}
              onLookupOpen={() => onLookupOpen("product", "product")}
            />
          </FieldWrapper>
          <FieldWrapper label="Country">
            <LookupPairInput
              value={form.country}
              onChange={(country) => patch({ country })}
              onLookupOpen={() => onLookupOpen("country", "country")}
            />
          </FieldWrapper>
          <FieldWrapper label="Destination">
            <LookupPairInput
              value={form.destination}
              onChange={(destination) => patch({ destination })}
              onLookupOpen={() => onLookupOpen("destination", "destination")}
            />
          </FieldWrapper>
          <FieldWrapper label="Zone">
            <LookupPairInput
              value={form.zone}
              onChange={(zone) => patch({ zone })}
              onLookupOpen={() => onLookupOpen("zone", "zone")}
            />
          </FieldWrapper>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <Button
            onClick={() => {
              toast.success("Zone saved");
              onOpenChange(false);
            }}
            className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
          >
            Save
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LookupPairInput({
  value,
  onChange,
  onLookupOpen,
}: {
  value: LookupPair;
  onChange: (value: LookupPair) => void;
  onLookupOpen: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Input
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        className="min-w-0 flex-1"
      />
      <Input
        value={value.code}
        onChange={(event) => onChange({ ...value, code: event.target.value })}
        className="w-20"
      />
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
        onClick={onLookupOpen}
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <FieldWrapper label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className={`h-8 ${active ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
