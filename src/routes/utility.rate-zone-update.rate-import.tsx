import { createFileRoute } from "@tanstack/react-router";
import ExcelJS from "exceljs";
import { Download, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { FieldWrapper, MasterBreadcrumb, TablePager } from "@/components/master-table-kit";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readZoneRateFile, type ZoneRateCell, type ZoneRateProblem } from "@/lib/rate-import/file";
import {
  applyZoneRateImport,
  previewZoneRateImport,
  type ZoneRatePreview,
  type ZoneRateScope,
} from "@/lib/rate-import/resources";

type ImportMode = "customer" | "vendor";

const PAGE_SIZE = 10;
const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyPair = (): LookupPairValue => ({ code: "", name: "" });
const formatOptions = ["Zone Rate", "Country Rate", "Country Rate New", "Country Rate New1", "Country Rate New2"];
const doxProductOptions = ["ADOX", "COMMERCIAL", "DOCUMENTS", "INTL DOX", "ENVELOPE", "MEDICINE", "MOBILE", "SPXD"];
const spxProductOptions = ["ASPX", "FOOD", "LAPTOP", "NON DOCUMENTS", "PACK", "OTHER PACKAGE"];

export const Route = createFileRoute("/utility/rate-zone-update/rate-import")({
  head: () => ({
    meta: [
      { title: "Rate Import — Utility — Courier ERP" },
      { name: "description", content: "Import a zone and weight rate sheet." },
    ],
  }),
  component: RateImportPage,
});

async function downloadFormat(kind: "zone" | "country") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(kind === "country" ? "Country Rate" : "Zone wise Rate");
  sheet.addRow([kind === "country" ? "Country Rate" : "Zone wise Rate"]);
  sheet.addRow(kind === "country" ? ["Service", "Weight", "US", "AE"] : ["Service", "Weight", "1", "8"]);
  sheet.addRow(["WORLDWIDE EXPRESS SAVER", 0.5, 900, 1441.16]);
  sheet.addRow(["WORLDWIDE EXPRESS SAVER", 1, 1000, 1540.61]);
  sheet.addRow(["WORLDWIDE EXPRESS SAVER", "20-45", 2500, 4000]);
  sheet.getRow(2).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "zone-rate-format.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}

function followUpHref(input: {
  vendor?: LookupPairValue;
  customer?: LookupPairValue;
  origin?: LookupPairValue;
  fromDate?: string;
}) {
  const params = new URLSearchParams();
  if (input.vendor?.id) {
    params.set("vendorId", input.vendor.id);
    params.set("vendorCode", input.vendor.code);
    params.set("vendorName", input.vendor.name);
  }
  if (input.customer?.id) {
    params.set("customerId", input.customer.id);
    params.set("customerCode", input.customer.code);
    params.set("customerName", input.customer.name);
  }
  if (input.origin?.id) {
    params.set("originId", input.origin.id);
    params.set("originCode", input.origin.code);
    params.set("originName", input.origin.name);
  }
  if (input.fromDate) params.set("from", input.fromDate);
  const query = params.toString();
  return `/utility/rate-zone-update/rate-update${query ? `?${query}` : ""}`;
}

function RateImportPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ImportMode>("customer");
  const [customer, setCustomer] = useState<LookupPairValue>(emptyPair);
  const [origin, setOrigin] = useState<LookupPairValue>(emptyPair);
  const [vendor, setVendor] = useState<LookupPairValue>(emptyPair);
  const [format, setFormat] = useState("");
  const [doxProduct, setDoxProduct] = useState("");
  const [spxProduct, setSpxProduct] = useState("");
  const [fromDate, setFromDate] = useState(todayIso);
  const [rateRoundOff, setRateRoundOff] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ZoneRateCell[]>([]);
  const [problems, setProblems] = useState<ZoneRateProblem[]>([]);
  const [queueAfter, setQueueAfter] = useState(false);
  const [skipFailed, setSkipFailed] = useState(false);
  const [busyKind, setBusyKind] = useState<"check" | "save" | null>(null);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<ZoneRatePreview | null>(null);
  const [result, setResult] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(1);

  const busy = busyKind !== null;
  const pricedRows = useMemo(
    () => rows,
    [rows],
  );
  const scope = (): ZoneRateScope => ({
    customerId: mode === "customer" ? customer.id ?? null : null,
    originId: origin.id ?? null,
    productCodes: [doxProduct, spxProduct].map((value) => value.trim()).filter(Boolean),
    rateKind: format === "Zone Rate" ? "zone" : "country",
    roundOff: rateRoundOff,
  });
  const confirmBlocked = !preview || preview.ok_count === 0 || (preview.failed_count > 0 && !skipFailed);

  const orderedRows = useMemo(() => {
    if (!preview) return [];
    return [...preview.rows].sort((a, b) => {
      if (a.status !== b.status) return a.status === "FAILED" ? -1 : 1;
      return a.row_no - b.row_no || a.zone.localeCompare(b.zone, undefined, { numeric: true });
    });
  }, [preview]);
  const pageCount = Math.max(1, Math.ceil(orderedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = orderedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const clearCheck = () => {
    setPreview(null);
    setResult("");
    setNotice("");
    setPage(1);
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    clearCheck();
    setProblems([]);
    setRows([]);
    setFileName(file?.name ?? "");
    if (!file) return;
    try {
      const parsed = await readZoneRateFile(file);
      if (parsed.error) {
        setNotice(parsed.error);
        return;
      }
      setRows(parsed.rows);
      setProblems(parsed.problems);
      if (parsed.problems.length > 0) {
        setNotice(`${parsed.problems.length} cells could not be read. The other prices can still be checked.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The file could not be read");
    }
  };

  const runPreview = async () => {
    setNotice("");
    setResult("");
    if (!vendor.id) return toast.error("Vendor is required");
    if (mode === "customer" && !customer.id) return setNotice("Customer is required");
    if (!format) return setNotice("Format is required");
    if (!fromDate) return toast.error("From Date is required");
    if (rows.length === 0) return toast.error("Please select upload file");
    setBusyKind("check");
    setPreview(null);
    try {
      const next = await previewZoneRateImport(vendor.id, fromDate, rows, scope());
      setPreview(next);
      setPage(1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The rate file could not be checked");
    } finally {
      setBusyKind(null);
    }
  };

  const runApply = async () => {
    setConfirmOpen(false);
    if (!vendor.id || rows.length === 0) return;
    if (mode === "customer" && !customer.id) {
      setNotice("Customer is required");
      return;
    }
    if (!format) {
      setNotice("Format is required");
      return;
    }
    setBusyKind("save");
    setPreview(null);
    setNotice("");
    try {
      const applied = await applyZoneRateImport(vendor.id, fromDate, rows, skipFailed, scope());
      const note = `Imported ${applied.imported}. New ${applied.new_count}. Replaced ${applied.replace_count}. Unchanged ${applied.unchanged_count}. Skipped ${applied.skipped}.`;
      if (queueAfter) {
        window.location.assign(followUpHref({
          vendor,
          customer: mode === "customer" ? customer : undefined,
          origin: origin.id ? origin : undefined,
          fromDate,
        }));
        return;
      }
      setResult(note);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The rate file was not saved");
    } finally {
      setBusyKind(null);
    }
  };

  const reset = () => {
    setCustomer(emptyPair());
    setOrigin(emptyPair());
    setVendor(emptyPair());
    setFormat("");
    setDoxProduct("");
    setSpxProduct("");
    setFromDate(todayIso());
    setRateRoundOff(false);
    setFileName("");
    setRows([]);
    setProblems([]);
    setSkipFailed(false);
    setQueueAfter(false);
    clearCheck();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const upload = (
    <FieldWrapper label="Upload File">
      <div className="flex h-9 items-center gap-2">
        <input
          ref={fileInputRef}
          data-testid="rate-import-file"
          type="file"
          className="hidden"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => void onFile(event)}
        />
        <Button type="button" variant="outline" className="h-9 px-6" onClick={() => fileInputRef.current?.click()}>
          Choose
        </Button>
        <span className="truncate text-xs text-muted-foreground">
            {fileName
            ? `${fileName}: ${rows.length} ${rows.length === 1 ? "price" : "prices"}`
            : "No file selected"}
        </span>
      </div>
    </FieldWrapper>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Rate / Zone Update", "Rate Import"]} />

      <Card className="relative min-w-0 border p-4 pt-7">
        <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
          Rate Import
        </span>
        <button
          type="button"
          onClick={() => void downloadFormat(format.startsWith("Country") ? "country" : "zone")}
          className="absolute right-4 top-4 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Click Here to Download Excel File Format
        </button>

        <div className="mb-3 flex items-center gap-1">
          <TabButton active={mode === "customer"} onClick={() => { setMode("customer"); clearCheck(); }}>Customer</TabButton>
          <TabButton active={mode === "vendor"} onClick={() => { setMode("vendor"); clearCheck(); }}>Vendor</TabButton>
        </div>

        <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
          {mode === "customer" ? (
            <LiveField label="Customer" lookup="customer" testId="rate-import-customer" value={customer} onChange={(next) => { setCustomer(next); clearCheck(); }} />
          ) : null}
          <LiveField label="Origin" lookup="destination" testId="rate-import-origin" value={origin} onChange={(next) => { setOrigin(next); clearCheck(); }} />
          <LiveField label="Vendor" lookup="vendor" testId="rate-import-vendor" value={vendor} onChange={(next) => { setVendor(next); clearCheck(); }} />
          {mode === "vendor" ? (
            <SelectField label="Format" testId="rate-import-format" value={format} placeholder="Select Format" options={formatOptions} onChange={(next) => { setFormat(next); clearCheck(); }} />
          ) : null}
          {mode === "customer" ? (
            <SelectField label="Format" testId="rate-import-format" value={format} placeholder="Select Format" options={formatOptions} onChange={(next) => { setFormat(next); clearCheck(); }} />
          ) : null}
          <SelectField label="DOX Product" testId="rate-import-dox" value={doxProduct} placeholder="Select DOX Product" options={doxProductOptions} onChange={(next) => { setDoxProduct(next); clearCheck(); }} />
          <SelectField label="SPX Product" testId="rate-import-spx" value={spxProduct} placeholder="Select SPX Product" options={spxProductOptions} onChange={(next) => { setSpxProduct(next); clearCheck(); }} />
          <FieldWrapper label="From Date">
            <Input
              data-testid="rate-import-date"
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                clearCheck();
              }}
              className="h-9"
            />
          </FieldWrapper>
          <label className="flex h-14 items-end gap-2 pb-2 text-xs text-foreground">
            <Checkbox
              checked={rateRoundOff}
              onCheckedChange={(checked) => {
                setRateRoundOff(checked === true);
                clearCheck();
              }}
            />
            <span>Rate Round Off</span>
          </label>
          {upload}
        </div>

        <p className="mt-3 text-xs text-muted-foreground" data-testid="rate-import-assumptions">
          Zone Rate reads zone columns. Country Rate reads country columns. Customer, origin, and the products you pick limit which bookings use the price. A blank product means every product. Rate Round Off rounds each price to the nearest rupee. A customer rate card still wins. Fuel and GST are still added. Booked AWBs stay as they are until you preview them on Rate Update.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              data-testid="rate-import-queue-link"
              className="text-sm text-sky-700 hover:underline"
              onClick={() => {
                window.location.assign(followUpHref({
                  vendor: vendor.id ? vendor : undefined,
                  customer: mode === "customer" && customer.id ? customer : undefined,
                  origin: origin.id ? origin : undefined,
                  fromDate,
                }));
              }}
            >
              Click Here Open Job Queue
            </button>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                data-testid="rate-import-queue"
                checked={queueAfter}
                onCheckedChange={(checked) => setQueueAfter(checked === true)}
              />
              Add Rate Update in Job Queue after Rate Import
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              data-testid="rate-import-check"
              disabled={busy || !vendor.id || rows.length === 0}
              onClick={() => void runPreview()}
              className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
            >
              {busyKind === "check" ? <Loader2 className="animate-spin" /> : null}
              {busyKind === "check" ? "Checking…" : "Save"}
            </Button>
            <Button type="button" disabled={busy} onClick={reset} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {notice ? (
        <Card className="border border-amber-300 bg-amber-50 p-4" data-testid="rate-import-notice">
          <p className="text-sm">{notice}</p>
        </Card>
      ) : null}

      {problems.length > 0 ? (
        <Card className="border p-4">
          <p className="mb-2 text-sm font-medium">Cells that were not read</p>
          <ul className="space-y-1 text-sm">
            {problems.slice(0, 10).map((problem) => (
              <li key={`${problem.row_no}-${problem.zone}-${problem.reason}`}>
                Row {problem.row_no} {problem.zone ? `zone ${problem.zone}` : ""}: {problem.reason}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {busyKind ? (
        <Card className="flex items-center gap-3 border p-4" data-testid="rate-import-status">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-sm font-medium">
            {busyKind === "check"
              ? `Checking ${pricedRows.length} prices. Nothing is saved yet.`
              : "Saving the rate prices."}
          </p>
        </Card>
      ) : null}

      {preview ? (
        <Card className="min-w-0 border p-4" data-testid="rate-import-preview">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Check finished. Nothing is saved yet.</p>
              <p className="text-sm" data-testid="rate-import-summary">
                {preview.total} {preview.total === 1 ? "price" : "prices"}. {preview.ok_count} OK. {preview.failed_count} failed. {preview.new_count} new. {preview.replace_count} replace. {preview.unchanged_count} unchanged. Nothing is saved yet.
              </p>
              {preview.failed_count > 0 && !skipFailed ? (
                <p className="mt-1 text-sm text-amber-700" data-testid="rate-import-blocked">
                  Confirm Import is off because {preview.failed_count} {preview.failed_count === 1 ? "price" : "prices"} failed. Fix the failed prices, or tick Skip failed prices.
                </p>
              ) : (
                <p className="mt-1 text-sm">Press Confirm Import to save these prices.</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  data-testid="rate-import-skip"
                  checked={skipFailed}
                  onCheckedChange={(checked) => setSkipFailed(checked === true)}
                />
                Skip failed prices
              </label>
              <Button data-testid="rate-import-confirm" disabled={busy || confirmBlocked} onClick={() => setConfirmOpen(true)}>
                {busyKind === "save" ? <Loader2 className="animate-spin" /> : null}
                {busyKind === "save" ? "Saving…" : "Confirm Import"}
              </Button>
            </div>
          </div>
          <div className="-mx-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-sidebar text-left text-xs uppercase tracking-wide text-sidebar-foreground">
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Weight</th>
                  <th className="px-3 py-2">{format.startsWith("Country") ? "Country" : "Zone"}</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => (
                  <tr key={`${row.row_no}-${row.zone}-${row.weight_to}`} className={index % 2 === 0 ? "bg-sky-50" : "bg-white"} data-testid="rate-import-row">
                    <td className="px-3 py-2">{row.row_no}</td>
                    <td className="px-3 py-2 text-sky-900">{row.service}</td>
                    <td className="px-3 py-2">{row.weight_from}–{row.weight_to} kg</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{row.zone}</span>
                    </td>
                    <td className="px-3 py-2">{row.product || "All"}</td>
                    <td className="px-3 py-2">{Number(row.amount).toFixed(2)}</td>
                    <td className="px-3 py-2">{row.status === "OK" ? row.outcome : "FAILED"}</td>
                    <td className="px-3 py-2">{row.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {orderedRows.length > 0 ? (
            <TablePager
              totalPages={pageCount}
              currentPage={safePage}
              setPage={setPage}
              startIdx={(safePage - 1) * PAGE_SIZE + 1}
              endIdx={Math.min(safePage * PAGE_SIZE, orderedRows.length)}
              total={orderedRows.length}
            />
          ) : null}
        </Card>
      ) : null}

      {result ? (
        <Card className="border p-4" data-testid="rate-import-result">
          <p className="text-sm font-medium">{result}</p>
        </Card>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import these rate prices?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview
                ? `${preview.new_count} new, ${preview.replace_count} replaced, ${preview.unchanged_count} unchanged. From Date ${fromDate}. Vendor ${vendor.code || vendor.name}. A customer rate card still wins. Booked AWBs are not changed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction data-testid="rate-import-apply" onClick={() => void runApply()}>
              Confirm Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LiveField({
  label,
  lookup,
  value,
  onChange,
  testId,
}: {
  label: string;
  lookup: "customer" | "vendor" | "destination";
  value: LookupPairValue;
  onChange: (value: LookupPairValue) => void;
  testId?: string;
}) {
  return (
    <FieldWrapper label={label}>
      <div data-testid={testId}>
        <SearchableLookupPair lookup={lookup} liveLookup={lookup} value={value} onChange={onChange} />
      </div>
    </FieldWrapper>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
  testId?: string;
}) {
  return (
    <FieldWrapper label={label}>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger data-testid={testId} className="h-9">
          <SelectValue placeholder={placeholder} />
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className={`h-8 px-4 ${active ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
