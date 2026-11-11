import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import {
  SearchableLookupPair,
  type LookupPairValue,
} from "@/components/masters/searchable-lookup-pair";
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
import { supabase } from "@/integrations/supabase/client";
import { exportTable, parseTabularFile } from "@/lib/io/tableIo";
import {
  ZONE_IMPORT_COLUMNS,
  zoneRowsFromTable,
  type ZoneFileRow,
} from "@/lib/zone-update/file";
import {
  applyZoneImport,
  deleteZoneMapping,
  previewZoneImport,
  saveZoneMapping,
  searchZoneMappings,
  type ZonePreview,
  type ZoneSearchRow,
} from "@/lib/zone-update/resources";

type ZoneMode = "export" | "import";

type ExportForm = {
  exportType: string;
  vendor: LookupPairValue;
  date: string;
  product: LookupPairValue;
  origin: LookupPairValue;
  zone: LookupPairValue;
  country: LookupPairValue;
  destination: LookupPairValue;
  service: LookupPairValue;
};

type MappingForm = {
  id: string | null;
  date: string;
  origin: LookupPairValue;
  vendor: LookupPairValue;
  service: LookupPairValue;
  product: LookupPairValue;
  country: LookupPairValue;
  destination: LookupPairValue;
  zone: LookupPairValue;
};

const emptyPair = (): LookupPairValue => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyExport = (): ExportForm => ({
  exportType: "International",
  vendor: emptyPair(),
  date: todayIso(),
  product: emptyPair(),
  origin: emptyPair(),
  zone: emptyPair(),
  country: emptyPair(),
  destination: emptyPair(),
  service: emptyPair(),
});

const emptyMapping = (): MappingForm => ({
  id: null,
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
      { name: "description", content: "Export and import zone mappings. Booked AWBs are not changed." },
    ],
  }),
  component: ZoneUpdatePage,
});

