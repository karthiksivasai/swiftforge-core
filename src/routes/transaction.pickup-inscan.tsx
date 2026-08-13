import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileBarChart, Settings, Wrench, ShieldAlert, CheckCircle2, RotateCcw, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { playScanSuccessBeep, playScanErrorBeep } from "@/lib/audioFeedback";
import {
  recordPickupInscan,
  recordUndeliveryScan,
  listPickupInscans,
  listUndeliveryInscans,
  listInscanRemarks,
  getInscanReconciliation,
  type PickupInscanEventRow,
  type RecordPickupInscanInput,
  type RecordUndeliveryScanInput,
  type InscanReconciliationResult,
} from "@/lib/transactions/resources/pickupInscan";

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

type InscanForm = {
  scanDate: string;
  scanTime: string;
  serviceCenter: string;
  fieldExecutive: LookupPair;
  vendor: LookupPair;
  pickupNo: string;
  awbNo: string;
  product: LookupPair;
  paymentType: string;
  consigneeName: string;
  hold: boolean;
  holdRemarks: string;
};

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
  remarkCode: string;
  masterAwbNo: string;
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

const loadSavedSetup = (): SetupSettings => {
  try {
    const s = localStorage.getItem("cms_pickup_inscan_setup");
    if (s) return JSON.parse(s);
  } catch {
    // fallback
  }
  return defaultSetup();
};

const loadSavedFormSetup = (): FormSetupSettings => {
  try {
    const s = localStorage.getItem("cms_pickup_inscan_form_setup");
    if (s) return JSON.parse(s);
  } catch {
    // fallback
  }
  return defaultFormSetup();
};

const PAYMENT_TYPES = ["Cash", "Cheque", "Credit", "To Pay"] as const;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => new Date().toISOString().slice(0, 10);

const nowScanTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const emptyForm = (defaultSc = "HYD"): InscanForm => ({
  scanDate: todayIso(),
  scanTime: nowScanTime(),
  serviceCenter: defaultSc,
  fieldExecutive: emptyPair(),
  vendor: emptyPair(),
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
  remarkCode: "",
  masterAwbNo: "",
});

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err || "An error occurred");
}

export const Route = createFileRoute("/transaction/pickup-inscan")({
  head: () => ({
    meta: [
      { title: "Pickup Inscan — Transaction — Courier ERP" },
      { name: "description", content: "Scan and inscan pickup shipments at the service centre." },
    ],
  }),
  component: PickupInscanPage,
});

export type InscanMode = "pickup" | "undelivery";

