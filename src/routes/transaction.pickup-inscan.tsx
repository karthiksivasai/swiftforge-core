import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileBarChart, Settings, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  FieldWrapper,
  IconButton,
  MasterBreadcrumb,
  downloadCsv,
} from "@/components/master-table-kit";
import {
  SearchableLookupPair,
  type LookupPairValue,
} from "@/components/masters/searchable-lookup-pair";
import { type LookupKey } from "@/lib/master-lookups";

type LookupPair = LookupPairValue;

const PI_INPUT =
  "h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0";
const PI_SELECT =
  "h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0";
const PI_GRID =
  "grid grid-cols-1 gap-x-3 gap-y-2.5 md:grid-cols-2 xl:grid-cols-4 [&_label]:whitespace-nowrap [&_label]:text-[11px]";

function InscanLookupField({
  label,
  lookup,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  lookup: LookupKey;
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <FieldWrapper borderLabel lookupSplit label={label} required={required}>
      <SearchableLookupPair
        lookup={lookup}
        value={value}
        onChange={onChange}
        disabled={disabled}
        compact
        splitCode
      />
    </FieldWrapper>
  );
}

type InscanRecord = {
  id: string;
  scanDate: string;
  scanTime: string;
  serviceCenter: string;
  fieldExecutive: LookupPair;
  pickupNo: string;
  awbNo: string;
  product: LookupPair;
  paymentType: string;
  consigneeName: string;
  hold: boolean;
  holdRemarks: string;
  hubScan: boolean;
};

type InscanForm = Omit<InscanRecord, "id" | "hubScan">;

type SetupSettings = {
  awbAutoSave: boolean;
  hubScan: boolean;
};

type FormSetupField = "product" | "paymentType" | "consigneeName";

type FormSetupSettings = Record<FormSetupField, boolean>;

type ReportForm = {
  fromDate: string;
  toDate: string;
  customer: LookupPair;
  fieldExecutive: LookupPair;
};

const FORM_SETUP_FIELDS: FormSetupField[] = ["product", "paymentType", "consigneeName"];

const defaultSetup = (): SetupSettings => ({
  awbAutoSave: true,
  hubScan: true,
});

const defaultFormSetup = (): FormSetupSettings => ({
  product: true,
  paymentType: true,
  consigneeName: true,
});

const PAYMENT_TYPES = ["Cash", "Cheque", "Credit", "To Pay"] as const;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => new Date().toISOString().slice(0, 10);

const nowScanTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const emptyForm = (): InscanForm => ({
  scanDate: todayIso(),
  scanTime: nowScanTime(),
  serviceCenter: "HYD",
  fieldExecutive: emptyPair(),
  pickupNo: "",
  awbNo: "",
  product: emptyPair(),
  paymentType: "",
  consigneeName: "",
  hold: false,
  holdRemarks: "",
});

const emptyReportForm = (): ReportForm => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  customer: emptyPair(),
  fieldExecutive: emptyPair(),
});

export const Route = createFileRoute("/transaction/pickup-inscan")({
  head: () => ({
    meta: [
      { title: "Pickup Inscan — Transaction — Courier ERP" },
      { name: "description", content: "Scan and inscan pickup shipments at the service centre." },
    ],
  }),
  component: PickupInscanPage,
});

