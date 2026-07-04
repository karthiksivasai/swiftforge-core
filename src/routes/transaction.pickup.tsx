import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  ClipboardList,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };

type PickupForm = {
  customer: LookupPair;
  pickupDate: string;
  origin: LookupPair;
  mobileNo: string;
  shipper: LookupPair;
  contact: string;
  address1: string;
  address2: string;
  zipCode: string;
  city: string;
  state: string;
  payOption: string;
  consigneeDetails: boolean;
  serviceCenter: string;
  vehicleReq: string;
  area: LookupPair;
  fieldExecutive: LookupPair;
  salesExecutive: LookupPair;
  specialInstructions: string;
  reason: string;
  pickupReady: boolean;
  pickupTime: string;
  bookedBy: string;
  editedBy: string;
};

type PickupRow = PickupForm & {
  id: string;
  pickupNo: number;
  passed: string;
  awbNo: string;
  confirm: string;
  cancel: string;
};

const SERVICE_CENTRES = MASTER_LOOKUPS.serviceCentre.options;
const PAY_OPTIONS = ["Cash", "Cheque", "Credit", "To Pay"] as const;
const VEHICLE_OPTIONS = ["Bicycle", "Bike", "Car", "Van", "Truck", "Tempo"] as const;
const PICKUP_REGISTER_TYPES = [
  "All",
  "Assigned but not pickup",
  "Pickup Not Assigned",
  "Pending",
] as const;

type PickupRegisterType = (typeof PICKUP_REGISTER_TYPES)[number];

type RegisterFilters = {
  fromDate: string;
  toDate: string;
  serviceCenter: LookupPair;
  fieldExecutive: string;
  area: LookupPair;
  salesExecutive: LookupPair;
  type: PickupRegisterType;
};

type GenerateSheetForm = {
  date: string;
  area: LookupPair;
  fieldExecutive: LookupPair;
};

const emptyGenerateForm = (): GenerateSheetForm => ({
  date: todayIso(),
  area: emptyPair(),
  fieldExecutive: emptyPair(),
});

const TRANSFER_TYPES = ["Field Executive"] as const;

type TransferForm = {
  transferType: (typeof TRANSFER_TYPES)[number];
  date: string;
  fromFieldExecutive: LookupPair;
  toFieldExecutive: LookupPair;
};

const emptyTransferForm = (): TransferForm => ({
  transferType: "Field Executive",
  date: todayIso(),
  fromFieldExecutive: emptyPair(),
  toFieldExecutive: emptyPair(),
});

const FIELD_EXEC_OPTIONS = MASTER_LOOKUPS.fieldExecutive.options;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => new Date().toISOString().slice(0, 10);

