import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  RefreshCw,
  Filter,
  Settings,
  Plus,
  Pencil,
  Trash2,
  Printer,
  FileSpreadsheet,
  Search,
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

type DrsAwbLine = {
  id: string;
  awbNo: string;
  bookDate: string;
  origin: string;
  destination: string;
  customer: string;
  consignee: string;
  pcs: string;
  weight: string;
  ewayBillNo: string;
  shipmentValue: string;
};

type DrsRow = {
  id: string;
  drsNo: string;
  drsDate: string;
  drsTime: string;
  areaCode: string;
  areaName: string;
  areaSeq: string;
  serviceCenter: string;
  fieldExecutiveCode: string;
  fieldExecutiveName: string;
  remark: string;
  awbLines: DrsAwbLine[];
};

type DrsEntryForm = {
  drsNo: string;
  drsDate: string;
  drsTime: string;
  area: LookupPair;
  areaSeq: string;
  fieldExecutive: LookupPair;
  remark: string;
  awbLines: DrsAwbLine[];
};

type ColFilterKey = "drsNo" | "date" | "area" | "serviceCenter" | "fieldExecutive";

type FormSetupSettings = {
  allowConsigneeName: boolean;
};

type PageView = "list" | "entry";

const SEED_AWB_TESTDEL: Omit<DrsAwbLine, "id"> = {
  awbNo: "TESTDEL",
  bookDate: "11/08/2025",
  origin: "HYD",
  destination: "TW",
  customer: "JUST EXPRESS WORLDWIDE",
  consignee: "NEW-IN CO LTD",
  pcs: "1",
  weight: "0.100",
  ewayBillNo: "",
  shipmentValue: "5",
};

const SEED_AWB_LINES: Omit<DrsAwbLine, "id">[] = [
  SEED_AWB_TESTDEL,
  {
    awbNo: "30404019",
    bookDate: "04/07/2026",
    origin: "HYD",
    destination: "US",
    customer: "RASHMIKA ENT",
    consignee: "MIDHUN NARNE",
    pcs: "1",
    weight: "20.000",
    ewayBillNo: "",
    shipmentValue: "7185.00",
  },
  {
    awbNo: "30404020",
    bookDate: "04/07/2026",
    origin: "HYD",
    destination: "BOM",
    customer: "TECH SOLUTIONS",
    consignee: "JOHN SMITH",
    pcs: "2",
    weight: "15.500",
    ewayBillNo: "EWB123456",
    shipmentValue: "5420.00",
  },
];

const SEED_ROWS: Omit<DrsRow, "id">[] = [
  {
    drsNo: "HYD/HYD/2025/2",
    drsDate: "2025-08-11",
    drsTime: "1758",
    areaCode: "HYD",
    areaName: "HYD",
    areaSeq: "1",
    serviceCenter: "HYD",
    fieldExecutiveCode: "CHANDU",
    fieldExecutiveName: "CHANDU",
    remark: "",
    awbLines: [{ id: crypto.randomUUID(), ...SEED_AWB_TESTDEL }],
  },
  {
    drsNo: "HYD/HYD/2025/1",
    drsDate: "2025-01-20",
    drsTime: "1015",
    areaCode: "HYD",
    areaName: "HYD",
    areaSeq: "1",
    serviceCenter: "HYD",
    fieldExecutiveCode: "CHANDU",
    fieldExecutiveName: "CHANDU",
    remark: "",
    awbLines: [
      {
        id: crypto.randomUUID(),
        awbNo: "30403918",
        bookDate: "20/01/2025",
        origin: "HYD",
        destination: "DEL",
        customer: "COURIERWALA",
        consignee: "DELHI TRADERS",
        pcs: "1",
        weight: "12.000",
        ewayBillNo: "",
        shipmentValue: "3200.00",
      },
    ],
  },
];

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const nowDrsTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const defaultFormSetup = (): FormSetupSettings => ({
  allowConsigneeName: true,
});

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  drsNo: "",
  date: "",
  area: "",
  serviceCenter: "",
  fieldExecutive: "",
});

