import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  ClipboardList,
  ArrowLeftRight,
  XCircle,
  CheckCircle,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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
  DialogFooter,
  DialogHeader,
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
import { DataIoToolbar } from "@/components/data-io-toolbar";
import {
  FieldWrapper,
  IconButton,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { useAuth } from "@/lib/auth";
import {
  lookup,
  useLookup,
  type LookupItem,
  type LookupKey as LiveLookupKey,
} from "@/lib/masters/core/lookup";
import { toErrorMessage } from "@/lib/masters/screen";
import {
  cancelPickup,
  listPickups,
  passPickup,
  savePickup,
  softDeletePickup,
  transferPickups,
} from "@/lib/transactions/resources/pickups";
import {
  loadClientProfile,
  type ClientProfile,
} from "@/lib/transactions/resources/clientProfile";
import {
  dbPickupToUi,
  uiFormToPickupFields,
  uiRowToForm,
  type LookupPair,
  type UiPickupForm as PickupForm,
  type UiPickupRow as PickupRow,
} from "@/lib/transactions/pickupUiMap";

const DEMO_TO_LIVE_LOOKUP: Partial<Record<LookupKey, LiveLookupKey>> = {
  customer: "customer",
  destination: "destination",
  shipper: "shipper",
  area: "area",
  fieldExecutive: "field-executive",
  salesExecutive: "sales-executive",
  serviceCentre: "branch",
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
  serviceCenterId: "",
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

const formToRow = (
  form: PickupForm,
  pickupNo: number,
  id?: string,
  profileFallback = "",
): PickupRow => ({
  id: id ?? crypto.randomUUID(),
  pickupNo,
  status: form.fieldExecutive.code || form.fieldExecutive.name ? "ASSIGNED" : "OPEN",
  rowVersion: 1,
  passed: "",
  awbNo: "",
  confirm: "",
  cancel: "",
  userId: form.bookedBy || profileFallback || "SURYAA",
  ...form,
  bookedBy: form.bookedBy || profileFallback || "SURYAA",
  editedBy: profileFallback || "SURYAA",
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
  | "awbNo"
  | "userId";

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
  userId: "",
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
  userId: "min-w-[112px] whitespace-nowrap",
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
  const { isAuthenticated: authed, profile } = useAuth();
  const queryClient = useQueryClient();
  const [demoRows, setDemoRows] = useState<PickupRow[]>([]);
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
  const [saving, setSaving] = useState(false);

  const liveQuery = useQuery({
    queryKey: ["pickups", "list"],
    queryFn: () => listPickups({ pageSize: 500 }),
    enabled: authed,
  });

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
  const defaultBranchId = userBranchQuery.data?.id || profile?.home_branch_id || "";

  const rows: PickupRow[] = authed
    ? (liveQuery.data?.rows ?? []).map(dbPickupToUi)
    : demoRows;

  const refreshLive = async () => {
    await queryClient.invalidateQueries({ queryKey: ["pickups"] });
  };

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
        userId: r.userId,
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
    setZipHint(null);
    setForm({
      ...emptyForm(),
      serviceCenter: defaultBranchCode,
      serviceCenterId: defaultBranchId,
      bookedBy: profile?.username ?? "",
      editedBy: profile?.username ?? "",
    });
    setShowForm(true);
  };

  const openEdit = (row: PickupRow) => {
    setEditing(row);
    setForm(uiRowToForm(row));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleCustomerSelect = async (customerPair: LookupPair) => {
    setForm((f) => ({ ...f, customer: customerPair }));

    if (!customerPair.id && !customerPair.code) return;

    try {
      let profile: ClientProfile | null = null;
      if (authed) {
        profile = await loadClientProfile({
          id: customerPair.id,
          code: customerPair.code,
        });
      }

      setForm((prev) => {
        const next = { ...prev, customer: customerPair };

        // Helper to fill only if the field is currently blank
        const fillIfEmpty = (currentVal: string, newVal: string | null | undefined) => {
          return !currentVal.trim() && newVal ? newVal : currentVal;
        };

        const fillPairIfEmpty = (currentPair: LookupPair, newPair: LookupPair | null | undefined) => {
          if (!currentPair.code.trim() && !currentPair.name.trim() && newPair && (newPair.code || newPair.name)) {
            return newPair;
          }
          return currentPair;
        };

        if (profile) {
          next.payOption = fillIfEmpty(next.payOption, profile.paymentType);
          next.address1 = fillIfEmpty(next.address1, profile.address1);
          next.address2 = fillIfEmpty(next.address2, profile.address2);
          next.city = fillIfEmpty(next.city, profile.city);
          next.state = fillIfEmpty(next.state, profile.state);
          next.zipCode = fillIfEmpty(next.zipCode, profile.pincode);
          next.mobileNo = fillIfEmpty(next.mobileNo, profile.mobile || profile.telephone);
          next.contact = fillIfEmpty(next.contact, profile.contactPerson);
          next.salesExecutive = fillPairIfEmpty(next.salesExecutive, profile.salesExecutive);
          if (profile.fieldExecutive?.code || profile.fieldExecutive?.name) {
            next.fieldExecutive = fillPairIfEmpty(next.fieldExecutive, profile.fieldExecutive);
          }
          if (profile.extensions?.origin) {
            const originStr = String(profile.extensions.origin);
            next.origin = fillPairIfEmpty(next.origin, {
              code: originStr,
              name: originStr,
            });
          }
        } else {
          // Demo fallback
          next.payOption = fillIfEmpty(next.payOption, "Credit");
          next.origin = fillPairIfEmpty(next.origin, { code: "HYD", name: "Hyderabad" });
          next.area = fillPairIfEmpty(next.area, { code: "HYD", name: "HYD" });
          next.city = fillIfEmpty(next.city, "Hyderabad");
          next.state = fillIfEmpty(next.state, "Telangana");
          next.zipCode = fillIfEmpty(next.zipCode, "500001");
        }

        return next;
      });
    } catch (err) {
      console.error("Customer auto-fill error:", err);
    }
  };

  const [zipHint, setZipHint] = useState<string | null>(null);

  const handleZipCodeBlur = async (zipValue?: string) => {
    const zip = (zipValue !== undefined ? zipValue : form.zipCode).trim();
    if (!zip) {
      setZipHint(null);
      return;
    }

    const res = await resolvePincode(zip, authed);
    if (res) {
      setZipHint(null);
      setForm((prev) => ({
        ...prev,
        city: !prev.city.trim() ? res.city : prev.city,
        state: !prev.state.trim() ? res.state : prev.state,
      }));
    } else {
      setZipHint("Pincode not found in master (enter city/state manually)");
    }
  };

  const handleSave = async () => {
    // 1. Mandatory Field Validation (#22)
    if (!form.customer.code.trim() && !form.customer.name.trim()) {
      return toast.error("Customer is required");
    }
    if (!form.pickupDate.trim()) {
      return toast.error("Pickup Date is required");
    }
    if (!form.origin.code.trim() && !form.origin.name.trim()) {
      return toast.error("Origin is required");
    }
    if (!form.mobileNo.trim()) {
      return toast.error("Mobile No. is required");
    }
    if (!form.shipper.name.trim() && !form.shipper.code.trim()) {
      return toast.error("Shipper Name is required");
    }
    if (!form.area.code.trim() && !form.area.name.trim()) {
      return toast.error("Area is required");
    }

    // 2. Strict Master Lookup Resolution (#31)
    setSaving(true);
    let resolvedForm = { ...form };

    try {
      // Validate & resolve Customer
      const resolvedCustomer = await resolveMasterLookup("customer", form.customer, authed);
      if (!resolvedCustomer) {
        setSaving(false);
        return toast.error(`Customer "${form.customer.name || form.customer.code}" not found in master`);
      }
      resolvedForm.customer = resolvedCustomer;

      // Validate & resolve Origin
      const resolvedOrigin = await resolveMasterLookup("destination", form.origin, authed);
      if (!resolvedOrigin) {
        setSaving(false);
        return toast.error(`Origin "${form.origin.name || form.origin.code}" not found in destination master`);
      }
      resolvedForm.origin = resolvedOrigin;

      // Validate & resolve Shipper (if provided)
      if (form.shipper.code.trim() || form.shipper.name.trim()) {
        const resolvedShipper = await resolveMasterLookup("shipper", form.shipper, authed);
        if (resolvedShipper) {
          resolvedForm.shipper = resolvedShipper;
        } else if (authed && form.shipper.code.trim()) {
          // If code was explicitly typed and failed lookup
          setSaving(false);
          return toast.error(`Shipper "${form.shipper.code}" not found in master`);
        }
      }

      // Validate & resolve Area
      const resolvedArea = await resolveMasterLookup("area", form.area, authed);
      if (!resolvedArea) {
        setSaving(false);
        return toast.error(`Area "${form.area.name || form.area.code}" not found in area master`);
      }
      resolvedForm.area = resolvedArea;

      // Validate & resolve Field Executive (if provided)
      if (form.fieldExecutive.code.trim() || form.fieldExecutive.name.trim()) {
        const resolvedFe = await resolveMasterLookup("fieldExecutive", form.fieldExecutive, authed);
        if (!resolvedFe) {
          setSaving(false);
          return toast.error(`Field Executive "${form.fieldExecutive.name || form.fieldExecutive.code}" not found in master`);
        }
        resolvedForm.fieldExecutive = resolvedFe;
      }

      // Validate & resolve Sales Executive (if provided)
      if (form.salesExecutive.code.trim() || form.salesExecutive.name.trim()) {
        const resolvedSe = await resolveMasterLookup("salesExecutive", form.salesExecutive, authed);
        if (!resolvedSe) {
          setSaving(false);
          return toast.error(`Sales Executive "${form.salesExecutive.name || form.salesExecutive.code}" not found in master`);
        }
        resolvedForm.salesExecutive = resolvedSe;
      }
    } catch {
      // Continue if resolution check encounters transient error
    }

    if (authed) {
      try {
        await savePickup({
          id: editing?.id ?? null,
          rowVersion: editing?.rowVersion ?? null,
          fields: uiFormToPickupFields(resolvedForm),
        });
        await refreshLive();
        toast.success(editing ? "Pickup updated" : "Pickup saved");
        closeForm();
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(false);
    if (editing) {
      const updated = formToRow(resolvedForm, editing.pickupNo, editing.id, profile?.username);
      updated.passed = editing.passed;
      updated.awbNo = editing.awbNo;
      updated.confirm = editing.confirm;
      updated.cancel = editing.cancel;
      updated.userId = editing.userId;
      updated.rowVersion = editing.rowVersion;
      updated.status = editing.status;
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? updated : r)));
      toast.success("Pickup updated");
    } else {
      setDemoRows((prev) => [formToRow(resolvedForm, nextPickupNo, undefined, profile?.username), ...prev]);
      toast.success("Pickup saved");
    }
    closeForm();
  };

  const [cancelTarget, setCancelTarget] = useState<PickupRow | null>(null);
  const [cancelType, setCancelType] = useState<"CALL_CANCEL" | "ATTEMPT_CANCEL">("CALL_CANCEL");
  const [cancelReason, setCancelReason] = useState("");
  const [passTarget, setPassTarget] = useState<PickupRow | null>(null);
  const [passForm, setPassForm] = useState<{ toFieldExecutive: LookupPair; reason: string }>({
    toFieldExecutive: emptyPair(),
    reason: "",
  });

  const openCancel = (row: PickupRow) => {
    setCancelTarget(row);
    setCancelType("CALL_CANCEL");
    setCancelReason("");
  };

  const closeCancel = () => {
    setCancelTarget(null);
    setCancelReason("");
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    if (authed) {
      try {
        await cancelPickup({
          id: cancelTarget.id,
          rowVersion: cancelTarget.rowVersion,
          reason: cancelReason.trim() || undefined,
          cancelType,
        });
        await refreshLive();
        toast.success(`Cancelled pickup ${cancelTarget.pickupNo} (${cancelType === "ATTEMPT_CANCEL" ? "Attempt Cancel" : "Call Cancel"})`);
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        closeCancel();
      }
      return;
    }

    setDemoRows((prev) =>
      prev.map((r) =>
        r.id === cancelTarget.id
          ? {
              ...r,
              status: "CANCELLED",
              cancel: cancelType === "ATTEMPT_CANCEL" ? "Attempt Cancel" : "Call Cancel",
              cancelType,
              reason: cancelReason.trim() || r.reason,
            }
          : r,
      ),
    );
    toast.success(`Cancelled pickup ${cancelTarget.pickupNo}`);
    closeCancel();
  };

  const openPass = (row: PickupRow) => {
    setPassTarget(row);
    setPassForm({ toFieldExecutive: emptyPair(), reason: "" });
  };

  const closePass = () => {
    setPassTarget(null);
    setPassForm({ toFieldExecutive: emptyPair(), reason: "" });
  };

  const confirmPass = async () => {
    if (!passTarget) return;
    if (!passForm.toFieldExecutive.code && !passForm.toFieldExecutive.name) {
      return toast.error("Please select a target Field Executive");
    }

    if (authed) {
      try {
        let toFe = passForm.toFieldExecutive;
        if (!toFe.id) {
          const resolved = await resolveMasterLookup("fieldExecutive", toFe, true);
          if (resolved) toFe = resolved;
        }

        await passPickup({
          id: passTarget.id,
          rowVersion: passTarget.rowVersion,
          toFeId: toFe.id ?? null,
          toFeCode: toFe.code || null,
          reason: passForm.reason.trim() || undefined,
        });
        await refreshLive();
        toast.success(`Passed pickup ${passTarget.pickupNo} to ${toFe.name || toFe.code}`);
      } catch (e) {
        toast.error(toErrorMessage(e));
      } finally {
        closePass();
      }
      return;
    }

    setDemoRows((prev) =>
      prev.map((r) =>
        r.id === passTarget.id
          ? {
              ...r,
              fieldExecutive: { ...passForm.toFieldExecutive },
              status: "ASSIGNED",
              passed: "YES",
              passReason: passForm.reason,
            }
          : r,
      ),
    );
    toast.success(`Passed pickup ${passTarget.pickupNo} to ${passForm.toFieldExecutive.name || passForm.toFieldExecutive.code}`);
    closePass();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (authed) {
      try {
        if (deleteTarget.status === "CANCELLED") {
          await softDeletePickup(deleteTarget.id, deleteTarget.rowVersion);
        } else {
          await cancelPickup({
            id: deleteTarget.id,
            rowVersion: deleteTarget.rowVersion,
            reason: "Deleted from pickup screen",
            cancelType: "CALL_CANCEL",
          });
        }
        await refreshLive();
        toast.success(`Removed pickup ${deleteTarget.pickupNo}`);
      } catch (e) {
        toast.error(toErrorMessage(e));
        return;
      } finally {
        setDeleteTarget(null);
      }
      return;
    }
    setDemoRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(deleteTarget.id);
      return next;
    });
    toast.success(`Deleted pickup ${deleteTarget.pickupNo}`);
    setDeleteTarget(null);
  };

  const clearColFilters = (silent = false) => {
    setColFilters(emptyColFilters());
    setPage(1);
    if (!silent) toast.success("Column filters cleared");
  };

  const handleRefresh = async () => {
    setSearch("");
    clearColFilters(true);
    setSelectedIds(new Set());
    setAppliedRegisterFilters(null);
    setShowRegister(false);
    closeForm();
    if (authed) {
      try {
        await refreshLive();
        toast.success("Refreshed");
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      return;
    }
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
      // Only include active / open stops for the run sheet (exclude terminal cancelled/confirmed)
      if (r.status === "CANCELLED" || r.status === "CONFIRMED") return false;
      if (r.pickupDate !== generateForm.date) return false;
      if (generateForm.area.code && r.area.code !== generateForm.area.code) return false;
      if (generateForm.area.name && !r.area.name.toLowerCase().includes(generateForm.area.name.toLowerCase())) return false;
      if (generateForm.fieldExecutive.code && r.fieldExecutive.code !== generateForm.fieldExecutive.code) return false;
      if (generateForm.fieldExecutive.name && !r.fieldExecutive.name.toLowerCase().includes(generateForm.fieldExecutive.name.toLowerCase())) return false;
      return true;
    });

    if (matches.length === 0) {
      toast.info("No active pickups found for selected criteria. Generating blank template.");
    } else {
      toast.success(`Generated Pickup Run Sheet with ${matches.length} stop${matches.length === 1 ? "" : "s"}`);
    }

    printPickupSheet({
      date: generateForm.date,
      area: generateForm.area.name || generateForm.area.code,
      fieldExecutive: generateForm.fieldExecutive.name || generateForm.fieldExecutive.code,
      records: matches,
    });

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

  const handleTransfer = async () => {
    if (!transferForm.date) return toast.error("Date is required");
    if (!transferForm.fromFieldExecutive.code && !transferForm.fromFieldExecutive.name) {
      return toast.error("From Field Executive is required");
    }
    if (!transferForm.toFieldExecutive.code && !transferForm.toFieldExecutive.name) {
      return toast.error("To Field Executive is required");
    }

    if (authed) {
      try {
        const count = await transferPickups({
          date: transferForm.date,
          fromFeId: transferForm.fromFieldExecutive.id ?? null,
          toFeId: transferForm.toFieldExecutive.id ?? null,
          fromFeCode: transferForm.fromFieldExecutive.code || null,
          toFeCode: transferForm.toFieldExecutive.code || null,
        });
        await refreshLive();
        toast.success(
          count > 0
            ? `Transferred ${count} pickup${count === 1 ? "" : "s"} to ${transferForm.toFieldExecutive.name || transferForm.toFieldExecutive.code}`
            : "No matching pickups found for transfer",
        );
        closeTransfer();
      } catch (e) {
        toast.error(toErrorMessage(e));
      }
      return;
    }

    let count = 0;
    setDemoRows((prev) =>
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
                  <FieldWrapper label="Customer" required>
                    <LookupPairInput
                      live={authed}
                      lookup="customer"
                      value={form.customer}
                      onChange={handleCustomerSelect}
                      onSelect={handleCustomerSelect}
                      allowQuickCreate
                      required
                    />
                  </FieldWrapper>
                  <FieldWrapper label="PickUp Date" required>
                    <Input type="date" value={form.pickupDate} onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Origin" required>
                    <LookupPairInput live={authed} lookup="destination" value={form.origin} onChange={(v) => setForm((f) => ({ ...f, origin: v }))} required />
                  </FieldWrapper>
                  <FieldWrapper label="Mobile No." required>
                    <Input value={form.mobileNo} onChange={(e) => setForm((f) => ({ ...f, mobileNo: e.target.value }))} inputMode="tel" />
                  </FieldWrapper>

                  <FieldWrapper label="Shipper Name" required>
                    <LookupPairInput
                      live={authed}
                      lookup="shipper"
                      value={form.shipper}
                      onChange={(v) => setForm((f) => ({ ...f, shipper: v }))}
                      onSelect={(v) => setForm((f) => ({ ...f, shipper: v }))}
                      allowQuickCreate
                      required
                    />
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
                    <Input
                      value={form.zipCode}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setForm((f) => ({ ...f, zipCode: val }));
                        if (val.trim().length === 6) {
                          await handleZipCodeBlur(val);
                        }
                      }}
                      onBlur={() => handleZipCodeBlur()}
                      placeholder="6-digit PIN"
                    />
                    {zipHint ? (
                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        {zipHint}
                      </p>
                    ) : null}
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
                    {authed ? (
                      <LookupPairInput
                        live
                        lookup="serviceCentre"
                        value={{ id: form.serviceCenterId || undefined, code: form.serviceCenter, name: form.serviceCenter }}
                        onChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            serviceCenter: v.code,
                            serviceCenterId: v.id ?? "",
                          }))
                        }
                      />
                    ) : (
                      <Select value={form.serviceCenter} onValueChange={(v) => setForm((f) => ({ ...f, serviceCenter: v, serviceCenterId: "" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SERVICE_CENTRES.map((sc) => (
                            <SelectItem key={sc.code} value={sc.code}>{sc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
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
                  <FieldWrapper label="Area" required>
                    <LookupPairInput live={authed} lookup="area" value={form.area} onChange={(v) => setForm((f) => ({ ...f, area: v }))} required />
                  </FieldWrapper>
                  <FieldWrapper label="Field Executive">
                    <LookupPairInput live={authed} lookup="fieldExecutive" value={form.fieldExecutive} onChange={(v) => setForm((f) => ({ ...f, fieldExecutive: v }))} />
                  </FieldWrapper>
                  <FieldWrapper label="Sales Executive">
                    <LookupPairInput live={authed} lookup="salesExecutive" value={form.salesExecutive} onChange={(v) => setForm((f) => ({ ...f, salesExecutive: v }))} />
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
              <Button disabled={saving} onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                {saving ? "Saving…" : "Save"}
              </Button>
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
                  <DataIoToolbar
                    export={{
                      filename: "pickups",
                      title: "Pickups",
                      columns: [
                        { key: "pickupNo", header: "Pickup No" },
                        { key: "date", header: "Date" },
                        { key: "time", header: "Time" },
                        { key: "pickupFromCode", header: "Pickup From Code" },
                        { key: "pickupFrom", header: "Pickup From" },
                        { key: "pickupFor", header: "Pickup For" },
                        { key: "serviceCentre", header: "Service Centre" },
                        { key: "fieldExecutive", header: "Field Executive" },
                        { key: "area", header: "Area" },
                        { key: "reason", header: "Reason" },
                        { key: "passed", header: "Passed" },
                        { key: "awbNo", header: "AWB No" },
                        { key: "userId", header: "User ID" },
                      ],
                      getRows: () =>
                        filtered.map((r) => ({
                          pickupNo: r.pickupNo,
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
                          userId: r.userId,
                        })),
                    }}
                  />
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
                      live={authed}
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
                      live={authed}
                      lookup="area"
                      value={registerFilters.area}
                      onChange={(v) => patchRegister("area", v)}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Sales Executive">
                    <LookupPairInput
                      live={authed}
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
                    <TableHead className={cn("text-sidebar-foreground", pickupCol.userId)}>User ID</TableHead>
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
                    <TableHead className={cn("py-2", pickupCol.userId)}>
                      <Input
                        value={colFilters.userId}
                        onChange={(e) => {
                          setColFilters((f) => ({ ...f, userId: e.target.value }));
                          setPage(1);
                        }}
                        placeholder="User ID"
                        className={pickupCol.filter}
                      />
                    </TableHead>
                    <TableHead className={pickupCol.action} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={17} className="h-32 text-center text-sm text-muted-foreground">
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
                        <TableCell className={pickupCol.passed}>
                          {r.passed === "YES" ? (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 font-semibold" title={r.passReason || "Reassigned"}>
                              YES
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={pickupCol.awbNo}>{r.awbNo || "—"}</TableCell>
                        <TableCell className={pickupCol.confirm}>
                          {r.status === "CONFIRMED" ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={pickupCol.cancel}>
                          {r.status === "CANCELLED" ? (
                            <Badge variant="destructive" className="whitespace-nowrap">
                              {r.cancelType === "ATTEMPT_CANCEL" ? "Attempt Cancel" : "Call Cancel"}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={pickupCol.userId}>{r.userId}</TableCell>
                        <TableCell className={pickupCol.actionCell}>
                          <div className="flex justify-center gap-1">
                            {r.status !== "CANCELLED" && r.status !== "CONFIRMED" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => openPass(r)}
                                title={`Pass pickup ${r.pickupNo} to another Field Executive`}
                                aria-label={`Pass pickup ${r.pickupNo}`}
                              >
                                <ArrowLeftRight className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => openEdit(r)}
                              disabled={r.status === "CANCELLED" || r.status === "CONFIRMED"}
                              title={r.status === "CANCELLED" || r.status === "CONFIRMED" ? "Cannot edit closed pickup" : `Edit pickup ${r.pickupNo}`}
                              aria-label={`Edit pickup ${r.pickupNo}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {r.status !== "CANCELLED" && r.status !== "CONFIRMED" ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => openCancel(r)}
                                title={`Cancel pickup ${r.pickupNo}`}
                                aria-label={`Cancel pickup ${r.pickupNo}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(r)}
                                title={`Delete pickup ${r.pickupNo}`}
                                aria-label={`Delete pickup ${r.pickupNo}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
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
                live={authed}
                lookup="area"
                value={generateForm.area}
                onChange={(v) => setGenerateForm((f) => ({ ...f, area: v }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Field Executive">
              <LookupPairInput
                live={authed}
                lookup="fieldExecutive"
                value={generateForm.fieldExecutive}
                onChange={(v) => setGenerateForm((f) => ({ ...f, fieldExecutive: v }))}
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleGenerateSheet} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Printer className="mr-1.5 h-4 w-4" />
              Generate &amp; Print Run Sheet
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
                live={authed}
                lookup="fieldExecutive"
                value={transferForm.fromFieldExecutive}
                onChange={(v) => setTransferForm((f) => ({ ...f, fromFieldExecutive: v }))}
              />
            </FieldWrapper>
            <FieldWrapper label="To Field Executive" className="md:col-span-2">
              <LookupPairInput
                live={authed}
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

      {/* Cancel Pickup Dialog (#27) */}
      <Dialog open={cancelTarget !== null} onOpenChange={(o) => !o && closeCancel()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Cancel Pickup #{cancelTarget?.pickupNo}</DialogTitle>
          </div>
          <div className="flex flex-col gap-4 p-6">
            <FieldWrapper label="Cancellation Type" required>
              <Select value={cancelType} onValueChange={(v) => setCancelType(v as "CALL_CANCEL" | "ATTEMPT_CANCEL")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CALL_CANCEL">Call Cancel (Customer cancelled, no attempt)</SelectItem>
                  <SelectItem value="ATTEMPT_CANCEL">Attempt Cancel (Executive tried, couldn't collect)</SelectItem>
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Reason / Notes">
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancellation…"
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={confirmCancel} variant="destructive">
              Confirm Cancel
            </Button>
            <Button variant="outline" onClick={closeCancel}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pass Pickup Dialog (#26) */}
      <Dialog open={passTarget !== null} onOpenChange={(o) => !o && closePass()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Pass Pickup #{passTarget?.pickupNo}</DialogTitle>
          </div>
          <div className="flex flex-col gap-4 p-6">
            <p className="text-xs text-muted-foreground">
              Reassign this pickup from <span className="font-semibold text-foreground">{passTarget?.fieldExecutive.name || "Unassigned"}</span> to a different Field Executive.
            </p>
            <FieldWrapper label="Target Field Executive" required>
              <LookupPairInput
                live={authed}
                lookup="fieldExecutive"
                value={passForm.toFieldExecutive}
                onChange={(v) => setPassForm((f) => ({ ...f, toFieldExecutive: v }))}
                required
              />
            </FieldWrapper>
            <FieldWrapper label="Pass Reason / Handling Instructions">
              <Input
                value={passForm.reason}
                onChange={(e) => setPassForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Reason for reassignment…"
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={confirmPass} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Pass Pickup
            </Button>
            <Button variant="destructive" onClick={closePass}>Close</Button>
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

export async function resolveMasterLookup(
  lookupKey: LookupKey,
  value: LookupPair,
  authed: boolean,
): Promise<LookupPair | null> {
  const code = (value.code || "").trim();
  const name = (value.name || "").trim();
  if (!code && !name) return null;

  const liveKey = DEMO_TO_LIVE_LOOKUP[lookupKey];
  if (authed && liveKey) {
    try {
      const searchTerms = [code, name].filter(Boolean);
      for (const term of searchTerms) {
        const hits = await lookup(liveKey, term, 20);
        const exactMatch = hits.find(
          (h: LookupItem) =>
            (code && h.code.toLowerCase() === code.toLowerCase()) ||
            (name && h.name.toLowerCase() === name.toLowerCase()),
        );
        if (exactMatch) {
          return { id: exactMatch.id, code: exactMatch.code, name: exactMatch.name };
        }
      }
    } catch {
      // fallback
    }
    return null;
  }

  const opts = MASTER_LOOKUPS[lookupKey]?.options ?? [];
  const match = opts.find(
    (o) =>
      (code && o.code.toLowerCase() === code.toLowerCase()) ||
      (name && o.name.toLowerCase() === name.toLowerCase()),
  );
  if (match) {
    return { id: undefined, code: match.code, name: match.name };
  }
  return null;
}

export async function resolvePincode(
  zip: string,
  authed: boolean,
): Promise<{ city: string; state: string } | null> {
  const cleanZip = zip.trim();
  if (!cleanZip) return null;

  if (authed) {
    try {
      const { data: cp } = await supabase
        .from("country_pincodes")
        .select("city_name, state_name")
        .eq("pin_code", cleanZip)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (cp && (cp.city_name || cp.state_name)) {
        return {
          city: cp.city_name || "",
          state: cp.state_name || "",
        };
      }

      const { data: p } = await supabase
        .from("pincodes")
        .select("pin_name, destinations(name), states(name)")
        .eq("pin_code", cleanZip)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();

      if (p) {
        const dest = p.destinations as { name?: string } | null;
        const st = p.states as { name?: string } | null;
        const city = dest?.name || p.pin_name || "";
        const state = st?.name || "";
        if (city || state) {
          return { city, state };
        }
      }
    } catch {
      // fallback
    }
  }

  const demoOpt = MASTER_LOOKUPS.pinCode?.options?.find(
    (o) => o.code === cleanZip || o.name.toLowerCase().includes(cleanZip.toLowerCase()),
  );
  if (demoOpt) {
    const city = demoOpt.name.replace(/ GPO$/i, "").trim();
    const state = demoOpt.hint || "";
    return { city, state };
  }

  return null;
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printPickupSheet(params: {
  date: string;
  area: string;
  fieldExecutive: string;
  records: PickupRow[];
}) {
  const { date, area, fieldExecutive, records } = params;
  const printDate = formatDisplayDate(date);
  const now = new Date().toLocaleString();

  const rowsHtml =
    records.length === 0
      ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:#666">No active pickups found for selected criteria</td></tr>`
      : records
          .map(
            (r, i) => `
      <tr>
        <td style="border:1px solid #999;padding:6px;text-align:center;font-weight:bold">${i + 1}<br><span style="font-size:10px;color:#555">#${r.pickupNo}</span></td>
        <td style="border:1px solid #999;padding:6px">
          <strong>${escapeHtml(r.customer.name || r.customer.code)}</strong>
          ${r.shipper.name ? `<br><span style="font-size:11px;color:#333">Shipper: ${escapeHtml(r.shipper.name)}</span>` : ""}
          ${r.contact ? `<br><span style="font-size:11px;color:#555">Attn: ${escapeHtml(r.contact)}</span>` : ""}
        </td>
        <td style="border:1px solid #999;padding:6px;font-size:11px">
          ${[r.address1, r.address2, r.city, r.state, r.zipCode].filter(Boolean).map(escapeHtml).join(", ")}
        </td>
        <td style="border:1px solid #999;padding:6px;font-size:11px;white-space:nowrap">
          ${r.mobileNo ? `📱 ${escapeHtml(r.mobileNo)}` : "—"}
        </td>
        <td style="border:1px solid #999;padding:6px;font-size:11px">
          ${r.pickupTime ? `⏰ ${escapeHtml(formatDisplayTime(r.pickupTime))}` : "—"}
          ${r.payOption ? `<br>💵 ${escapeHtml(r.payOption)}` : ""}
          ${r.vehicleReq ? `<br>🚗 ${escapeHtml(r.vehicleReq)}` : ""}
        </td>
        <td style="border:1px solid #999;padding:6px;font-size:11px;max-width:180px">
          ${escapeHtml(r.specialInstructions || r.reason || "—")}
        </td>
        <td style="border:1px solid #999;padding:6px;font-size:11px;min-width:110px">
          AWB: ____________<br>
          Pcs: ____ &nbsp; Wt: ____
        </td>
        <td style="border:1px solid #999;padding:6px;text-align:center;font-size:10px;min-width:90px">
          [ &nbsp; ] Collected<br><br>
          Sign: ________
        </td>
      </tr>
    `,
          )
          .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pickup Sheet - ${escapeHtml(fieldExecutive || "Run Sheet")} - ${escapeHtml(printDate)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 10px; }
    .header { border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 12px; }
    .title { font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 0; }
    .sub { font-size: 12px; color: #444; margin-top: 2px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); background: #f4f4f5; border: 1px solid #ccc; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; }
    .meta-item { display: flex; flex-direction: column; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #666; font-weight: bold; }
    .meta-val { font-size: 12px; font-weight: 600; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #e4e4e7; border: 1px solid #999; padding: 6px 8px; font-size: 11px; text-align: left; text-transform: uppercase; }
    td { vertical-align: top; }
    .footer { display: flex; justify-content: space-between; margin-top: 24px; padding-top: 16px; border-top: 1px dashed #999; font-size: 11px; }
    .sig-box { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 4px; margin-top: 30px; font-weight: 600; }
  </style>
</head>
<body onload="window.print()">
  <div class="header">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h1 class="title">Field Executive Pickup Run Sheet</h1>
        <div class="sub">SwiftForge Express & Courier Management</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#666">
        Printed: ${escapeHtml(now)}
      </div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><span class="meta-label">Date</span><span class="meta-val">${escapeHtml(printDate)}</span></div>
    <div class="meta-item"><span class="meta-label">Field Executive</span><span class="meta-val">${escapeHtml(fieldExecutive || "All Executives")}</span></div>
    <div class="meta-item"><span class="meta-label">Area / Station</span><span class="meta-val">${escapeHtml(area || "All Areas")}</span></div>
    <div class="meta-item"><span class="meta-label">Total Pickups</span><span class="meta-val">${records.length} Stop${records.length === 1 ? "" : "s"}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50px;text-align:center">#</th>
        <th style="width:20%">Customer / Shipper</th>
        <th style="width:25%">Address</th>
        <th style="width:12%">Contact</th>
        <th style="width:10%">Time / Pay</th>
        <th style="width:15%">Instructions</th>
        <th style="width:10%">AWB / Pcs / Wt</th>
        <th style="width:8%;text-align:center">Collected</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">
    <div>
      <div>Total Pickups Assigned: <strong>${records.length}</strong></div>
      <div style="margin-top:4px">Total Pickups Collected: _______ | Undelivered / Cancelled: _______</div>
    </div>
    <div class="sig-box">Field Executive Signature</div>
    <div class="sig-box">Dispatcher / Supervisor Signature</div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!win) {
    toast.error("Pop-up blocked. Please allow pop-ups to print the run sheet.");
    return;
  }
  win.document.write(html);
  win.document.close();
}

function LookupPairInput({
  value,
  onChange,
  lookup,
  live = false,
  onSelect,
  required = false,
  allowQuickCreate = false,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
  live?: boolean;
  onSelect?: (v: LookupPair) => void;
  required?: boolean;
  allowQuickCreate?: boolean;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [quickForm, setQuickForm] = useState({
    code: "",
    name: "",
    mobile: "",
    contactPerson: "",
    address1: "",
    city: "",
    state: "",
    pinCode: "",
    paymentType: "Credit",
  });

  const liveKey = DEMO_TO_LIVE_LOOKUP[lookup];
  const { data: liveRows, isFetching } = useLookup(liveKey ?? "branch", query, {
    enabled: live && lookupOpen && Boolean(liveKey),
  });

  const handleBlur = async () => {
    const code = (value.code || "").trim();
    const name = (value.name || "").trim();
    if (!code && !name) return;
    if (value.id) return; // already resolved

    const resolved = await resolveMasterLookup(lookup, value, live);
    if (resolved) {
      onChange(resolved);
      onSelect?.(resolved);
    }
  };

  const handleQuickCreateSubmit = async () => {
    const cleanName = quickForm.name.trim();
    const cleanMobile = quickForm.mobile.trim();
    let cleanCode = quickForm.code.trim();

    if (!cleanName) return toast.error("Name is required");
    if (!cleanMobile) return toast.error("Mobile No. is required");
    if (!cleanCode) {
      cleanCode = cleanName.slice(0, 4).toUpperCase() + Math.floor(100 + Math.random() * 900);
    }

    setQuickCreating(true);
    try {
      if (live) {
        if (lookup === "customer") {
          const { data, error } = await supabase
            .from("customers")
            .insert({
              code: cleanCode,
              name: cleanName,
              mobile: cleanMobile,
              contact_person: quickForm.contactPerson.trim() || null,
              address1: quickForm.address1.trim() || null,
              city: quickForm.city.trim() || null,
              pin_code: quickForm.pinCode.trim() || null,
              payment_type: quickForm.paymentType || "Credit",
              customer_type: "CUSTOMER",
              register_type: "B2B",
              status: "ACTIVE",
            })
            .select("id, code, name")
            .single();

          if (error) throw error;
          const newPair: LookupPair = { id: data.id, code: data.code, name: data.name };
          onChange(newPair);
          onSelect?.(newPair);
          toast.success(`Customer "${data.name}" created and selected`);
        } else if (lookup === "shipper") {
          const { data, error } = await supabase
            .from("shippers")
            .insert({
              code: cleanCode,
              name: cleanName,
              mobile: cleanMobile,
              contact_person: quickForm.contactPerson.trim() || null,
              address1: quickForm.address1.trim() || null,
              city: quickForm.city.trim() || null,
              state_name: quickForm.state.trim() || null,
              pin_code: quickForm.pinCode.trim() || null,
              status: "ACTIVE",
            })
            .select("id, code, name")
            .single();

          if (error) throw error;
          const newPair: LookupPair = { id: data.id, code: data.code, name: data.name };
          onChange(newPair);
          onSelect?.(newPair);
          toast.success(`Shipper "${data.name}" created and selected`);
        }
      } else {
        // Demo mode
        const newPair: LookupPair = { code: cleanCode, name: cleanName };
        onChange(newPair);
        onSelect?.(newPair);
        toast.success(`${lookup === "customer" ? "Customer" : "Shipper"} "${cleanName}" created and selected`);
      }
      setQuickAddOpen(false);
      setQuickForm({
        code: "",
        name: "",
        mobile: "",
        contactPerson: "",
        address1: "",
        city: "",
        state: "",
        pinCode: "",
        paymentType: "Credit",
      });
    } catch (e) {
      toast.error(toErrorMessage(e));
    } finally {
      setQuickCreating(false);
    }
  };

  const hasContent = Boolean(value.code.trim() || value.name.trim());
  const isUnresolved = live && hasContent && !value.id;

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, id: undefined, code: e.target.value })}
          onBlur={handleBlur}
          className={cn("w-24", isUnresolved && "border-amber-500/80 focus-visible:ring-amber-500")}
          placeholder="Code"
        />
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, id: undefined, name: e.target.value })}
          onBlur={handleBlur}
          className={cn("flex-1", isUnresolved && "border-amber-500/80 focus-visible:ring-amber-500")}
          placeholder="Name"
        />
        <Button
          size="icon"
          type="button"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label={`Search ${lookup}`}
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
        {allowQuickCreate && (lookup === "customer" || lookup === "shipper") && (
          <Button
            size="icon"
            type="button"
            variant="outline"
            className="h-9 w-9 shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-300 dark:border-emerald-700 dark:hover:bg-emerald-950/50"
            title={`Quick Add ${lookup === "customer" ? "Customer" : "Shipper"}`}
            aria-label={`Quick Add ${lookup === "customer" ? "Customer" : "Shipper"}`}
            onClick={() => setQuickAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Quick Add Master Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Quick Add {lookup === "customer" ? "Customer" : "Shipper"}
            </DialogTitle>
          </div>
          <div className="flex flex-col gap-3 p-5 max-h-[75vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <FieldWrapper label="Code">
                <Input
                  value={quickForm.code}
                  onChange={(e) => setQuickForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="Auto if blank"
                />
              </FieldWrapper>
              <FieldWrapper label="Mobile No." required>
                <Input
                  value={quickForm.mobile}
                  onChange={(e) => setQuickForm((f) => ({ ...f, mobile: e.target.value }))}
                  inputMode="tel"
                  placeholder="10-digit mobile"
                  required
                />
              </FieldWrapper>
            </div>
            <FieldWrapper label="Name" required>
              <Input
                value={quickForm.name}
                onChange={(e) => setQuickForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full legal/trading name"
                required
              />
            </FieldWrapper>
            <FieldWrapper label="Contact Person">
              <Input
                value={quickForm.contactPerson}
                onChange={(e) => setQuickForm((f) => ({ ...f, contactPerson: e.target.value }))}
                placeholder="Primary contact name"
              />
            </FieldWrapper>
            <FieldWrapper label="Address">
              <Input
                value={quickForm.address1}
                onChange={(e) => setQuickForm((f) => ({ ...f, address1: e.target.value }))}
                placeholder="Street / Building / Area"
              />
            </FieldWrapper>
            <div className="grid grid-cols-3 gap-2">
              <FieldWrapper label="City">
                <Input
                  value={quickForm.city}
                  onChange={(e) => setQuickForm((f) => ({ ...f, city: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="State">
                <Input
                  value={quickForm.state}
                  onChange={(e) => setQuickForm((f) => ({ ...f, state: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="PIN Code">
                <Input
                  value={quickForm.pinCode}
                  onChange={(e) => setQuickForm((f) => ({ ...f, pinCode: e.target.value }))}
                />
              </FieldWrapper>
            </div>
            {lookup === "customer" && (
              <FieldWrapper label="Payment Type">
                <Select
                  value={quickForm.paymentType}
                  onValueChange={(v) => setQuickForm((f) => ({ ...f, paymentType: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Credit">Credit</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="To Pay">To Pay</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 pb-5">
            <Button
              type="button"
              onClick={handleQuickCreateSubmit}
              disabled={quickCreating}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {quickCreating ? "Creating…" : "Create & Select"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setQuickAddOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {live && liveKey ? (
        <Dialog
          open={lookupOpen}
          onOpenChange={(o) => {
            setLookupOpen(o);
            if (!o) setQuery("");
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogTitle className="text-base font-semibold">Select {lookup}</DialogTitle>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or name…"
              className="mb-2"
            />
            <div className="max-h-72 overflow-auto rounded border">
              {(liveRows ?? []).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                  onClick={() => {
                    const pair = { id: row.id, code: row.code, name: row.name };
                    onChange(pair);
                    onSelect?.(pair);
                    setLookupOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">{row.code}</span>
                </button>
              ))}
              {!isFetching && (liveRows ?? []).length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches found</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <MasterLookupDialog
          open={lookupOpen}
          onOpenChange={setLookupOpen}
          lookup={lookup}
          returnField="code"
          onSelect={(_v, option: LookupOption) => {
            const pair = { code: option.code, name: option.name };
            onChange(pair);
            onSelect?.(pair);
          }}
        />
      )}
    </>
  );
}