const nowTime24 = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const formatDisplayTime = (time24: string) => {
  if (!time24) return "";
  const [h, min] = time24.split(":");
  const hour = Number.parseInt(h, 10);
  if (Number.isNaN(hour)) return time24;
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${min ?? "00"} ${ampm}`;
};

const emptyForm = (): PickupForm => ({
  customer: emptyPair(),
  pickupDate: todayIso(),
  origin: emptyPair(),
  mobileNo: "",
  shipper: emptyPair(),
  contact: "",
  address1: "",
  address2: "",
  zipCode: "",
  city: "",
  state: "",
  payOption: "",
  consigneeDetails: false,
  serviceCenter: "HYD",
  vehicleReq: "",
  area: emptyPair(),
  fieldExecutive: emptyPair(),
  salesExecutive: emptyPair(),
  specialInstructions: "",
  reason: "",
  pickupReady: true,
  pickupTime: nowTime24(),
  bookedBy: "",
  editedBy: "",
});

const emptyRegisterFilters = (): RegisterFilters => ({
  fromDate: todayIso(),
  toDate: todayIso(),
  serviceCenter: emptyPair(),
  fieldExecutive: "",
  area: emptyPair(),
  salesExecutive: emptyPair(),
  type: "All",
});

const matchesRegisterFilters = (row: PickupRow, f: RegisterFilters) => {
  if (f.fromDate && row.pickupDate < f.fromDate) return false;
  if (f.toDate && row.pickupDate > f.toDate) return false;
  if (f.serviceCenter.code && row.serviceCenter !== f.serviceCenter.code) return false;
  if (f.serviceCenter.name) {
    const sc = SERVICE_CENTRES.find((s) => s.code === row.serviceCenter);
    const label = sc?.name ?? row.serviceCenter;
    if (!label.toLowerCase().includes(f.serviceCenter.name.toLowerCase())) return false;
  }
  if (f.fieldExecutive && row.fieldExecutive.code !== f.fieldExecutive) return false;
  if (f.area.code && row.area.code !== f.area.code) return false;
  if (f.area.name && !row.area.name.toLowerCase().includes(f.area.name.toLowerCase())) return false;
  if (f.salesExecutive.code && row.salesExecutive.code !== f.salesExecutive.code) return false;
  if (f.salesExecutive.name && !row.salesExecutive.name.toLowerCase().includes(f.salesExecutive.name.toLowerCase())) return false;

  const hasExecutive = Boolean(row.fieldExecutive.code.trim() || row.fieldExecutive.name.trim());
  switch (f.type) {
    case "Pickup Not Assigned":
      if (hasExecutive) return false;
      break;
    case "Assigned but not pickup":
      if (!hasExecutive || row.awbNo.trim()) return false;
      break;
    case "Pending":
      if (row.confirm.trim()) return false;
      break;
    default:
      break;
  }
  return true;
};

const formToRow = (form: PickupForm, pickupNo: number, id?: string): PickupRow => ({
  id: id ?? crypto.randomUUID(),
  pickupNo,
  passed: "",
  awbNo: "",
  confirm: "",
  cancel: "",
  ...form,
  bookedBy: form.bookedBy || "SURYAA",
  editedBy: "SURYAA",
});

type ColFilterKey =
  | "pickupNo"
  | "date"
  | "time"
  | "pickupFromCode"
  | "pickupFrom"
  | "pickupFor"
  | "serviceCentre"
  | "fieldExecutive"
  | "area"
  | "reason"
  | "passed"
  | "awbNo";

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  pickupNo: "",
  date: "",
  time: "",
  pickupFromCode: "",
  pickupFrom: "",
  pickupFor: "",
  serviceCentre: "",
  fieldExecutive: "",
  area: "",
  reason: "",
  passed: "",
  awbNo: "",
});

/** Keeps wide pickup columns readable; table scrolls horizontally inside the card. */
const pickupCol = {
  pickupNo: "min-w-[96px] whitespace-nowrap",
  select: "min-w-[72px] w-[72px]",
  date: "min-w-[112px] whitespace-nowrap",
  time: "min-w-[104px] whitespace-nowrap",
  pickupFromCode: "min-w-[140px] whitespace-nowrap",
  pickupFrom: "min-w-[160px] whitespace-nowrap",
  pickupFor: "min-w-[140px] whitespace-nowrap",
  serviceCentre: "min-w-[132px] whitespace-nowrap",
  fieldExecutive: "min-w-[144px] whitespace-nowrap",
  area: "min-w-[112px] whitespace-nowrap",
  reason: "min-w-[128px] whitespace-nowrap",
  passed: "min-w-[96px] whitespace-nowrap",
  awbNo: "min-w-[112px] whitespace-nowrap",
  confirm: "min-w-[96px] whitespace-nowrap",
  cancel: "min-w-[96px] whitespace-nowrap",
  action: "min-w-[104px] whitespace-nowrap text-center",
  actionCell: "min-w-[104px] whitespace-nowrap text-center",
  filter: "h-8 w-full min-w-0",
} as const;

export const Route = createFileRoute("/transaction/pickup")({
  head: () => ({
    meta: [
      { title: "Pick Up — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage courier pickup bookings." },
    ],
  }),
  component: PickupPage,
});

function PickupPage() {
  const [rows, setRows] = useState<PickupRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters());
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PickupRow | null>(null);
  const [form, setForm] = useState<PickupForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<PickupRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRegister, setShowRegister] = useState(false);
  const [registerFilters, setRegisterFilters] = useState<RegisterFilters>(emptyRegisterFilters);
  const [appliedRegisterFilters, setAppliedRegisterFilters] = useState<RegisterFilters | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState<GenerateSheetForm>(emptyGenerateForm);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransferForm);

  const registerRows = useMemo(() => {
    if (!appliedRegisterFilters) return rows;
    return rows.filter((r) => matchesRegisterFilters(r, appliedRegisterFilters));
  }, [rows, appliedRegisterFilters]);

  const nextPickupNo = useMemo(() => {
    if (rows.length === 0) return 1;
    return Math.max(...rows.map((r) => r.pickupNo)) + 1;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registerRows.filter((r) => {
      const display = {
        pickupNo: String(r.pickupNo),
        date: formatDisplayDate(r.pickupDate),
        time: formatDisplayTime(r.pickupTime),
        pickupFromCode: r.customer.code,
        pickupFrom: r.customer.name,
        pickupFor: r.shipper.name,
        serviceCentre: r.serviceCenter,
        fieldExecutive: r.fieldExecutive.name,
        area: r.area.name,
        reason: r.reason,
        passed: r.passed,
        awbNo: r.awbNo,
      };
      if (q) {
        const haystack = Object.values(display).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      for (const key of Object.keys(colFilters) as ColFilterKey[]) {
        const val = colFilters[key].trim().toLowerCase();
        if (val && !display[key].toLowerCase().includes(val)) return false;
      }
      return true;
    });
  }, [registerRows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (row: PickupRow) => {
    setEditing(row);
    setForm({
      customer: { ...row.customer },
      pickupDate: row.pickupDate,
      origin: { ...row.origin },
      mobileNo: row.mobileNo,
      shipper: { ...row.shipper },
      contact: row.contact,
      address1: row.address1,
      address2: row.address2,
      zipCode: row.zipCode,
      city: row.city,
      state: row.state,
      payOption: row.payOption,
      consigneeDetails: row.consigneeDetails,
      serviceCenter: row.serviceCenter,
      vehicleReq: row.vehicleReq,
      area: { ...row.area },
      fieldExecutive: { ...row.fieldExecutive },
      salesExecutive: { ...row.salesExecutive },
      specialInstructions: row.specialInstructions,
      reason: row.reason,
      pickupReady: row.pickupReady,
      pickupTime: row.pickupTime,
      bookedBy: row.bookedBy,
      editedBy: row.editedBy,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = () => {
    if (!form.mobileNo.trim()) return toast.error("Mobile No. is required");
    if (!form.shipper.name.trim() && !form.shipper.code.trim()) return toast.error("Shipper Name is required");

    if (editing) {
      const updated = formToRow(form, editing.pickupNo, editing.id);
      updated.passed = editing.passed;
      updated.awbNo = editing.awbNo;
      updated.confirm = editing.confirm;
      updated.cancel = editing.cancel;
      setRows((prev) => prev.map((r) => (r.id === editing.id ? updated : r)));
      toast.success("Pickup updated");
    } else {
      setRows((prev) => [formToRow(form, nextPickupNo), ...prev]);
      toast.success("Pickup saved");
    }
    closeForm();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(deleteTarget.id);
      return next;
    });
    toast.success(`Deleted pickup ${deleteTarget.pickupNo}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "pickups.csv",
      [
        "Pickup No",
        "Date",
        "Time",
        "Pickup From Code",
        "Pickup From",
        "Pickup For",
        "Service Centre",
        "Field Executive",
        "Area",
        "Reason",
        "Passed",
        "AWB No",
      ],
      filtered.map((r) => [
        r.pickupNo,
        formatDisplayDate(r.pickupDate),
        formatDisplayTime(r.pickupTime),
        r.customer.code,
        r.customer.name,
        r.shipper.name,
        r.serviceCenter,
        r.fieldExecutive.name,
        r.area.name,
        r.reason,
        r.passed,
        r.awbNo,
      ]),
    );
    toast.success("Exported pickups.csv");
  };

  const clearColFilters = (silent = false) => {
    setColFilters(emptyColFilters());
    setPage(1);
    if (!silent) toast.success("Column filters cleared");
  };

  const handleRefresh = () => {
    setSearch("");
    clearColFilters(true);
    setSelectedIds(new Set());
    setAppliedRegisterFilters(null);
    setShowRegister(false);
    closeForm();
    toast.success("Refreshed");
  };

  const openRegister = () => {
    closeForm();
    setRegisterFilters(appliedRegisterFilters ?? emptyRegisterFilters());
    setShowRegister(true);
  };

  const closeRegister = () => {
    setShowRegister(false);
  };

  const handleRegisterSearch = () => {
    if (!registerFilters.fromDate) return toast.error("From Date is required");
    if (!registerFilters.toDate) return toast.error("To Date is required");
    if (registerFilters.fromDate > registerFilters.toDate) return toast.error("From Date cannot be after To Date");
    setAppliedRegisterFilters({ ...registerFilters });
    setShowRegister(false);
    setPage(1);
    toast.success("Pickup register loaded");
  };

  const patchRegister = <K extends keyof RegisterFilters>(key: K, value: RegisterFilters[K]) => {
    setRegisterFilters((f) => ({ ...f, [key]: value }));
  };

  const openGenerateSheet = () => {
    setGenerateForm(emptyGenerateForm());
    setGenerateOpen(true);
  };

  const closeGenerateSheet = () => {
    setGenerateOpen(false);
    setGenerateForm(emptyGenerateForm());
  };

  const handleGenerateSheet = () => {
    if (!generateForm.date) return toast.error("Date is required");

    const matches = rows.filter((r) => {
      if (r.pickupDate !== generateForm.date) return false;
      if (generateForm.area.code && r.area.code !== generateForm.area.code) return false;
      if (generateForm.area.name && !r.area.name.toLowerCase().includes(generateForm.area.name.toLowerCase())) return false;
      if (generateForm.fieldExecutive.code && r.fieldExecutive.code !== generateForm.fieldExecutive.code) return false;
      if (generateForm.fieldExecutive.name && !r.fieldExecutive.name.toLowerCase().includes(generateForm.fieldExecutive.name.toLowerCase())) return false;
      return true;
    });

    toast.success(
      matches.length > 0
        ? `Pickup sheet generated for ${matches.length} booking${matches.length === 1 ? "" : "s"}`
        : "Pickup sheet generated (no matching bookings for selected criteria)",
    );
    closeGenerateSheet();
  };

  const openTransfer = () => {
    setTransferForm(emptyTransferForm());
    setTransferOpen(true);
  };

  const closeTransfer = () => {
    setTransferOpen(false);
    setTransferForm(emptyTransferForm());
  };

  const matchesFieldExecutive = (row: PickupRow, executive: LookupPair) => {
    if (executive.code) return row.fieldExecutive.code === executive.code;
    if (executive.name) return row.fieldExecutive.name.toLowerCase().includes(executive.name.toLowerCase());
    return false;
  };

  const handleTransfer = () => {
    if (!transferForm.date) return toast.error("Date is required");
    if (!transferForm.fromFieldExecutive.code && !transferForm.fromFieldExecutive.name) {
      return toast.error("From Field Executive is required");
    }
    if (!transferForm.toFieldExecutive.code && !transferForm.toFieldExecutive.name) {
      return toast.error("To Field Executive is required");
    }

    let count = 0;
    setRows((prev) =>
      prev.map((r) => {
        if (r.pickupDate !== transferForm.date) return r;
        if (!matchesFieldExecutive(r, transferForm.fromFieldExecutive)) return r;
        count += 1;
        return {
          ...r,
          fieldExecutive: { ...transferForm.toFieldExecutive },
          editedBy: "SURYAA",
        };
      }),
    );

    toast.success(
      count > 0
        ? `Transferred ${count} pickup${count === 1 ? "" : "s"} to ${transferForm.toFieldExecutive.name || transferForm.toFieldExecutive.code}`
        : "No matching pickups found for transfer",
    );
    closeTransfer();
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(pageRows.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const bookingNo = editing ? editing.pickupNo : 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Transaction", "Pick Up"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Pick Up</Badge>

            <div className="mb-4 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span>
                Booking No : <span className="font-medium text-foreground">{bookingNo}</span>
              </span>
              <span>
                Booked By : <span className="font-medium text-foreground">{form.bookedBy || "—"}</span>
              </span>
              <span>
                Edited By : <span className="font-medium text-foreground">{form.editedBy || "—"}</span>
              </span>
            </div>

            <div className="flex flex-col gap-6">
              <FormSection title="Pickup Details">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <FieldWrapper label="Customer">
                    <LookupPairInput lookup="customer" value={form.customer} onChange={(v) => setForm((f) => ({ ...f, customer: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="PickUp Date">
                    <Input type="date" value={form.pickupDate} onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Origin">
                    <LookupPairInput lookup="destination" value={form.origin} onChange={(v) => setForm((f) => ({ ...f, origin: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Mobile No." required>
                    <Input value={form.mobileNo} onChange={(e) => setForm((f) => ({ ...f, mobileNo: e.target.value }))} inputMode="tel" />
                  </FieldWrapper>

                  <FieldWrapper label="Shipper Name" required>
                    <LookupPairInput lookup="shipper" value={form.shipper} onChange={(v) => setForm((f) => ({ ...f, shipper: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Contact">
                    <Input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Address1">
                    <Input value={form.address1} onChange={(e) => setForm((f) => ({ ...f, address1: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Address2">
                    <Input value={form.address2} onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))} />
                  </FieldWrapper>

                  <FieldWrapper label="Zip Code">
                    <Input value={form.zipCode} onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="City">
                    <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="State">
                    <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Pay Option">
                    <Select value={form.payOption || undefined} onValueChange={(v) => setForm((f) => ({ ...f, payOption: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select Pay Option" /></SelectTrigger>
                      <SelectContent>
                        {PAY_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

                  <div className="flex items-end pb-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="consigneeDetails"
                        checked={form.consigneeDetails}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, consigneeDetails: c === true }))}
                      />
                      <label htmlFor="consigneeDetails" className="text-sm text-muted-foreground">Consignee Details</label>
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Vehicle">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <FieldWrapper label="Vehicle Req">
                    <Select value={form.vehicleReq || undefined} onValueChange={(v) => setForm((f) => ({ ...f, vehicleReq: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        {VEHICLE_OPTIONS.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrapper>
                  <FieldWrapper label="Area">
                    <LookupPairInput lookup="area" value={form.area} onChange={(v) => setForm((f) => ({ ...f, area: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Field Executive">
                    <LookupPairInput lookup="fieldExecutive" value={form.fieldExecutive} onChange={(v) => setForm((f) => ({ ...f, fieldExecutive: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Sales Executive">
                    <LookupPairInput lookup="salesExecutive" value={form.salesExecutive} onChange={(v) => setForm((f) => ({ ...f, salesExecutive: v }))} />
                  </FieldWrapper>

                  <FieldWrapper label="Special Instructions" className="md:col-span-2">
                    <Input value={form.specialInstructions} onChange={(e) => setForm((f) => ({ ...f, specialInstructions: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Reason">
                    <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
                  </FieldWrapper>
                  <YesNoField label="Pickup Ready" value={form.pickupReady} onChange={(v) => setForm((f) => ({ ...f, pickupReady: v }))} />
                  <FieldWrapper label="Pickup Time">
                    <Input type="time" value={form.pickupTime} onChange={(e) => setForm((f) => ({ ...f, pickupTime: e.target.value }))} />
                  </FieldWrapper>
                </div>
              </FormSection>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
              <Button variant="destructive" onClick={closeForm}>Close</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pick Up</h1>
            <p className="text-sm text-muted-foreground">
              Create pickup bookings and assign field executives for collection.
            </p>
          </div>

          <Card className="min-w-0 overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
              <TooltipProvider delayDuration={200}>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <IconButton label="Refresh" onClick={handleRefresh}><RefreshCw className="h-4 w-4" /></IconButton>
                  <IconButton label="Pickup Register" onClick={openRegister}><ClipboardList className="h-4 w-4" /></IconButton>
                  <IconButton label="Generate" onClick={openGenerateSheet}><Pencil className="h-4 w-4" /></IconButton>
                  <IconButton label="Transfer" onClick={openTransfer}><ArrowLeftRight className="h-4 w-4" /></IconButton>
                  <IconButton label="Export" onClick={handleExport}><Download className="h-4 w-4" /></IconButton>
                </div>
              </TooltipProvider>
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
                <span className="shrink-0 text-sm text-muted-foreground">Total Entry : {filtered.length}</span>
                <span className="shrink-0 text-sm text-muted-foreground">Search:</span>
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="h-9 w-full min-w-[10rem] sm:w-56"
                />
                <Button size="sm" onClick={openAdd} className="h-9 shrink-0 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            {showRegister ? (
              <div className="border-t p-4 md:p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <FieldWrapper label="From Date" required>
                    <Input
                      type="date"
                      value={registerFilters.fromDate}
                      onChange={(e) => patchRegister("fromDate", e.target.value)}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="To Date" required>
                    <Input
                      type="date"
                      value={registerFilters.toDate}
                      onChange={(e) => patchRegister("toDate", e.target.value)}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Service Center">
                    <LookupPairInput
                      lookup="serviceCentre"
                      value={registerFilters.serviceCenter}
                      onChange={(v) => patchRegister("serviceCenter", v)}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Field Executive">
                    <Select
                      value={registerFilters.fieldExecutive || undefined}
                      onValueChange={(v) => patchRegister("fieldExecutive", v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select Field Executive" /></SelectTrigger>
                      <SelectContent>
                        {FIELD_EXEC_OPTIONS.map((fe) => (
                          <SelectItem key={fe.code} value={fe.code}>{fe.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrapper>

                  <FieldWrapper label="Area">
                    <LookupPairInput
                      lookup="area"
                      value={registerFilters.area}
                      onChange={(v) => patchRegister("area", v)}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Sales Executive">
                    <LookupPairInput
                      lookup="salesExecutive"
                      value={registerFilters.salesExecutive}
                      onChange={(v) => patchRegister("salesExecutive", v)}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Type">
                    <Select
                      value={registerFilters.type}
                      onValueChange={(v) => patchRegister("type", v as PickupRegisterType)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PICKUP_REGISTER_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrapper>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Button onClick={handleRegisterSearch} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                    Search
                  </Button>
                  <Button variant="destructive" onClick={closeRegister}>Close</Button>
                </div>
              </div>
            ) : (
              <>
            <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
              <table className="w-max min-w-full caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.pickupNo)}>Pickup No</TableHead>
                    <TableHead className={cn("text-center text-sidebar-foreground", pickupCol.select)}>Select</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.date)}>Date</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.time)}>Time</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.pickupFromCode)}>Pickup From Code</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.pickupFrom)}>Pickup From</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.pickupFor)}>Pickup For</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.serviceCentre)}>Service Centre</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.fieldExecutive)}>Field Executive</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.area)}>Area</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.reason)}>Reason</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.passed)}>Passed</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.awbNo)}>AWB No</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.confirm)}>Confirm</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.cancel)}>Cancel</TableHead>
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.action)}>Action</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {([
                      ["pickupNo", "Pickup No", pickupCol.pickupNo],
                      null,
                      ["date", "Date", pickupCol.date],
                      ["time", "Time", pickupCol.time],
                      ["pickupFromCode", "Code", pickupCol.pickupFromCode],
                      ["pickupFrom", "Pickup From", pickupCol.pickupFrom],
                      ["pickupFor", "Pickup For", pickupCol.pickupFor],
                      ["serviceCentre", "Service Centre", pickupCol.serviceCentre],
                      ["fieldExecutive", "Field Executive", pickupCol.fieldExecutive],
                      ["area", "Area", pickupCol.area],
                      ["reason", "Reason", pickupCol.reason],
                      ["passed", "Passed", pickupCol.passed],
                      ["awbNo", "AWB No", pickupCol.awbNo],
                    ] as const).map((col, i) =>
                      col === null ? (
                        <TableHead key={`sel-${i}`} className={pickupCol.select} />
                      ) : (
                        <TableHead key={col[0]} className={cn("py-2", col[2])}>
                          <Input
                            value={colFilters[col[0]]}
                            onChange={(e) => { setColFilters((f) => ({ ...f, [col[0]]: e.target.value })); setPage(1); }}
                            placeholder={col[1]}
                            className={pickupCol.filter}
                          />
                        </TableHead>
                      ),
                    )}
                    <TableHead className={pickupCol.confirm} />
                    <TableHead className={pickupCol.cancel} />
                    <TableHead className={pickupCol.action} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={16} className="h-32 text-center text-sm text-muted-foreground">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className={cn("font-medium", pickupCol.pickupNo)}>{r.pickupNo}</TableCell>
                        <TableCell className={cn("text-center", pickupCol.select)}>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={(c) => toggleSelect(r.id, c === true)}
                            aria-label={`Select pickup ${r.pickupNo}`}
                          />
                        </TableCell>
                        <TableCell className={pickupCol.date}>{formatDisplayDate(r.pickupDate)}</TableCell>
                        <TableCell className={pickupCol.time}>{formatDisplayTime(r.pickupTime)}</TableCell>
                        <TableCell className={pickupCol.pickupFromCode}>{r.customer.code}</TableCell>
                        <TableCell className={pickupCol.pickupFrom}>{r.customer.name}</TableCell>
                        <TableCell className={pickupCol.pickupFor}>{r.shipper.name}</TableCell>
                        <TableCell className={pickupCol.serviceCentre}>{r.serviceCenter}</TableCell>
                        <TableCell className={pickupCol.fieldExecutive}>{r.fieldExecutive.name}</TableCell>
                        <TableCell className={pickupCol.area}>{r.area.name}</TableCell>
                        <TableCell className={pickupCol.reason}>{r.reason}</TableCell>
                        <TableCell className={pickupCol.passed}>{r.passed}</TableCell>
                        <TableCell className={pickupCol.awbNo}>{r.awbNo}</TableCell>
                        <TableCell className={pickupCol.confirm}>{r.confirm}</TableCell>
                        <TableCell className={pickupCol.cancel}>{r.cancel}</TableCell>
                        <TableCell className={pickupCol.actionCell}>
                          <div className="flex justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit pickup ${r.pickupNo}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label={`Delete pickup ${r.pickupNo}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </table>
            </div>

            {pageRows.length > 0 ? (
              <div className="flex items-center gap-2 border-t px-4 py-2">
                <Checkbox
                  checked={pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))}
                  onCheckedChange={(c) => toggleSelectAll(c === true)}
                  aria-label="Select all on page"
                />
                <span className="text-xs text-muted-foreground">Select all on page</span>
              </div>
            ) : null}

            <TablePager totalPages={totalPages} currentPage={currentPage} setPage={setPage} startIdx={startIdx} endIdx={endIdx} total={filtered.length} />
              </>
            )}
          </Card>
        </>
      )}

      <Dialog open={generateOpen} onOpenChange={(o) => !o && closeGenerateSheet()}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Generate Pickup Sheet</DialogTitle>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
            <FieldWrapper label="Date">
              <Input
                type="date"
                value={generateForm.date}
                onChange={(e) => setGenerateForm((f) => ({ ...f, date: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Area">
              <LookupPairInput
                lookup="area"
                value={generateForm.area}
                onChange={(v) => setGenerateForm((f) => ({ ...f, area: v }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Field Executive">
              <LookupPairInput
                lookup="fieldExecutive"
                value={generateForm.fieldExecutive}
                onChange={(v) => setGenerateForm((f) => ({ ...f, fieldExecutive: v }))}
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleGenerateSheet} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Generate
            </Button>
            <Button variant="destructive" onClick={closeGenerateSheet}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={(o) => !o && closeTransfer()}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Transfer</DialogTitle>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <FieldWrapper label="Transfer Type">
              <Select
                value={transferForm.transferType}
                onValueChange={(v) => setTransferForm((f) => ({ ...f, transferType: v as TransferForm["transferType"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSFER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Date">
              <Input
                type="date"
                value={transferForm.date}
                onChange={(e) => setTransferForm((f) => ({ ...f, date: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="From Field Executive" className="md:col-span-2">
              <LookupPairInput
                lookup="fieldExecutive"
                value={transferForm.fromFieldExecutive}
                onChange={(v) => setTransferForm((f) => ({ ...f, fromFieldExecutive: v }))}
              />
            </FieldWrapper>
            <FieldWrapper label="To Field Executive" className="md:col-span-2">
              <LookupPairInput
                lookup="fieldExecutive"
                value={transferForm.toFieldExecutive}
                onChange={(v) => setTransferForm((f) => ({ ...f, toFieldExecutive: v }))}
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleTransfer} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Transfer
            </Button>
            <Button variant="destructive" onClick={closeTransfer}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pickup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove pickup <span className="font-medium text-foreground">{deleteTarget?.pickupNo}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-md border p-4 pt-6">
      <span className="absolute -top-2.5 left-3 bg-card px-2 text-sm font-medium text-foreground">{title}</span>
      {children}
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <FieldWrapper label={label}>
      <div className="flex h-9 overflow-hidden rounded-md border">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 flex-1 rounded-none",
            value
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "text-muted-foreground hover:bg-muted/60",
          )}
          onClick={() => onChange(true)}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 flex-1 rounded-none border-l",
            !value
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "text-muted-foreground hover:bg-muted/60",
          )}
          onClick={() => onChange(false)}
        >
          No
        </Button>
      </div>
    </FieldWrapper>
  );
}

function LookupPairInput({
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
        <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} className="w-24" placeholder="Code" />
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="flex-1" placeholder="Name" />
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
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