export function PickupInscanPage({ mode = "pickup" }: { mode?: InscanMode } = {}) {
  const isUndelivery = mode === "undelivery";
  const { isAuthenticated: authed, profile } = useAuth();
  const queryClient = useQueryClient();

  const userBranchQuery = useQuery({
    queryKey: ["userBranch", profile?.home_branch_id],
    queryFn: async () => {
      if (!profile?.home_branch_id) return null;
      const { data, error } = await supabase
        .from("branches")
        .select("id, code, name")
        .eq("id", profile.home_branch_id)
        .maybeSingle();
      if (error || !data) return null;
      return data as { id: string; code: string; name: string };
    },
    enabled: Boolean(authed && profile?.home_branch_id),
  });

  const defaultBranchCode =
    userBranchQuery.data?.code ||
    (profile as unknown as { branchCode?: string })?.branchCode ||
    "HYD";
  const defaultBranchId = userBranchQuery.data?.id || profile?.home_branch_id;

  const [form, setForm] = useState<InscanForm>(() => emptyForm(defaultBranchCode));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSettings, setSetupSettings] = useState<SetupSettings>(loadSavedSetup);
  const [setupDraft, setSetupDraft] = useState<SetupSettings>(loadSavedSetup);
  const [formSetupOpen, setFormSetupOpen] = useState(false);
  const [formSetupSettings, setFormSetupSettings] = useState<FormSetupSettings>(loadSavedFormSetup);
  const [formSetupDraft, setFormSetupDraft] = useState<FormSetupSettings>(loadSavedFormSetup);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState<ReportForm>(emptyReportForm);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [localRows, setLocalRows] = useState<PickupInscanEventRow[]>([]);

  // Keep branch default updated with logged-in user profile
  useEffect(() => {
    if (defaultBranchCode && form.serviceCenter === "HYD" && defaultBranchCode !== "HYD") {
      setForm((f) => ({ ...f, serviceCenter: defaultBranchCode }));
    }
  }, [defaultBranchCode, form.serviceCenter]);

  // Live queries
  const { data: dbRecords } = useQuery({
    queryKey: [isUndelivery ? "undelivery-inscan-events" : "pickup-inscan-events", form.scanDate, form.serviceCenter],
    queryFn: () =>
      isUndelivery
        ? listUndeliveryInscans({ scanDate: form.scanDate, serviceCenterCode: form.serviceCenter })
        : listPickupInscans({ scanDate: form.scanDate, serviceCenterCode: form.serviceCenter }),
    enabled: authed,
  });

  const { data: remarkOptions = [] } = useQuery({
    queryKey: ["inscan-remarks"],
    queryFn: listInscanRemarks,
    enabled: authed,
  });

  const { data: reconciliationData, isFetching: isFetchingRecon } = useQuery({
    queryKey: ["inscan-reconciliation", form.scanDate, defaultBranchId],
    queryFn: () =>
      getInscanReconciliation({
        fromDate: form.scanDate,
        toDate: form.scanDate,
        branchId: defaultBranchId || undefined,
      }),
    enabled: authed && reconciliationOpen,
  });

  const records = authed ? (dbRecords ?? []) : localRows;

  const patchReport = (patch: Partial<ReportForm>) => setReportForm((f) => ({ ...f, ...patch }));

  const isFieldDisabled = (field: FormSetupField) => formSetupSettings[field];

  const handleVerifyPickupNo = async (pickupNoVal: string) => {
    const cleanNo = pickupNoVal.trim();
    if (!cleanNo) return;
    if (!authed) return;

    try {
      const { data, error } = await supabase
        .from("pickups")
        .select(`
          id,
          pickup_no,
          status,
          mobile_no,
          shipper_name,
          pay_option,
          field_executive:field_executives(id, code, name),
          customer:customers(id, code, name),
          shipper:shippers(id, code, name)
        `)
        .eq("pickup_no", parseInt(cleanNo, 10))
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.warning(`PickUp #${cleanNo} not found in database`);
        return;
      }

      if (data.status === "CANCELLED") {
        playScanErrorBeep();
        toast.error(`PickUp #${cleanNo} was CANCELLED and cannot be inscanned`);
        return;
      }

      const rawFe = data.field_executive as unknown;
      const fe = Array.isArray(rawFe) ? rawFe[0] : rawFe;
      const rawCust = data.customer as unknown;
      const cust = Array.isArray(rawCust) ? rawCust[0] : rawCust;
      const rawShp = data.shipper as unknown;
      const shp = Array.isArray(rawShp) ? rawShp[0] : rawShp;

      // Auto-fill field executive and payment type
      setForm((prev) => ({
        ...prev,
        pickupNo: String(data.pickup_no),
        fieldExecutive:
          !prev.fieldExecutive.code && fe
            ? {
                id: (fe as { id: string; code: string; name: string }).id,
                code: (fe as { id: string; code: string; name: string }).code,
                name: (fe as { id: string; code: string; name: string }).name,
              }
            : prev.fieldExecutive,
        paymentType: prev.paymentType || (data.pay_option ? String(data.pay_option) : ""),
      }));

      const custName = (cust as { name?: string })?.name || "";
      const shpName = (shp as { name?: string })?.name || data.shipper_name || "";
      toast.success(
        `Verified PickUp #${cleanNo} (${custName ? "Cust: " + custName : ""} ${shpName ? "· Shp: " + shpName : ""})`,
      );
    } catch (err) {
      toast.error(`Verification error: ${toErrorMessage(err)}`);
    }
  };

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
    try {
      localStorage.setItem("cms_pickup_inscan_setup", JSON.stringify(setupDraft));
    } catch {}
    setSetupOpen(false);
    toast.success("Setup saved & persisted to workstation");
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
    try {
      localStorage.setItem("cms_pickup_inscan_form_setup", JSON.stringify(formSetupDraft));
    } catch {}
    setFormSetupOpen(false);
    toast.success("Form setup saved & persisted to workstation");
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
      if (row.scan_date < reportForm.fromDate || row.scan_date > reportForm.toDate) return false;
      if (reportForm.fieldExecutive.code.trim()) {
        if (row.field_executive_code !== reportForm.fieldExecutive.code.trim()) return false;
      }
      if (reportForm.remarkCode.trim()) {
        if ((row.remark_code || row.hold_reason_code) !== reportForm.remarkCode.trim()) return false;
      }
      if (reportForm.masterAwbNo.trim()) {
        if (!row.awb_no.toUpperCase().includes(reportForm.masterAwbNo.trim().toUpperCase())) return false;
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
        "Vendor Code",
        "PickUp No",
        "AWB No",
        "Hold",
        "Remark Code",
        "Product Code",
        "Payment Type",
        "Consignee Name",
        "Created At",
      ],
      reportRows.map((row) => [
        row.scan_date,
        row.scan_time,
        row.service_center_code,
        row.field_executive_code || "",
        row.vendor_code || "",
        row.pickup_no || "",
        row.awb_no,
        row.is_held ? "Yes" : "No",
        row.remark_code || row.hold_reason_code || "",
        row.product_code || "",
        row.payment_type || "",
        row.consignee_name || "",
        row.created_at,
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

  const saveMutation = useMutation({
    mutationFn: async (payload: RecordPickupInscanInput) => {
      if (authed) {
        if (isUndelivery) {
          const udPayload: RecordUndeliveryScanInput = {
            scanDate: payload.scanDate,
            scanTime: payload.scanTime,
            serviceCenterCode: payload.serviceCenterCode,
            awbNo: payload.awbNo,
            pickupNo: payload.pickupNo,
            vendorId: payload.vendorId,
            vendorCode: payload.vendorCode,
            remarkCode: payload.remarkCode,
            hubScan: payload.hubScan,
          };
          const res = await recordUndeliveryScan(udPayload);
          // Normalise return shape to match pickup inscan return
          return {
            ...res,
            pickup_no: undefined,
            is_held: false,
            pickup_confirmed: false,
          };
        }
        return await recordPickupInscan(payload);
      } else {
        const mockRow: PickupInscanEventRow = {
          id: crypto.randomUUID(),
          tenant_id: "demo-tenant",
          service_center_code: payload.serviceCenterCode,
          scan_date: payload.scanDate,
          scan_time: payload.scanTime,
          pickup_no: payload.pickupNo,
          awb_no: payload.awbNo,
          field_executive_code: payload.fieldExecutiveCode,
          vendor_code: payload.vendorCode,
          product_code: payload.productCode,
          payment_type: payload.paymentType,
          consignee_name: payload.consigneeName,
          is_held: Boolean(payload.isHeld),
          hold_reason_code: payload.holdReasonCode,
          remark_code: payload.remarkCode,
          hub_scan: Boolean(payload.hubScan),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          row_version: 1,
        };
        setLocalRows((prev) => [mockRow, ...prev]);
        return {
          id: mockRow.id,
          awb_no: mockRow.awb_no,
          pickup_no: mockRow.pickup_no ?? undefined,
          service_center_code: mockRow.service_center_code,
          scan_date: mockRow.scan_date,
          scan_time: mockRow.scan_time,
          is_held: mockRow.is_held,
          pickup_confirmed: Boolean(mockRow.pickup_no),
          created_at: mockRow.created_at,
        };
      }
    },
    onSuccess: (res) => {
      playScanSuccessBeep();
      queryClient.invalidateQueries({ queryKey: ["pickup-inscan-events"] });
      queryClient.invalidateQueries({ queryKey: ["undelivery-inscan-events"] });
      queryClient.invalidateQueries({ queryKey: ["pickups"] });
      queryClient.invalidateQueries({ queryKey: ["inscan-reconciliation"] });
      toast.success(
        isUndelivery
          ? `AWB ${res.awb_no} — Shipment Undelivered Received (hub receipt confirmed)`
          : res.is_held
            ? `AWB ${res.awb_no} inscanned on HOLD (${form.holdRemarks || "Reason specified"})`
            : `AWB ${res.awb_no} inscanned successfully${res.pickup_confirmed ? " (Pickup Confirmed)" : ""}`,
      );
      setEditingId(null);
      setForm((prev) => ({
        ...prev,
        scanTime: nowScanTime(),
        pickupNo: "",
        awbNo: "",
        hold: false,
        holdRemarks: "",
      }));
    },
    onError: (err) => {
      playScanErrorBeep();
      toast.error(toErrorMessage(err));
    },
  });

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
    if (form.hold && !form.holdRemarks.trim()) {
      if (!options?.silent) toast.error("Hold Remark is required when Hold is selected");
      return false;
    }

    const payload: RecordPickupInscanInput = {
      scanDate: form.scanDate,
      scanTime: form.scanTime.trim(),
      serviceCenterCode: form.serviceCenter.trim().toUpperCase(),
      awbNo: form.awbNo.trim().toUpperCase(),
      pickupNo: form.pickupNo.trim() || null,
      fieldExecutiveId: form.fieldExecutive.id || null,
      fieldExecutiveCode: form.fieldExecutive.code.trim() || null,
      vendorId: form.vendor.id || null,
      vendorCode: form.vendor.code.trim() || null,
      productId: form.product.id || null,
      productCode: form.product.code.trim() || null,
      paymentType: form.paymentType.trim() || null,
      consigneeName: form.consigneeName.trim() || null,
      isHeld: form.hold,
      holdReasonCode: form.hold ? form.holdRemarks.trim() : null,
      remarkCode: form.holdRemarks.trim() || null,
      hubScan: setupSettings.hubScan,
    };

    saveMutation.mutate(payload);
    return true;
  };

  const tryAwbAutoSave = () => {
    if (!setupSettings.awbAutoSave || !form.awbNo.trim() || saveMutation.isPending) return;
    saveRecord({ silent: true });
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm(defaultBranchCode));
    toast.success("Ready for new inscan entry");
  };

  const openEdit = () => {
    const key = form.pickupNo.trim() || form.awbNo.trim();
    if (!key) return toast.error("Enter PickUp No or AWB No to edit");

    const match = records.find(
      (r) =>
        (form.pickupNo.trim() && r.pickup_no === form.pickupNo.trim()) ||
        (form.awbNo.trim() && r.awb_no.toUpperCase() === form.awbNo.trim().toUpperCase()),
    );
    if (!match) return toast.error("No inscan record found for the entered PickUp No / AWB No");

    setEditingId(match.id);
    setForm({
      scanDate: match.scan_date,
      scanTime: match.scan_time,
      serviceCenter: match.service_center_code,
      fieldExecutive: { code: match.field_executive_code || "", name: "" },
      vendor: { code: match.vendor_code || "", name: "" },
      pickupNo: match.pickup_no || "",
      awbNo: match.awb_no,
      product: { code: match.product_code || "", name: "" },
      paymentType: match.payment_type || "",
      consigneeName: match.consignee_name || "",
      hold: match.is_held,
      holdRemarks: match.hold_reason_code || match.remark_code || "",
    });
    toast.success("Record loaded for edit");
  };

  const handleReset = () => {
    setEditingId(null);
    setForm(emptyForm(defaultBranchCode));
    toast.success("Form reset");
  };

  const handleSave = () => {
    saveRecord();
  };

  const showOptionalFields = FORM_SETUP_FIELDS.some((f) => !formSetupSettings[f]);

  const heldCount = records.filter((r) => r.is_held).length;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={isUndelivery ? ["Transaction", "Un-Delivery Scan"] : ["Transaction", "Pickup Inscan"]} />

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <IconButton label="Report" onClick={openReport}>
                <FileBarChart className="h-4 w-4" />
              </IconButton>
              <IconButton label="Reconciliation" onClick={() => setReconciliationOpen(true)}>
                <ArrowRightLeft className="h-4 w-4" />
              </IconButton>
              <IconButton label="Setup" onClick={openSetup}>
                <Settings className="h-4 w-4" />
              </IconButton>
              <IconButton label="Manifest Inscan Form Setup" onClick={openFormSetup}>
                <Wrench className="h-4 w-4" />
              </IconButton>
            </div>
          </TooltipProvider>

          <div className="flex items-center gap-2 text-xs">
            <Badge variant="outline" className="bg-background">
              Branch: <span className="ml-1 font-semibold text-foreground">{form.serviceCenter}</span>
            </Badge>
            <Badge variant="outline" className="bg-background">
              Scanned Today: <span className="ml-1 font-semibold text-emerald-600">{records.length}</span>
            </Badge>
            {heldCount > 0 && (
              <Badge variant="destructive">
                Held: <span className="ml-1 font-bold">{heldCount}</span>
              </Badge>
            )}
            {setupSettings.awbAutoSave && (
              <Badge className="bg-emerald-600 text-white">Auto-Save ON</Badge>
            )}
          </div>
        </div>

        <div className="p-4 md:p-6">
          <div className="relative min-w-0 rounded border border-border bg-card p-4 pt-6 shadow-none md:p-6 md:pt-7">
            <span className="absolute left-2.5 top-1 z-20 inline-flex h-6 -translate-y-1/2 items-center whitespace-nowrap rounded-full bg-sidebar px-3 text-[14px] font-semibold leading-none text-sidebar-foreground">
              {isUndelivery ? "Un-Delivery Scan" : "Inscan"}
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
              <FieldWrapper borderLabel label="Service Center" required>
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
                  placeholder="e.g. 1001 (Press Enter to verify)"
                  onChange={(e) => setForm((f) => ({ ...f, pickupNo: e.target.value }))}
                  onBlur={(e) => handleVerifyPickupNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleVerifyPickupNo(form.pickupNo);
                    }
                  }}
                />
              </FieldWrapper>
              <FieldWrapper borderLabel label="AWB No." required>
                <Input
                  className={`${PI_INPUT} font-semibold`}
                  value={form.awbNo}
                  placeholder="Scan or enter AWB"
                  onChange={(e) => setForm((f) => ({ ...f, awbNo: e.target.value.toUpperCase() }))}
                  onBlur={tryAwbAutoSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (setupSettings.awbAutoSave) tryAwbAutoSave();
                      else handleSave();
                    }
                  }}
                  autoFocus
                />
              </FieldWrapper>

              <InscanLookupField
                label="Vendor"
                lookup="vendor"
                value={form.vendor}
                onChange={(v) => setForm((f) => ({ ...f, vendor: v }))}
              />

              <FieldWrapper borderLabel label="Hold" className="md:col-span-1 xl:col-span-1">
                <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                  <Checkbox
                    id="hold"
                    checked={form.hold}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, hold: c === true }))}
                  />
                  {form.hold ? (
                    <Select
                      value={form.holdRemarks}
                      onValueChange={(v) => setForm((f) => ({ ...f, holdRemarks: v }))}
                    >
                      <SelectTrigger className={PI_SELECT}>
                        <SelectValue placeholder="Select Hold Reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {remarkOptions.length > 0 ? (
                          remarkOptions.map((r) => (
                            <SelectItem key={r.code} value={r.code}>
                              {r.code} — {r.name}
                            </SelectItem>
                          ))
                        ) : (
                          <>
                            <SelectItem value="DAMAGED">DAMAGED — Damaged Parcel</SelectItem>
                            <SelectItem value="SHORTAGE">SHORTAGE — Shortage / Missing</SelectItem>
                            <SelectItem value="MISROUTE">MISROUTE — Misrouted</SelectItem>
                            <SelectItem value="HELD_CUSTOMER_REQUEST">HELD_CUSTOMER_REQUEST — Held on Request</SelectItem>
                            <SelectItem value="KYC_PENDING">KYC_PENDING — KYC Pending</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">Check to put shipment on hold</span>
                  )}
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

            {isUndelivery && (
              <div className="mt-3 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <span className="font-semibold">Event:</span>
                <span>Shipment Undelivered Received</span>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button variant="destructive" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </div>

          {/* Recent Inscan Events Table */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Recent Inscan Records ({records.length})
              </h3>
              <span className="text-xs text-muted-foreground">
                Showing scans for {form.scanDate} ({form.serviceCenter})
              </span>
            </div>
            <div className="max-h-64 overflow-auto rounded border bg-background">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2">Scan Time</th>
                    <th className="px-3 py-2">AWB No.</th>
                    <th className="px-3 py-2">PickUp No.</th>
                    <th className="px-3 py-2">Field Exec</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2">Status / Hold</th>
                    <th className="px-3 py-2">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono">{r.scan_time}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{r.awb_no}</td>
                      <td className="px-3 py-2">{r.pickup_no || "—"}</td>
                      <td className="px-3 py-2">{r.field_executive_code || "—"}</td>
                      <td className="px-3 py-2">{r.vendor_code || "—"}</td>
                      <td className="px-3 py-2">
                        {r.is_held ? (
                          <Badge variant="destructive" className="h-5 text-[10px]">
                            HELD
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-5 border-emerald-500/40 text-[10px] text-emerald-600">
                            RECEIVED
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.remark_code || r.hold_reason_code || "—"}
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                        No inscan records for {form.scanDate}. Scan an AWB to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>

      {/* Reconciliation Dialog */}
      <Dialog open={reconciliationOpen} onOpenChange={setReconciliationOpen}>
        <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Pickup vs Inscan Reconciliation (Promised vs Received)
            </DialogTitle>
          </div>
          <div className="p-6">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Promised Pickups</div>
                <div className="text-xl font-bold text-foreground">
                  {reconciliationData?.summary.total_pickups_promised ?? "…"}
                </div>
              </div>
              <div className="rounded border bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-600">Confirmed at Inscan</div>
                <div className="text-xl font-bold text-emerald-600">
                  {reconciliationData?.summary.total_pickups_confirmed ?? "…"}
                </div>
              </div>
              <div className="rounded border bg-amber-500/10 p-3">
                <div className="text-xs text-amber-600">Pending Inscan</div>
                <div className="text-xl font-bold text-amber-600">
                  {reconciliationData?.summary.total_pickups_pending ?? "…"}
                </div>
              </div>
              <div className="rounded border bg-red-500/10 p-3">
                <div className="text-xs text-red-600">Inscanned on Hold</div>
                <div className="text-xl font-bold text-red-600">
                  {reconciliationData?.summary.total_inscans_held ?? "…"}
                </div>
              </div>
            </div>

            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Un-Inscanned Pickups (Gap List)
            </h4>
            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2">Pickup #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Customer / Shipper</th>
                    <th className="px-3 py-2">Field Exec</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Mobile</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(reconciliationData?.pending_pickups ?? []).map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono font-medium text-foreground">{p.pickup_no}</td>
                      <td className="px-3 py-2">{p.pickup_date}</td>
                      <td className="px-3 py-2">
                        {p.customer_name || "—"} {p.shipper_name ? `(${p.shipper_name})` : ""}
                      </td>
                      <td className="px-3 py-2">{p.field_executive || "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px]">
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.mobile_no}</td>
                    </tr>
                  ))}
                  {(reconciliationData?.pending_pickups ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        {isFetchingRecon ? "Loading reconciliation…" : "All promised pickups are inscanned!"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button variant="outline" onClick={() => setReconciliationOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inscan Report Dialog */}
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
              <FieldWrapper borderLabel label="Remark Code">
                <Select
                  value={reportForm.remarkCode}
                  onValueChange={(v) => patchReport({ remarkCode: v })}
                >
                  <SelectTrigger className={PI_SELECT}>
                    <SelectValue placeholder="All Remarks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Remarks</SelectItem>
                    {remarkOptions.map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        {r.code} — {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper borderLabel label="Master AWB No">
                <Input
                  className={PI_INPUT}
                  value={reportForm.masterAwbNo}
                  placeholder="Filter by AWB"
                  onChange={(e) => patchReport({ masterAwbNo: e.target.value })}
                />
              </FieldWrapper>
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

      {/* Setup Modal Dialog */}
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

      {/* Form Setup Modal Dialog */}
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
