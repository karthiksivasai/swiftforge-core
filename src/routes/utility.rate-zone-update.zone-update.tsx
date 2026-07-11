import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, Search } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };
type LookupField = "origin" | "customer" | "vendor" | "zone" | "service" | "country" | "product" | "destination";
type ZoneMode = "export" | "import";

type ExportForm = {
  exportType: string;
  origin: LookupPair;
  customer: LookupPair;
  vendor: LookupPair;
  zone: LookupPair;
  service: LookupPair;
  date: string;
  country: LookupPair;
  product: LookupPair;
  destination: LookupPair;
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

const emptyPair = (): LookupPair => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyExportForm = (): ExportForm => ({
  exportType: "Domestic",
  origin: emptyPair(),
  customer: emptyPair(),
  vendor: emptyPair(),
  zone: emptyPair(),
  service: emptyPair(),
  date: "",
  country: emptyPair(),
  product: emptyPair(),
  destination: emptyPair(),
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

export const Route = createFileRoute("/utility/rate-zone-update/zone-update")({
  head: () => ({
    meta: [
      { title: "Zone Update — Utility — Courier ERP" },
      { name: "description", content: "Export, import, and update zone mappings." },
    ],
  }),
  component: ZoneUpdatePage,
});

function ZoneUpdatePage() {
  const [mode, setMode] = useState<ZoneMode>("export");
  const [exportForm, setExportForm] = useState<ExportForm>(emptyExportForm);
  const [importForm, setImportForm] = useState<ImportForm>(emptyImportForm);
  const [addOpen, setAddOpen] = useState(false);
  const [zoneForm, setZoneForm] = useState<ZoneUpdateForm>(emptyZoneUpdateForm);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupField | null>(null);
  const [lookupTarget, setLookupTarget] = useState<"export" | "add">("export");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const patchExport = (updates: Partial<ExportForm>) => setExportForm((current) => ({ ...current, ...updates }));
  const patchImport = (updates: Partial<ImportForm>) => setImportForm((current) => ({ ...current, ...updates }));
  const patchZone = (updates: Partial<ZoneUpdateForm>) => setZoneForm((current) => ({ ...current, ...updates }));

  const openLookup = (target: "export" | "add", field: LookupField, lookup: LookupKey) => {
    setLookupTarget(target);
    setLookupField(field);
    setLookupOpen(lookup);
  };

  const handleLookupSelect = (option: LookupOption) => {
    if (!lookupField) return;
    const pair = { code: option.code, name: option.name };
    if (lookupTarget === "export") patchExport({ [lookupField]: pair });
    else patchZone({ [lookupField]: pair });
    setLookupOpen(null);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    patchImport({ fileName: event.target.files?.[0]?.name ?? "" });
  };

  const resetImport = () => {
    setImportForm(emptyImportForm());
    if (fileInputRef.current) fileInputRef.current.value = "";
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
            <TabButton active={mode === "export"} onClick={() => setMode("export")}>Export</TabButton>
            <TabButton active={mode === "import"} onClick={() => setMode("import")}>Import</TabButton>
          </div>
          <Button onClick={() => { setZoneForm(emptyZoneUpdateForm()); setAddOpen(true); }} className="h-8 gap-1.5 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {mode === "export" ? (
          <ExportPanel
            form={exportForm}
            patch={patchExport}
            onLookupOpen={(field, lookup) => openLookup("export", field, lookup)}
          />
        ) : (
          <ImportPanel
            form={importForm}
            patch={patchImport}
            fileInputRef={fileInputRef}
            onFile={handleFile}
            onReset={resetImport}
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
        <SelectField label="Export Type" value={form.exportType} options={["Domestic", "International"]} onChange={(exportType) => patch({ exportType })} />
        <FieldWrapper label="Vendor">
          <LookupPairInput value={form.vendor} onChange={(vendor) => patch({ vendor })} onLookupOpen={() => onLookupOpen("vendor", "vendor")} />
        </FieldWrapper>
        <FieldWrapper label="Date">
          <Input type="date" value={form.date} onChange={(event) => patch({ date: event.target.value })} className="h-9" />
        </FieldWrapper>
        <FieldWrapper label="Product">
          <LookupPairInput value={form.product} onChange={(product) => patch({ product })} onLookupOpen={() => onLookupOpen("product", "product")} />
        </FieldWrapper>

        <FieldWrapper label="Origin">
          <LookupPairInput value={form.origin} onChange={(origin) => patch({ origin })} onLookupOpen={() => onLookupOpen("origin", "serviceCentre")} />
        </FieldWrapper>
        <FieldWrapper label="Zone">
          <LookupPairInput value={form.zone} onChange={(zone) => patch({ zone })} onLookupOpen={() => onLookupOpen("zone", "zone")} />
        </FieldWrapper>
        <FieldWrapper label="Country">
          <LookupPairInput value={form.country} onChange={(country) => patch({ country })} onLookupOpen={() => onLookupOpen("country", "country")} />
        </FieldWrapper>
        <FieldWrapper label="Destination">
          <LookupPairInput value={form.destination} onChange={(destination) => patch({ destination })} onLookupOpen={() => onLookupOpen("destination", "destination")} />
        </FieldWrapper>

        <FieldWrapper label="Customer">
          <LookupPairInput value={form.customer} onChange={(customer) => patch({ customer })} onLookupOpen={() => onLookupOpen("customer", "customer")} />
        </FieldWrapper>
        <FieldWrapper label="Service">
          <LookupPairInput value={form.service} onChange={(service) => patch({ service })} onLookupOpen={() => onLookupOpen("service", "serviceType")} />
        </FieldWrapper>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={() => toast.success("Zone export search started")} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">Search</Button>
        <Button onClick={() => patch(emptyExportForm())} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">Reset</Button>
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
        <SelectField label="Import Type" value={form.importType} options={["Zone Updation"]} onChange={(importType) => patch({ importType })} />
        <FieldWrapper label="Date">
          <Input type="date" value={form.date} onChange={(event) => patch({ date: event.target.value })} className="h-9" />
        </FieldWrapper>
        <FieldWrapper label="Select File">
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={onFile} />
            <Button type="button" variant="outline" className="h-9 px-6" onClick={() => fileInputRef.current?.click()}>Choose</Button>
            <span className="truncate text-xs text-muted-foreground">{form.fileName || "No file selected"}</span>
          </div>
        </FieldWrapper>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={() => form.fileName ? toast.success("Zone update import started") : toast.error("Please select import file")} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">Import</Button>
        <Button onClick={onReset} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">Reset</Button>
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
            <Input type="date" value={form.date} onChange={(event) => patch({ date: event.target.value })} className="h-9" />
          </FieldWrapper>
          <FieldWrapper label="Origin" required>
            <LookupPairInput value={form.origin} onChange={(origin) => patch({ origin })} onLookupOpen={() => onLookupOpen("origin", "serviceCentre")} />
          </FieldWrapper>
          <FieldWrapper label="Vendor">
            <LookupPairInput value={form.vendor} onChange={(vendor) => patch({ vendor })} onLookupOpen={() => onLookupOpen("vendor", "vendor")} />
          </FieldWrapper>
          <FieldWrapper label="Service">
            <LookupPairInput value={form.service} onChange={(service) => patch({ service })} onLookupOpen={() => onLookupOpen("service", "serviceType")} />
          </FieldWrapper>
          <FieldWrapper label="Product">
            <LookupPairInput value={form.product} onChange={(product) => patch({ product })} onLookupOpen={() => onLookupOpen("product", "product")} />
          </FieldWrapper>
          <FieldWrapper label="Country">
            <LookupPairInput value={form.country} onChange={(country) => patch({ country })} onLookupOpen={() => onLookupOpen("country", "country")} />
          </FieldWrapper>
          <FieldWrapper label="Destination">
            <LookupPairInput value={form.destination} onChange={(destination) => patch({ destination })} onLookupOpen={() => onLookupOpen("destination", "destination")} />
          </FieldWrapper>
          <FieldWrapper label="Zone">
            <LookupPairInput value={form.zone} onChange={(zone) => patch({ zone })} onLookupOpen={() => onLookupOpen("zone", "zone")} />
          </FieldWrapper>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <Button onClick={() => { toast.success("Zone saved"); onOpenChange(false); }} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">Save</Button>
          <Button onClick={() => onOpenChange(false)} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">Close</Button>
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
      <Input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="min-w-0 flex-1" />
      <Input value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })} className="w-20" />
      <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" onClick={onLookupOpen} aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <FieldWrapper label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} className={`h-8 ${active ? "bg-green-600 text-white hover:bg-green-700" : ""}`} onClick={onClick}>
      {children}
    </Button>
  );
}