function ZoneUpdatePage() {
  const [mode, setMode] = useState<ZoneMode>("export");
  const [exportForm, setExportForm] = useState<ExportForm>(emptyExport);
  const [mapping, setMapping] = useState<MappingForm>(emptyMapping);
  const [addOpen, setAddOpen] = useState(false);
  const [grid, setGrid] = useState<ZoneSearchRow[]>([]);
  const [gridNote, setGridNote] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileRows, setFileRows] = useState<ZoneFileRow[]>([]);
  const [importDate, setImportDate] = useState(todayIso);
  const [skipFailed, setSkipFailed] = useState(false);
  const [preview, setPreview] = useState<ZonePreview | null>(null);
  const [importNote, setImportNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const patchExport = (updates: Partial<ExportForm>) =>
    setExportForm((current) => ({ ...current, ...updates }));

  const runSearch = async () => {
    setBusy(true);
    try {
      const result = await searchZoneMappings({
        exportType: exportForm.exportType,
        asOf: exportForm.date,
        vendorId: exportForm.vendor.id,
        productId: exportForm.product.id,
        originId: exportForm.origin.id,
        zoneId: exportForm.zone.id,
        countryId: exportForm.country.id,
        destinationId: exportForm.destination.id,
        service: exportForm.service.code || exportForm.service.name,
      });
      setGrid(result.rows);
      setGridNote(`${result.total} mapping${result.total === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadRows = async (rows: ZoneSearchRow[], filename: string) => {
    await exportTable({
      format: "excel",
      filename,
      title: "Zone mappings",
      columns: ZONE_IMPORT_COLUMNS.map((header) => ({ key: header, header })),
      rows: rows.map((row) => ({
        Origin: row.Origin ?? "",
        Vendor: row.Vendor ?? "",
        Product: row.Product ?? "",
        Country: row.Country ?? "",
        Destination: row.destination_name || row.Destination || "",
        Zone: row.Zone ?? "",
        ServiceType: row.ServiceType ?? "",
      })),
    });
  };

  const downloadTemplate = async () => {
    await exportTable({
      format: "excel",
      filename: "zone-import-template.xlsx",
      title: "Zone import template",
      columns: ZONE_IMPORT_COLUMNS.map((header) => ({ key: header, header })),
      rows: [
        {
          Origin: "HYD",
          Vendor: "UPS",
          Product: "DOX",
          Country: "US",
          Destination: "USA",
          Zone: "US",
          ServiceType: "WORLDWIDE EXPRESS SAVER",
        },
      ],
    });
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setImportNote("");
    if (!file) {
      setFileName("");
      setFileRows([]);
      return;
    }
    setFileName(file.name);
    try {
      const parsed = await parseTabularFile(file);
      const result = zoneRowsFromTable(parsed.headers, parsed.rows);
      if (result.missing.length > 0) {
        setFileRows([]);
        toast.error(`Missing column${result.missing.length === 1 ? "" : "s"}: ${result.missing.join(", ")}`);
        return;
      }
      setFileRows(result.rows);
    } catch (err) {
      setFileRows([]);
      toast.error(err instanceof Error ? err.message : "Could not read the file");
    }
  };

  const runPreview = async () => {
    if (fileRows.length === 0) return toast.error("Please select import file");
    setBusy(true);
    setImportNote("");
    try {
      const result = await previewZoneImport(fileRows, importDate);
      setPreview(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dry run failed");
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const result = await applyZoneImport(fileRows, importDate, skipFailed);
      const note = `Imported ${result.imported}. New ${result.new_count}. Replaced ${result.replace_count}. Unchanged ${result.unchanged_count}. Skipped ${result.skipped}.`;
      setImportNote(note);
      setPreview(null);
      toast.success(note);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setImportNote(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const openNew = () => {
    setMapping(emptyMapping());
    setAddOpen(true);
  };

  const openEdit = (row: ZoneSearchRow) => {
    setMapping({
      id: row.id,
      date: row.effective_date,
      origin: { id: row.origin_id ?? undefined, code: row.Origin ?? "", name: row.Origin ?? "" },
      vendor: { id: row.vendor_id ?? undefined, code: row.Vendor ?? "", name: row.Vendor ?? "" },
      service: { code: row.ServiceType ?? "", name: row.ServiceType ?? "" },
      product: { id: row.product_id ?? undefined, code: row.Product ?? "", name: row.Product ?? "" },
      country: { id: row.country_id ?? undefined, code: row.Country ?? "", name: row.Country ?? "" },
      destination: {
        id: row.destination_id ?? undefined,
        code: row.Destination ?? "",
        name: row.destination_name || row.Destination || "",
      },
      zone: { id: row.zone_id ?? undefined, code: row.Zone ?? "", name: row.Zone ?? "" },
    });
    setAddOpen(true);
  };

  const saveMapping = async () => {
    setBusy(true);
    try {
      await saveZoneMapping(mapping.id, {
        effective_date: mapping.date,
        origin_id: mapping.origin.id ?? null,
        vendor_id: mapping.vendor.id ?? null,
        product_id: mapping.product.id ?? null,
        country_id: mapping.country.id ?? null,
        destination_id: mapping.destination.id ?? null,
        zone_id: mapping.zone.id ?? null,
        service: mapping.service.code || mapping.service.name || null,
      });
      toast.success(mapping.id ? "Zone mapping updated" : "Zone mapping saved");
      setAddOpen(false);
      if (mode === "export") await runSearch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const removeMapping = async (id: string) => {
    setBusy(true);
    try {
      await deleteZoneMapping(id);
      toast.success("Zone mapping deleted");
      await runSearch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmBlocked =
    !preview || preview.ok_count === 0 || (preview.failed_count > 0 && !skipFailed);

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Rate / Zone Update", "Zone Update"]} />

      <Card className="min-w-0 border p-4">
        {mode === "import" ? (
          <button
            type="button"
            data-testid="zone-template"
            onClick={() => void downloadTemplate()}
            className="mb-2 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Click Here To Download Excel File Format
          </button>
        ) : null}

        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <TabButton active={mode === "export"} onClick={() => setMode("export")}>
              Export
            </TabButton>
            <TabButton active={mode === "import"} onClick={() => setMode("import")}>
              Import
            </TabButton>
          </div>
          <Button
            data-testid="zone-add"
            onClick={openNew}
            className="h-8 gap-1.5 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          >
            <Plus className="h-4 w-4" />
            Add Mapping
          </Button>
        </div>

        {mode === "export" ? (
          <>
            <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
              <SelectField
                label="Export Type"
                value={exportForm.exportType}
                options={["International", "Domestic"]}
                onChange={(exportType) => patchExport({ exportType })}
              />
              <LiveField label="Vendor" lookup="vendor" value={exportForm.vendor} onChange={(vendor) => patchExport({ vendor, service: emptyPair() })} />
              <FieldWrapper label="Date">
                <Input type="date" value={exportForm.date} onChange={(event) => patchExport({ date: event.target.value })} className="h-9" />
              </FieldWrapper>
              <LiveField label="Product" lookup="product" value={exportForm.product} onChange={(product) => patchExport({ product })} />
              <LiveField label="Origin" lookup="destination" value={exportForm.origin} onChange={(origin) => patchExport({ origin })} />
              <LiveField label="Zone" lookup="zone" value={exportForm.zone} onChange={(zone) => patchExport({ zone })} />
              <LiveField label="Country" lookup="country" value={exportForm.country} onChange={(country) => patchExport({ country })} />
              <LiveField label="Destination" lookup="destination" value={exportForm.destination} onChange={(destination) => patchExport({ destination })} />
              <FieldWrapper label="Service">
                <ServiceLookup
                  vendorId={exportForm.vendor.id}
                  value={exportForm.service}
                  onChange={(service) => patchExport({ service })}
                />
              </FieldWrapper>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button data-testid="zone-export-search" disabled={busy} onClick={() => void runSearch()} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">
                Search
              </Button>
              <Button onClick={() => { setExportForm(emptyExport()); setGrid([]); setGridNote(""); }} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">
                Reset
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
              <SelectField label="Import Type" value="Zone Updation" options={["Zone Updation"]} onChange={() => undefined} />
              <FieldWrapper label="Date">
                <Input data-testid="zone-import-date" type="date" value={importDate} onChange={(event) => setImportDate(event.target.value)} className="h-9" />
              </FieldWrapper>
              <FieldWrapper label="Select File">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    data-testid="zone-import-file"
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(event) => void onFile(event)}
                  />
                  <Button type="button" variant="outline" className="h-9 px-6" onClick={() => fileInputRef.current?.click()}>
                    Choose
                  </Button>
                  <span className="truncate text-xs text-muted-foreground">{fileName || "No file selected"}</span>
                </div>
              </FieldWrapper>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <Checkbox data-testid="zone-import-skip" checked={skipFailed} onCheckedChange={(checked) => setSkipFailed(checked === true)} />
              Skip failed rows and import the rest
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button data-testid="zone-import-run" disabled={busy || fileRows.length === 0} onClick={() => void runPreview()} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">
                Import
              </Button>
              <Button
                onClick={() => {
                  setFileName("");
                  setFileRows([]);
                  setPreview(null);
                  setImportNote("");
                  setSkipFailed(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
              >
                Reset
              </Button>
            </div>
          </>
        )}
      </Card>

      {mode === "export" && gridNote ? (
        <Card className="min-w-0 border p-4" data-testid="zone-export-grid">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm">{gridNote}</p>
            <Button data-testid="zone-export-download" variant="outline" disabled={grid.length === 0} onClick={() => void downloadRows(grid, "zone-mappings.xlsx")}>
              Download Excel
            </Button>
          </div>
          <MappingTable rows={grid} onEdit={openEdit} onDelete={(id) => void removeMapping(id)} />
        </Card>
      ) : null}

      {preview ? (
        <Card className="min-w-0 border p-4" data-testid="zone-import-preview">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" data-testid="zone-import-summary">
              {preview.total} rows. {preview.ok_count} OK. {preview.failed_count} failed. {preview.new_count} new. {preview.replace_count} replace. {preview.unchanged_count} unchanged. Nothing is saved yet.
            </p>
            <Button data-testid="zone-import-confirm" disabled={busy || confirmBlocked} onClick={() => setConfirmOpen(true)}>
              Confirm Import
            </Button>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-2 py-1">Row</th>
                  <th className="px-2 py-1">Destination</th>
                  <th className="px-2 py-1">Zone</th>
                  <th className="px-2 py-1">Result</th>
                  <th className="px-2 py-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row_no} className="border-b">
                    <td className="px-2 py-1">{row.row_no}</td>
                    <td className="px-2 py-1">{row.destination}</td>
                    <td className="px-2 py-1">{row.zone}</td>
                    <td className="px-2 py-1">{row.status === "OK" ? row.outcome : "FAILED"}</td>
                    <td className="px-2 py-1">{row.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {importNote ? (
        <p className="text-sm font-medium" data-testid="zone-import-result">{importNote}</p>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
          <DialogHeader className="bg-sidebar px-4 py-3 text-sidebar-foreground">
            <DialogTitle className="text-sm">{mapping.id ? "Edit mapping" : "Add/Update"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-x-3 gap-y-2 p-4 lg:grid-cols-3">
            <FieldWrapper label="Date">
              <Input type="date" value={mapping.date} onChange={(event) => setMapping((current) => ({ ...current, date: event.target.value }))} className="h-9" />
            </FieldWrapper>
            <LiveField label="Origin" lookup="destination" value={mapping.origin} onChange={(origin) => setMapping((current) => ({ ...current, origin }))} />
            <LiveField label="Vendor" lookup="vendor" value={mapping.vendor} onChange={(vendor) => setMapping((current) => ({ ...current, vendor, service: emptyPair() }))} />
            <FieldWrapper label="Service">
              <ServiceLookup vendorId={mapping.vendor.id} value={mapping.service} onChange={(service) => setMapping((current) => ({ ...current, service }))} />
            </FieldWrapper>
            <LiveField label="Product" lookup="product" value={mapping.product} onChange={(product) => setMapping((current) => ({ ...current, product }))} />
            <LiveField label="Country" lookup="country" value={mapping.country} onChange={(country) => setMapping((current) => ({ ...current, country }))} />
            <LiveField label="Destination" lookup="destination" value={mapping.destination} onChange={(destination) => setMapping((current) => ({ ...current, destination }))} />
            <LiveField label="Zone" lookup="zone" value={mapping.zone} onChange={(zone) => setMapping((current) => ({ ...current, zone }))} />
          </div>
          <div className="flex justify-end gap-2 px-4 pb-4">
            <Button data-testid="zone-mapping-save" disabled={busy} onClick={() => void saveMapping()} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">
              Save
            </Button>
            <Button onClick={() => setAddOpen(false)} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import these zone rows?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview
                ? `${preview.new_count} new, ${preview.replace_count} replaced, ${preview.unchanged_count} unchanged. Effective date ${importDate}. Unchanged rows are not written. Booked AWBs are not changed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction data-testid="zone-import-apply" onClick={() => void runApply()}>
              Confirm Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MappingTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: ZoneSearchRow[];
  onEdit: (row: ZoneSearchRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-xs">
        <thead>
          <tr className="border-b text-left">
            {ZONE_IMPORT_COLUMNS.map((column) => (
              <th key={column} className="px-2 py-1">{column}</th>
            ))}
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b" data-testid="zone-mapping-row">
              <td className="px-2 py-1">{row.Origin}</td>
              <td className="px-2 py-1">{row.Vendor}</td>
              <td className="px-2 py-1">{row.Product}</td>
              <td className="px-2 py-1">{row.Country}</td>
              <td className="px-2 py-1">{row.destination_name || row.Destination}</td>
              <td className="px-2 py-1">{row.Zone}</td>
              <td className="px-2 py-1">{row.ServiceType}</td>
              <td className="px-2 py-1">
                <button type="button" className="mr-2 underline" onClick={() => onEdit(row)}>Edit</button>
                <button type="button" data-testid="zone-mapping-delete" className="underline" onClick={() => onDelete(row.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveField({
  label,
  lookup,
  value,
  onChange,
}: {
  label: string;
  lookup: "vendor" | "product" | "destination" | "zone" | "country";
  value: LookupPairValue;
  onChange: (value: LookupPairValue) => void;
}) {
  return (
    <FieldWrapper label={label}>
      <div data-testid={`zone-field-${label.toLowerCase()}`}>
        <SearchableLookupPair lookup={lookup} liveLookup={lookup} value={value} onChange={onChange} />
      </div>
    </FieldWrapper>
  );
}

function ServiceLookup({
  vendorId,
  value,
  onChange,
}: {
  vendorId?: string;
  value: LookupPairValue;
  onChange: (value: LookupPairValue) => void;
}) {
  const [rows, setRows] = useState<Array<{ service: string }>>([]);
  const [open, setOpen] = useState(false);
  const query = value.name;

  useEffect(() => {
    if (!vendorId || query.trim().length < 2) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void supabase
        .rpc("list_vendor_services", { p_vendor_id: vendorId, p_q: query.trim(), p_limit: 20 })
        .then(({ data }) => {
          if (!cancelled) setRows((data ?? []) as Array<{ service: string }>);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [vendorId, query]);

  return (
    <div className="relative" data-testid="zone-service">
      <div className="flex gap-1">
        <Input
          value={value.name}
          placeholder={vendorId ? "Service" : "Choose a vendor first"}
          className="h-9"
          onChange={(event) => {
            onChange({ code: event.target.value, name: event.target.value });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <Button type="button" size="icon" variant="outline" className="h-9 w-9" aria-label="Search" onClick={() => setOpen(true)}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {open && rows.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border bg-background shadow">
          {rows.map((row) => (
            <button
              key={row.service}
              type="button"
              role="option"
              className="block w-full px-2 py-1 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange({ code: row.service, name: row.service });
                setOpen(false);
              }}
            >
              {row.service}
            </button>
          ))}
        </div>
      ) : null}
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
            <SelectItem key={option} value={option}>{option}</SelectItem>
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
    <Button type="button" size="sm" variant={active ? "default" : "outline"} className={`h-8 ${active ? "bg-green-600 text-white hover:bg-green-700" : ""}`} onClick={onClick}>
      {children}
    </Button>
  );
}
