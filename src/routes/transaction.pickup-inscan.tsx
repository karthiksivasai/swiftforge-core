import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Settings, Wrench, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };

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

const SERVICE_CENTRES = MASTER_LOOKUPS.serviceCentre.options;
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

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Transaction", "Pickup Inscan"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pickup Inscan</h1>
        <p className="text-sm text-muted-foreground">
          Scan pickup shipments at the service centre for inscan processing.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <IconButton label="Document" onClick={() => toast.info("Document view will be enabled with backend wiring")}>
                <FileText className="h-4 w-4" />
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
          <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Inscan</Badge>

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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="Scan Date" required>
              <Input
                type="date"
                value={form.scanDate}
                onChange={(e) => setForm((f) => ({ ...f, scanDate: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Scan Time" required>
              <Input
                value={form.scanTime}
                onChange={(e) => setForm((f) => ({ ...f, scanTime: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                placeholder="HHmm"
                inputMode="numeric"
                maxLength={4}
              />
            </FieldWrapper>
            <FieldWrapper label="Service Center">
              <Select value={form.serviceCenter} onValueChange={(v) => setForm((f) => ({ ...f, serviceCenter: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_CENTRES.map((sc) => (
                    <SelectItem key={sc.code} value={sc.code}>{sc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Field Executive">
              <LookupPairInput
                lookup="fieldExecutive"
                value={form.fieldExecutive}
                onChange={(v) => setForm((f) => ({ ...f, fieldExecutive: v }))}
              />
            </FieldWrapper>

            <FieldWrapper label="PickUp No">
              <Input
                value={form.pickupNo}
                onChange={(e) => setForm((f) => ({ ...f, pickupNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="AWB No." required>
              <Input
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

            <FieldWrapper label="Product">
              <LookupPairInput
                lookup="product"
                value={form.product}
                disabled={isFieldDisabled("product")}
                onChange={(v) => setForm((f) => ({ ...f, product: v }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Payment Type">
              <Select
                value={form.paymentType || undefined}
                disabled={isFieldDisabled("paymentType")}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentType: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select Payment Type" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map((pt) => (
                    <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Consignee Name">
              <Input
                value={form.consigneeName}
                disabled={isFieldDisabled("consigneeName")}
                onChange={(e) => setForm((f) => ({ ...f, consigneeName: e.target.value }))}
              />
            </FieldWrapper>

            <div className="flex items-end gap-2 pb-1 lg:col-span-2">
              <div className="flex shrink-0 items-center gap-2">
                <Checkbox
                  id="hold"
                  checked={form.hold}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, hold: c === true }))}
                />
                <label htmlFor="hold" className="text-sm text-muted-foreground">Hold</label>
              </div>
              <Input
                value={form.holdRemarks}
                disabled={!form.hold}
                onChange={(e) => setForm((f) => ({ ...f, holdRemarks: e.target.value }))}
                className="flex-1"
                placeholder=""
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={handleReset}>Reset</Button>
          </div>
        </div>
      </Card>

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

function LookupPairInput({
  value,
  onChange,
  lookup,
  disabled,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
  disabled?: boolean;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.code}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-24"
          placeholder="Code"
        />
        <Input
          value={value.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="flex-1"
          placeholder="Name"
        />
        <Button
          size="icon"
          variant="outline"
          disabled={disabled}
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
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