function PickupInscanPage() {
  const [records, setRecords] = useState<InscanRecord[]>([]);
  const [form, setForm] = useState<InscanForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSettings, setSetupSettings] = useState<SetupSettings>(defaultSetup);
  const [setupDraft, setSetupDraft] = useState<SetupSettings>(defaultSetup);
  const [formSetupOpen, setFormSetupOpen] = useState(false);
  const [formSetupSettings, setFormSetupSettings] = useState<FormSetupSettings>(defaultFormSetup);
  const [formSetupDraft, setFormSetupDraft] = useState<FormSetupSettings>(defaultFormSetup);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState<ReportForm>(emptyReportForm);

  const patchReport = (patch: Partial<ReportForm>) => setReportForm((f) => ({ ...f, ...patch }));

  const isFieldDisabled = (field: FormSetupField) => formSetupSettings[field];

  const openSetup = () => {
    setSetupDraft({ ...setupSettings });
    setSetupOpen(true);
  };

  const closeSetup = () => {
    setSetupOpen(false);
    setSetupDraft({ ...setupSettings });
  };

  const handleSetupSave = () => {
    setSetupSettings({ ...setupDraft });
    setSetupOpen(false);
    toast.success("Setup saved");
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

  const openReport = () => {
    setReportForm(emptyReportForm());
    setReportOpen(true);
  };

  const closeReport = () => {
    setReportOpen(false);
    setReportForm(emptyReportForm());
  };

  const handleReportExcel = () => {
    if (!reportForm.fromDate.trim()) return toast.error("From Date is required");
    if (!reportForm.toDate.trim()) return toast.error("To Date is required");
    if (reportForm.fromDate > reportForm.toDate) {
      return toast.error("From Date cannot be after To Date");
    }

    const reportRows = records.filter((row) => {
      if (row.scanDate < reportForm.fromDate || row.scanDate > reportForm.toDate) return false;
      if (reportForm.fieldExecutive.code.trim()) {
        if (row.fieldExecutive.code !== reportForm.fieldExecutive.code.trim()) return false;
      } else if (reportForm.fieldExecutive.name.trim()) {
        if (!row.fieldExecutive.name.toLowerCase().includes(reportForm.fieldExecutive.name.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    downloadCsv(
      "pickup-inscan-report.csv",
      [
        "Scan Date",
        "Scan Time",
        "Service Center",
        "Field Executive Code",
        "Field Executive Name",
        "PickUp No",
        "AWB No",
        "Hold",
        "Hold Remarks",
        "Product Code",
        "Product Name",
        "Payment Type",
        "Consignee Name",
      ],
      reportRows.map((row) => [
        row.scanDate,
        row.scanTime,
        row.serviceCenter,
        row.fieldExecutive.code,
        row.fieldExecutive.name,
        row.pickupNo,
        row.awbNo,
        row.hold ? "Yes" : "No",
        row.holdRemarks,
        row.product.code,
        row.product.name,
        row.paymentType,
        row.consigneeName,
      ]),
    );

    toast.success(
      reportRows.length > 0
        ? `Exported ${reportRows.length} inscan record${reportRows.length === 1 ? "" : "s"} to Excel`
        : "No inscan records matched the report filters — empty export downloaded",
    );
  };

  const allFormSetupChecked = FORM_SETUP_FIELDS.every((f) => formSetupDraft[f]);

  const toggleAllFormSetup = (checked: boolean) => {
    setFormSetupDraft({
      product: checked,
      paymentType: checked,
      consigneeName: checked,
    });
  };

  const saveRecord = (options?: { silent?: boolean }) => {
    if (!form.scanDate) {
      if (!options?.silent) toast.error("Scan Date is required");
      return false;
    }
    if (!form.scanTime.trim()) {
      if (!options?.silent) toast.error("Scan Time is required");
      return false;
    }
    if (!form.serviceCenter.trim()) {
      if (!options?.silent) toast.error("Service Center is required");
      return false;
    }
    if (!form.awbNo.trim()) {
      if (!options?.silent) toast.error("AWB No is required");
      return false;
    }

    const payload = {
      scanDate: form.scanDate,
      scanTime: form.scanTime.trim(),
      serviceCenter: form.serviceCenter.trim(),
      fieldExecutive: { ...form.fieldExecutive },
      pickupNo: form.pickupNo.trim(),
      awbNo: form.awbNo.trim(),
      product: { ...form.product },
      paymentType: form.paymentType.trim(),
      consigneeName: form.consigneeName.trim(),
      hold: form.hold,
      holdRemarks: form.holdRemarks.trim(),
      hubScan: setupSettings.hubScan,
    };

    if (editingId) {
      setRecords((prev) => prev.map((r) => (r.id === editingId ? { ...payload, id: editingId } : r)));
      if (!options?.silent) toast.success("Inscan record updated");
    } else {
      setRecords((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      if (!options?.silent) toast.success("Inscan record saved");
    }
    setEditingId(null);
    setForm(emptyForm());
    return true;
  };

  const tryAwbAutoSave = () => {
    if (!setupSettings.awbAutoSave || !form.awbNo.trim()) return;
    saveRecord({ silent: true });
    toast.success("AWB auto-saved");
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    toast.success("Ready for new inscan entry");
  };

  const openEdit = () => {
    const key = form.pickupNo.trim() || form.awbNo.trim();
    if (!key) return toast.error("Enter PickUp No or AWB No to edit");

    const match = records.find(
      (r) =>
        (form.pickupNo.trim() && r.pickupNo === form.pickupNo.trim()) ||
        (form.awbNo.trim() && r.awbNo === form.awbNo.trim()),
    );
    if (!match) return toast.error("No inscan record found for the entered PickUp No / AWB No");

    setEditingId(match.id);
    setForm({
      scanDate: match.scanDate,
      scanTime: match.scanTime,
      serviceCenter: match.serviceCenter,
      fieldExecutive: { ...match.fieldExecutive },
      pickupNo: match.pickupNo,
      awbNo: match.awbNo,
      product: { ...match.product },
      paymentType: match.paymentType,
      consigneeName: match.consigneeName,
      hold: match.hold,
      holdRemarks: match.holdRemarks,
    });
    toast.success("Record loaded for edit");
  };

  const handleReset = () => {
    setEditingId(null);
    setForm(emptyForm());
    toast.success("Form reset");
  };

  const handleSave = () => {
    saveRecord();
  };

  const showOptionalFields = FORM_SETUP_FIELDS.some((f) => !formSetupSettings[f]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Transaction", "Pickup Inscan"]} />

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <IconButton label="Report" onClick={openReport}>
                <FileBarChart className="h-4 w-4" />
              </IconButton>
              <IconButton label="Setup" onClick={openSetup}>
                <Settings className="h-4 w-4" />
              </IconButton>
              <IconButton label="Manifest Inscan Form Setup" onClick={openFormSetup}>
                <Wrench className="h-4 w-4" />
              </IconButton>
            </div>
          </TooltipProvider>
        </div>

        <div className="p-4 md:p-6">
          <div className="relative min-w-0 rounded border border-border bg-card p-4 pt-6 shadow-none md:p-6 md:pt-7">
            <span className="absolute left-2.5 top-1 z-20 inline-flex h-6 -translate-y-1/2 items-center whitespace-nowrap rounded-full bg-sidebar px-3 text-[14px] font-semibold leading-none text-sidebar-foreground">
              Inscan
            </span>

            <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={openAdd}
                  className="h-9 bg-emerald-600 text-white hover:bg-emerald-600/90"
                >
                  Add
                </Button>
                <Button size="sm" variant="secondary" onClick={openEdit} className="h-9">
                  Edit
                </Button>
              </div>

              <div className={PI_GRID}>
            <FieldWrapper borderLabel label="Scan Date" required>
              <Input
                type="date"
                className={PI_INPUT}
                value={form.scanDate}
                onChange={(e) => setForm((f) => ({ ...f, scanDate: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper borderLabel label="Scan Time" required>
              <Input
                className={PI_INPUT}
                value={form.scanTime}
                onChange={(e) => setForm((f) => ({ ...f, scanTime: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                placeholder="HHmm"
                inputMode="numeric"
                maxLength={4}
              />
            </FieldWrapper>
            <FieldWrapper borderLabel label="Service Center">
              <Input
                className={PI_INPUT}
                value={form.serviceCenter}
                onChange={(e) => setForm((f) => ({ ...f, serviceCenter: e.target.value.toUpperCase() }))}
              />
            </FieldWrapper>
            <InscanLookupField
              label="Field Executive"
              lookup="fieldExecutive"
              value={form.fieldExecutive}
              onChange={(v) => setForm((f) => ({ ...f, fieldExecutive: v }))}
            />

            <FieldWrapper borderLabel label="PickUp No">
              <Input
                className={PI_INPUT}
                value={form.pickupNo}
                onChange={(e) => setForm((f) => ({ ...f, pickupNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper borderLabel label="AWB No." required>
              <Input
                className={PI_INPUT}
                value={form.awbNo}
                onChange={(e) => setForm((f) => ({ ...f, awbNo: e.target.value }))}
                onBlur={tryAwbAutoSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (setupSettings.awbAutoSave) tryAwbAutoSave();
                    else handleSave();
                  }
                }}
              />
            </FieldWrapper>
            <FieldWrapper borderLabel label="Hold" className="md:col-span-2 xl:col-span-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                <Checkbox
                  id="hold"
                  checked={form.hold}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, hold: c === true }))}
                />
                <Input
                  className={`min-w-0 flex-1 ${PI_INPUT}`}
                  value={form.holdRemarks}
                  disabled={!form.hold}
                  onChange={(e) => setForm((f) => ({ ...f, holdRemarks: e.target.value }))}
                />
              </div>
            </FieldWrapper>
          </div>

          {showOptionalFields ? (
            <div className={`${PI_GRID} mt-2.5`}>
              {!isFieldDisabled("product") ? (
                <InscanLookupField
                  label="Product"
                  lookup="product"
                  value={form.product}
                  onChange={(v) => setForm((f) => ({ ...f, product: v }))}
                />
              ) : null}
              {!isFieldDisabled("paymentType") ? (
                <FieldWrapper borderLabel label="Payment Type">
                  <Select
                    value={form.paymentType || undefined}
                    onValueChange={(v) => setForm((f) => ({ ...f, paymentType: v }))}
                  >
                    <SelectTrigger className={PI_SELECT}>
                      <SelectValue placeholder="Select Payment Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TYPES.map((pt) => (
                        <SelectItem key={pt} value={pt}>
                          {pt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
              ) : null}
              {!isFieldDisabled("consigneeName") ? (
                <FieldWrapper borderLabel label="Consignee Name">
                  <Input
                    className={PI_INPUT}
                    value={form.consigneeName}
                    onChange={(e) => setForm((f) => ({ ...f, consigneeName: e.target.value }))}
                  />
                </FieldWrapper>
              ) : null}
            </div>
          ) : null}

              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
                <Button variant="destructive" onClick={handleReset}>Reset</Button>
              </div>
          </div>
        </div>
      </Card>

      <Dialog open={reportOpen} onOpenChange={(open) => !open && closeReport()}>
        <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Inscan Report
            </DialogTitle>
          </div>
          <div className="p-6">
            <div className={PI_GRID}>
              <FieldWrapper borderLabel label="From Date" required>
                <Input
                  type="date"
                  className={PI_INPUT}
                  value={reportForm.fromDate}
                  onChange={(e) => patchReport({ fromDate: e.target.value })}
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="To Date" required>
                <Input
                  type="date"
                  className={PI_INPUT}
                  value={reportForm.toDate}
                  onChange={(e) => patchReport({ toDate: e.target.value })}
                />
              </FieldWrapper>
              <InscanLookupField
                label="Customer"
                lookup="customer"
                value={reportForm.customer}
                onChange={(customer) => patchReport({ customer })}
              />
              <InscanLookupField
                label="Field Executive"
                lookup="fieldExecutive"
                value={reportForm.fieldExecutive}
                onChange={(fieldExecutive) => patchReport({ fieldExecutive })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button
              onClick={handleReportExcel}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              Excel
            </Button>
            <Button variant="destructive" onClick={closeReport}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={setupOpen} onOpenChange={(o) => !o && closeSetup()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Setup</DialogTitle>
          </div>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="awbAutoSave"
                checked={setupDraft.awbAutoSave}
                onCheckedChange={(c) => setSetupDraft((s) => ({ ...s, awbAutoSave: c === true }))}
              />
              <label htmlFor="awbAutoSave" className="text-sm text-foreground">Pickup Inscan AWB Auto Save</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="hubScan"
                checked={setupDraft.hubScan}
                onCheckedChange={(c) => setSetupDraft((s) => ({ ...s, hubScan: c === true }))}
              />
              <label htmlFor="hubScan" className="text-sm text-foreground">HUB SCAN</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleSetupSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={closeSetup}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={formSetupOpen} onOpenChange={(o) => !o && closeFormSetup()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Manifest Inscan Form Setup
            </DialogTitle>
          </div>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="checkAllFormSetup"
                checked={allFormSetupChecked}
                onCheckedChange={(c) => toggleAllFormSetup(c === true)}
              />
              <label htmlFor="checkAllFormSetup" className="text-sm font-medium text-foreground">
                Check/Uncheck All
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="formSetupProduct"
                checked={formSetupDraft.product}
                onCheckedChange={(c) => setFormSetupDraft((s) => ({ ...s, product: c === true }))}
              />
              <label htmlFor="formSetupProduct" className="text-sm text-foreground">Product</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="formSetupPaymentType"
                checked={formSetupDraft.paymentType}
                onCheckedChange={(c) => setFormSetupDraft((s) => ({ ...s, paymentType: c === true }))}
              />
              <label htmlFor="formSetupPaymentType" className="text-sm text-foreground">Payment Type</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="formSetupConsigneeName"
                checked={formSetupDraft.consigneeName}
                onCheckedChange={(c) => setFormSetupDraft((s) => ({ ...s, consigneeName: c === true }))}
              />
              <label htmlFor="formSetupConsigneeName" className="text-sm text-foreground">Consignee Name</label>
            </div>
            <p className="text-sm text-muted-foreground">
              Note : Fields will be disabled if checked, and enabled if unchecked.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleFormSetupSave} className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Save
            </Button>
            <Button variant="destructive" onClick={closeFormSetup}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