const emptyEntryForm = (): DrsEntryForm => ({
  drsNo: "0",
  drsDate: todayIso(),
  drsTime: nowDrsTime(),
  area: emptyPair(),
  areaSeq: "",
  fieldExecutive: emptyPair(),
  remark: "",
  awbLines: [],
});

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const rowDisplay = (row: DrsRow) => ({
  drsNo: row.drsNo,
  date: formatDisplayDate(row.drsDate),
  area: row.areaCode,
  serviceCenter: row.serviceCenter,
  fieldExecutive: row.fieldExecutiveName,
});

const nextDrsNo = (rows: DrsRow[]) => {
  const year = new Date().getFullYear();
  const prefix = `HYD/HYD/${year}/`;
  const max = rows.reduce((acc, row) => {
    if (!row.drsNo.startsWith(prefix)) return acc;
    const part = Number.parseInt(row.drsNo.slice(prefix.length), 10);
    return Number.isFinite(part) ? Math.max(acc, part) : acc;
  }, 0);
  return `${prefix}${max + 1}`;
};

const rowToEntryForm = (row: DrsRow): DrsEntryForm => ({
  drsNo: row.drsNo,
  drsDate: row.drsDate,
  drsTime: row.drsTime,
  area: { code: row.areaCode, name: row.areaName },
  areaSeq: row.areaSeq,
  fieldExecutive: { code: row.fieldExecutiveCode, name: row.fieldExecutiveName },
  remark: row.remark,
  awbLines: row.awbLines.map((line) => ({ ...line })),
});

const entryFormToRow = (form: DrsEntryForm, editing: DrsRow | null, allRows: DrsRow[]): Omit<DrsRow, "id"> => ({
  drsNo: editing?.drsNo ?? nextDrsNo(allRows),
  drsDate: form.drsDate,
  drsTime: form.drsTime.trim(),
  areaCode: form.area.code.trim() || form.area.name.trim(),
  areaName: form.area.name.trim() || form.area.code.trim(),
  areaSeq: form.areaSeq.trim(),
  serviceCenter: form.area.code.trim() || editing?.serviceCenter || "HYD",
  fieldExecutiveCode: form.fieldExecutive.code.trim() || form.fieldExecutive.name.trim(),
  fieldExecutiveName: form.fieldExecutive.name.trim() || form.fieldExecutive.code.trim(),
  remark: form.remark.trim(),
  awbLines: form.awbLines,
});

const lookupAwb = (awbNo: string, drsDate?: string): Omit<DrsAwbLine, "id"> => {
  if (awbNo.toUpperCase() === "TESTDEL") return { ...SEED_AWB_TESTDEL };
  const seed = SEED_AWB_LINES.find((line) => line.awbNo === awbNo);
  if (seed) return { ...seed };
  return {
    awbNo,
    bookDate: drsDate ? formatDisplayDate(drsDate) : formatDisplayDate(todayIso()),
    origin: "HYD",
    destination: "US",
    customer: "SAMPLE CUSTOMER",
    consignee: "SAMPLE CONSIGNEE",
    pcs: "1",
    weight: "10.000",
    ewayBillNo: "",
    shipmentValue: "1000.00",
  };
};

export const Route = createFileRoute("/transaction/drs-scan")({
  component: DrsScanPage,
  head: () => ({
    meta: [
      { title: "DRS Scan — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage delivery run sheets with AWB scanning." },
    ],
  }),
});

function DrsScanPage() {
  const [rows, setRows] = useState<DrsRow[]>(() =>
    SEED_ROWS.map((row) => ({ id: crypto.randomUUID(), ...row })),
  );
  const [view, setView] = useState<PageView>("list");
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DrsRow | null>(null);
  const [entryForm, setEntryForm] = useState<DrsEntryForm>(emptyEntryForm);
  const [awbDraft, setAwbDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DrsRow | null>(null);
  const [formSetupOpen, setFormSetupOpen] = useState(false);
  const [formSetupSettings, setFormSetupSettings] = useState<FormSetupSettings>(defaultFormSetup);
  const [formSetupDraft, setFormSetupDraft] = useState<FormSetupSettings>(defaultFormSetup);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const d = rowDisplay(row);
      if (
        q &&
        ![d.drsNo, d.date, d.area, d.serviceCenter, d.fieldExecutive].some((v) =>
          v.toLowerCase().includes(q),
        )
      ) {
        return false;
      }
      if (colFilters.drsNo && !d.drsNo.toLowerCase().includes(colFilters.drsNo.toLowerCase())) return false;
      if (colFilters.date && !d.date.toLowerCase().includes(colFilters.date.toLowerCase())) return false;
      if (colFilters.area && !d.area.toLowerCase().includes(colFilters.area.toLowerCase())) return false;
      if (
        colFilters.serviceCenter &&
        !d.serviceCenter.toLowerCase().includes(colFilters.serviceCenter.toLowerCase())
      ) {
        return false;
      }
      if (
        colFilters.fieldExecutive &&
        !d.fieldExecutive.toLowerCase().includes(colFilters.fieldExecutive.toLowerCase())
      ) {
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
    setEntryForm({ ...emptyEntryForm(), drsDate: todayIso(), drsTime: nowDrsTime() });
    setAwbDraft("");
    setView("entry");
  };

  const openEntry = (row: DrsRow) => {
    setEditing(row);
    setEntryForm(rowToEntryForm(row));
    setAwbDraft("");
    setView("entry");
  };

  const closeEntry = () => {
    setView("list");
    setEditing(null);
    setEntryForm(emptyEntryForm());
    setAwbDraft("");
  };

  const persistEntry = () => {
    if (!entryForm.area.code.trim() && !entryForm.area.name.trim()) {
      return toast.error("Area is required");
    }
    if (!entryForm.fieldExecutive.code.trim() && !entryForm.fieldExecutive.name.trim()) {
      return toast.error("Field Executive is required");
    }

    const formForSave = editing
      ? entryForm
      : { ...entryForm, drsDate: todayIso(), drsTime: nowDrsTime() };
    const payload = entryFormToRow(formForSave, editing, rows);

    if (editing) {
      setRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)),
      );
      toast.success("DRS saved");
    } else {
      setRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("DRS created");
    }
    closeEntry();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.drsNo}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "drs-scan.csv",
      ["DRS No", "Date", "Area", "Service Center", "Field Executive"],
      rows.map((r) => {
        const d = rowDisplay(r);
        return [d.drsNo, d.date, d.area, d.serviceCenter, d.fieldExecutive];
      }),
    );
    toast.success("Exported drs-scan.csv");
  };

  const exportDrsRowExcel = (row: DrsRow) => {
    const d = rowDisplay(row);
    const safeName = row.drsNo.replace(/\//g, "-");
    const awbHeaders = [
      "AWB No",
      "Book Date",
      "Origin",
      "Destination",
      "Customer",
      "Consignee",
      "Pcs",
      "Weight",
      "E-Way Bill No",
      "Shipment Value",
    ];

    if (row.awbLines.length > 0) {
      downloadCsv(
        `${safeName}.csv`,
        awbHeaders,
        row.awbLines.map((line) => [
          line.awbNo,
          line.bookDate,
          line.origin,
          line.destination,
          line.customer,
          line.consignee,
          line.pcs,
          line.weight,
          line.ewayBillNo,
          line.shipmentValue,
        ]),
      );
    } else {
      downloadCsv(
        `${safeName}.csv`,
        ["DRS No", "Date", "Area", "Service Center", "Field Executive", "DRS Time", "Remark"],
        [[d.drsNo, d.date, d.area, d.serviceCenter, d.fieldExecutive, row.drsTime, row.remark]],
      );
    }
    toast.success(`Exported ${safeName}.csv`);
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters(emptyColFilters());
    setPage(1);
    toast.success("List refreshed");
  };

  const clearColFilters = () => {
    setColFilters(emptyColFilters());
    setPage(1);
    toast.info("Column filters cleared");
  };

  const openFormSetup = () => {
    setFormSetupDraft({ ...formSetupSettings });
    setFormSetupOpen(true);
  };

  const closeFormSetup = () => {
    setFormSetupOpen(false);
    setFormSetupDraft({ ...formSetupSettings });
  };

  const handleFormSetupSave = () => {
    setFormSetupSettings({ ...formSetupDraft });
    setFormSetupOpen(false);
    toast.success("Form setup saved");
  };

  const patchEntry = (patch: Partial<DrsEntryForm>) =>
    setEntryForm((f) => ({ ...f, ...patch }));

  const addAwbLine = () => {
    if (!entryForm.area.code.trim() && !entryForm.area.name.trim()) {
      return toast.error("Area is required");
    }
    const awb = awbDraft.trim();
    if (!awb) return toast.error("AWB No is required");
    if (entryForm.awbLines.some((line) => line.awbNo === awb)) {
      return toast.error("AWB already added");
    }

    const line: DrsAwbLine = {
      id: crypto.randomUUID(),
      ...lookupAwb(awb, editing ? entryForm.drsDate : todayIso()),
    };
    patchEntry({ awbLines: [...entryForm.awbLines, line] });
    setAwbDraft("");
    toast.success(`AWB ${awb} added`);
  };

  const removeAwbLine = (lineId: string) => {
    patchEntry({ awbLines: entryForm.awbLines.filter((line) => line.id !== lineId) });
  };

  if (view === "entry") {
    const isEditing = editing !== null;
    const displayDrsDate = isEditing ? entryForm.drsDate : todayIso();
    const displayDrsTime = isEditing ? entryForm.drsTime : nowDrsTime();

    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "DRS Scan"]} />

        <Card className="min-w-0 overflow-hidden border p-0">
          <div className="space-y-4 p-4 md:p-6">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FieldWrapper label="DRS No.">
                    <Input value={entryForm.drsNo} disabled readOnly />
                  </FieldWrapper>
                  <FieldWrapper label="DRS Date">
                    <Input value={formatDisplayDate(displayDrsDate)} disabled readOnly />
                  </FieldWrapper>
                  <FieldWrapper label="DRS Time">
                    <Input value={displayDrsTime} disabled readOnly placeholder="HHmm" />
                  </FieldWrapper>
                  <FieldWrapper label="Field Executive">
                    <NameCodeLookupInput
                      lookup="fieldExecutive"
                      value={entryForm.fieldExecutive}
                      onChange={(fieldExecutive) => patchEntry({ fieldExecutive })}
                    />
                  </FieldWrapper>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FieldWrapper label="Area" required>
                    <AreaLookupInput
                      value={entryForm.area}
                      areaSeq={entryForm.areaSeq}
                      onChange={(area) => patchEntry({ area })}
                      onAreaSeqChange={(areaSeq) => patchEntry({ areaSeq })}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Remark" className="md:col-span-1 xl:col-span-2">
                    <Input
                      value={entryForm.remark}
                      onChange={(e) => patchEntry({ remark: e.target.value })}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="AWB No.">
                    <div className="flex gap-1">
                      <Input
                        value={awbDraft}
                        onChange={(e) => setAwbDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addAwbLine();
                          }
                        }}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        onClick={addAwbLine}
                        className="shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </FieldWrapper>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {isEditing ? (
                  <Button
                    onClick={persistEntry}
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                  >
                    Save
                  </Button>
                ) : (
                  <Button
                    onClick={() => toast.info("Excel merging will be enabled with backend wiring")}
                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                  >
                    Excel Merging
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-sky-600 text-sky-600 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950"
                  onClick={() => toast.info("Print will be enabled with backend wiring")}
                >
                  Print
                </Button>
                <Button variant="destructive" onClick={closeEntry}>
                  Close
                </Button>
              </div>
            </div>

            <p className="text-sm font-medium text-destructive">
              Total AWB Count : {entryForm.awbLines.length}
            </p>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[1200px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">AWB No</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Book Date</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Origin</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Customer</TableHead>
                    {formSetupSettings.allowConsigneeName ? (
                      <TableHead className="whitespace-nowrap text-sidebar-foreground">Consignee</TableHead>
                    ) : null}
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Pcs</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Weight</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">E-Way Bill No</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Shipment Value</TableHead>
                    <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entryForm.awbLines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={formSetupSettings.allowConsigneeName ? 11 : 10}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    entryForm.awbLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.awbNo}</TableCell>
                        <TableCell className="whitespace-nowrap">{line.bookDate}</TableCell>
                        <TableCell>{line.origin}</TableCell>
                        <TableCell>{line.destination}</TableCell>
                        <TableCell className="max-w-[10rem] truncate" title={line.customer}>
                          {line.customer}
                        </TableCell>
                        {formSetupSettings.allowConsigneeName ? (
                          <TableCell className="max-w-[10rem] truncate" title={line.consignee}>
                            {line.consignee}
                          </TableCell>
                        ) : null}
                        <TableCell>{line.pcs}</TableCell>
                        <TableCell className="whitespace-nowrap">{line.weight}</TableCell>
                        <TableCell>{line.ewayBillNo || ""}</TableCell>
                        <TableCell className="whitespace-nowrap">{line.shipmentValue}</TableCell>
                        <TableCell className="text-center">
                          <IconButton
                            label="Remove AWB"
                            variant="ghost"
                            size="row"
                            className="text-destructive"
                            onClick={() => removeAwbLine(line.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "DRS Scan"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">DRS Scan</h1>
        <p className="text-sm text-muted-foreground">
          Create delivery run sheets and scan AWBs for field executives.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <IconButton label="Export" onClick={handleExport}>
              <Download className="h-4 w-4" />
            </IconButton>
            <IconButton label="Refresh" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
            <IconButton label="Clear filters" onClick={clearColFilters}>
              <Filter className="h-4 w-4" />
            </IconButton>
            <IconButton label="Form Setup" onClick={openFormSetup}>
              <Settings className="h-4 w-4" />
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
          <table className="w-full min-w-[900px] caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="whitespace-nowrap text-sidebar-foreground">DRS No.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Date</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Area</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Service Center</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Field Executive</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["drsNo", "DRS No."],
                    ["date", "Date"],
                    ["area", "Area"],
                    ["serviceCenter", "Service Center"],
                    ["fieldExecutive", "Field Executive"],
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
                  <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => {
                  const d = rowDisplay(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[12rem] truncate font-medium">{d.drsNo}</TableCell>
                      <TableCell className="whitespace-nowrap">{d.date}</TableCell>
                      <TableCell>{d.area}</TableCell>
                      <TableCell>{d.serviceCenter}</TableCell>
                      <TableCell>{d.fieldExecutive}</TableCell>
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
                            className="text-amber-600"
                            onClick={() =>
                              toast.info(`Print ${row.drsNo} will be enabled with backend wiring`)
                            }
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Excel"
                            variant="ghost"
                            size="row"
                            className="text-emerald-600"
                            onClick={() => exportDrsRowExcel(row)}
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </table>
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

      <Dialog open={formSetupOpen} onOpenChange={(o) => !o && closeFormSetup()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Form Setup
            </DialogTitle>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="allowConsigneeName"
                checked={formSetupDraft.allowConsigneeName}
                onCheckedChange={(c) =>
                  setFormSetupDraft((s) => ({ ...s, allowConsigneeName: c === true }))
                }
              />
              <label htmlFor="allowConsigneeName" className="text-sm text-foreground">
                Allow Consignee Name in DRS
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button
              onClick={handleFormSetupSave}
              className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            >
              Save
            </Button>
            <Button variant="destructive" onClick={closeFormSetup}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DRS?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.drsNo} and its scanned AWBs.
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

function NameCodeLookupInput({
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
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-24"
          placeholder="Code"
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
        onSelect={(_v, option: LookupOption) =>
          onChange({ code: option.code, name: option.name })
        }
      />
    </>
  );
}

function AreaLookupInput({
  value,
  areaSeq,
  onChange,
  onAreaSeqChange,
}: {
  value: LookupPair;
  areaSeq: string;
  onChange: (v: LookupPair) => void;
  onAreaSeqChange: (seq: string) => void;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name || value.code}
          onChange={(e) => onChange({ ...value, name: e.target.value, code: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Area"
        />
        <Input
          value={areaSeq}
          onChange={(e) => onAreaSeqChange(e.target.value)}
          className="w-16"
          placeholder="Seq"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search area"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup="area"
        returnField="code"
        onSelect={(_v, option: LookupOption) =>
          onChange({ code: option.code, name: option.name })
        }
      />
    </>
  );
}
