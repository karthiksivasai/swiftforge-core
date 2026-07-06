import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  Download,
  RefreshCw,
  Filter,
  Plus,
  Search,
  Pencil,
  Trash2,
  Settings,
  FileText,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
type PageView = "list" | "entry";
type EntryTab = "detail" | "manifest" | "charges";

type ObcChargeLine = {
  id: string;
  description: string;
  rate: string;
  amount: string;
  fuelApply: string;
  fuelAmt: string;
  taxOnFuel: string;
  taxApply: string;
  igst: string;
  sgst: string;
  cgst: string;
  total: string;
  chargesType: string;
};

type ObcChargeDraft = {
  description: string;
  amount: string;
  fuel: string;
  taxOnFuel: string;
  tax: string;
  total: string;
};

type ObcForm = {
  cdNo: string;
  payType: string;
  obc: LookupPair;
  product: LookupPair;
  origin: LookupPair;
  flight: LookupPair;
  destination: LookupPair;
  bookDate: string;
  bookTime: string;
  mawbNo: string;
  deliveryVendor: LookupPair;
  obcService: LookupPair;
  userId: string;
  masterEawb: string;
  locked: boolean;
  consigneeName: string;
  address1: string;
  address2: string;
  address3: string;
  pinCode: string;
  bagDox: string;
  bagNonDox: string;
  actualWeight: string;
  chargeWeight: string;
  manifestNos: string[];
  chargeLines: ObcChargeLine[];
};

type ObcRow = {
  id: string;
  manifestNo: string;
  despDate: string;
  origin: string;
  destination: string;
  form: ObcForm;
};

type ColFilterKey = "manifestNo" | "despDate" | "origin" | "destination";

type FormSetupSettings = {
  masterAwbMandatory: boolean;
  eAwbMandatory: boolean;
  vendorNameMandatory: boolean;
};

type FormSetupKey = keyof FormSetupSettings;

const FORM_SETUP_FIELDS: { key: FormSetupKey; label: string }[] = [
  { key: "masterAwbMandatory", label: "Master AWB Mandatory" },
  { key: "eAwbMandatory", label: "E-AWB Mandatory" },
  { key: "vendorNameMandatory", label: "Vendor Name Mandatory" },
];

const defaultFormSetup = (): FormSetupSettings => ({
  masterAwbMandatory: true,
  eAwbMandatory: true,
  vendorNameMandatory: true,
});

const PAYMENT_TYPES = ["Cash", "Cheque", "Credit", "To Pay"] as const;
const CHARGE_DESCRIPTIONS = ["Freight", "Fuel Surcharge", "ODA Charges", "Medical Charges", "Other Charges"] as const;
const YES_NO = ["No", "Yes"] as const;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyChargeDraft = (): ObcChargeDraft => ({
  description: "",
  amount: "",
  fuel: "No",
  taxOnFuel: "No",
  tax: "No",
  total: "0.00",
});

const emptyForm = (): ObcForm => ({
  cdNo: "",
  payType: "",
  obc: emptyPair(),
  product: emptyPair(),
  origin: { code: "HYD", name: "HYDERABAD" },
  flight: emptyPair(),
  destination: emptyPair(),
  bookDate: todayIso(),
  bookTime: nowTime(),
  mawbNo: "",
  deliveryVendor: emptyPair(),
  obcService: emptyPair(),
  userId: "SURYAA",
  masterEawb: "",
  locked: false,
  consigneeName: "",
  address1: "",
  address2: "",
  address3: "",
  pinCode: "",
  bagDox: "",
  bagNonDox: "",
  actualWeight: "",
  chargeWeight: "",
  manifestNos: [],
  chargeLines: [],
});

const emptyColFilters = (): Record<ColFilterKey, string> => ({
  manifestNo: "",
  despDate: "",
  origin: "",
  destination: "",
});

const formToRow = (form: ObcForm, id: string, manifestNo: string, despDate: string): ObcRow => ({
  id,
  manifestNo,
  despDate,
  origin: form.origin.code || form.origin.name,
  destination: form.destination.code || form.destination.name,
  form: {
    ...form,
    manifestNos: [...form.manifestNos],
    chargeLines: form.chargeLines.map((line) => ({ ...line })),
  },
});

const nextManifestNo = (rows: ObcRow[]) => {
  const nums = rows
    .map((r) => Number.parseInt(r.manifestNo.replace(/\D/g, ""), 10))
    .filter((n) => Number.isFinite(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return String(next).padStart(4, "0");
};

export const Route = createFileRoute("/transaction/out-scan/obc-entry")({
  head: () => ({
    meta: [
      { title: "OBC Entry — Transaction — Courier ERP" },
      { name: "description", content: "Create and manage on-board courier (OBC) AWB entries." },
    ],
  }),
  component: ObcEntryPage,
});

function ObcEntryPage() {
  const [view, setView] = useState<PageView>("list");
  const [rows, setRows] = useState<ObcRow[]>([]);
  const [editing, setEditing] = useState<ObcRow | null>(null);
  const [form, setForm] = useState<ObcForm>(emptyForm());
  const [activeTab, setActiveTab] = useState<EntryTab>("detail");
  const [manifestDraft, setManifestDraft] = useState("");
  const [chargeDraft, setChargeDraft] = useState<ObcChargeDraft>(emptyChargeDraft());
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ObcRow | null>(null);
  const [formSetupOpen, setFormSetupOpen] = useState(false);
  const [formSetupSettings, setFormSetupSettings] = useState<FormSetupSettings>(defaultFormSetup);
  const [formSetupDraft, setFormSetupDraft] = useState<FormSetupSettings>(defaultFormSetup);
  const [reportOpen, setReportOpen] = useState(false);
  const [masterEwayBillNo, setMasterEwayBillNo] = useState("");

  const patchForm = (patch: Partial<ObcForm>) => setForm((f) => ({ ...f, ...patch }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const d = formatDisplayDate(row.despDate);
      if (q) {
        const hay = [row.manifestNo, d, row.origin, row.destination].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const cf = colFilters;
      if (cf.manifestNo && !row.manifestNo.toLowerCase().includes(cf.manifestNo.toLowerCase())) return false;
      if (cf.despDate && !d.includes(cf.despDate)) return false;
      if (cf.origin && !row.origin.toLowerCase().includes(cf.origin.toLowerCase())) return false;
      if (cf.destination && !row.destination.toLowerCase().includes(cf.destination.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const chargeSummary = useMemo(() => {
    const otherCharges = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.amount) || 0), 0);
    const surcharge = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.fuelAmt) || 0), 0);
    const igst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.igst) || 0), 0);
    const cgst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.cgst) || 0), 0);
    const sgst = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.sgst) || 0), 0);
    const total = otherCharges + surcharge;
    const grandTotal = form.chargeLines.reduce((s, l) => s + (Number.parseFloat(l.total) || 0), 0);
    return {
      ebtAmount: "0.00",
      otherCharges: otherCharges.toFixed(2),
      total: total.toFixed(2),
      surcharge: surcharge.toFixed(2),
      igst: igst.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
    };
  }, [form.chargeLines]);

  const openEntry = (row: ObcRow) => {
    setEditing(row);
    setForm({
      ...row.form,
      manifestNos: [...row.form.manifestNos],
      chargeLines: row.form.chargeLines.map((line) => ({ ...line })),
    });
    setActiveTab("detail");
    setManifestDraft("");
    setChargeDraft(emptyChargeDraft());
    setView("entry");
  };

  const closeEntry = () => {
    setView("list");
    setEditing(null);
    setForm(emptyForm());
    setActiveTab("detail");
    setManifestDraft("");
    setChargeDraft(emptyChargeDraft());
  };

  const persistEntry = () => {
    if (!form.cdNo.trim()) return toast.error("CD No is required");
    if (!form.payType) return toast.error("Payment Type is required");
    if (!form.obc.code.trim() && !form.obc.name.trim()) return toast.error("OBC is required");
    if (!form.origin.code.trim() && !form.origin.name.trim()) return toast.error("Origin is required");
    if (!form.destination.code.trim() && !form.destination.name.trim()) {
      return toast.error("Destination is required");
    }
    if (formSetupSettings.masterAwbMandatory && !form.mawbNo.trim()) {
      return toast.error("MAWB No. is required");
    }
    if (formSetupSettings.eAwbMandatory && !form.masterEawb.trim()) {
      return toast.error("Master EAWB is required");
    }
    if (
      formSetupSettings.vendorNameMandatory &&
      !form.deliveryVendor.code.trim() &&
      !form.deliveryVendor.name.trim()
    ) {
      return toast.error("Delivery Vendor is required");
    }

    const manifestNo = editing?.manifestNo ?? nextManifestNo(rows);
    const despDate = editing?.despDate ?? todayIso();
    const payload = formToRow(
      {
        ...form,
        bookDate: editing ? form.bookDate : todayIso(),
        bookTime: editing ? form.bookTime : nowTime(),
      },
      editing?.id ?? crypto.randomUUID(),
      manifestNo,
      despDate,
    );

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? payload : r)));
      toast.success("OBC entry saved");
    } else {
      setRows((prev) => [payload, ...prev]);
      toast.success("OBC entry created");
    }
    closeEntry();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted manifest ${deleteTarget.manifestNo}`);
    setDeleteTarget(null);
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
    setMasterEwayBillNo("");
    setReportOpen(true);
  };

  const closeReport = () => {
    setReportOpen(false);
    setMasterEwayBillNo("");
  };

  const handleReportPrint = () => {
    if (!masterEwayBillNo.trim()) return toast.error("Master EWay Bill No is required");
    toast.success(`Report prepared for EWay Bill ${masterEwayBillNo.trim()}`);
    closeReport();
  };

  const handleExport = () => {
    downloadCsv(
      "obc-entry.csv",
      ["Manifest No.", "Desp. Date", "Origin", "Destination"],
      filtered.map((r) => [r.manifestNo, formatDisplayDate(r.despDate), r.origin, r.destination]),
    );
    toast.success("Exported obc-entry.csv");
  };

  const handleRefresh = () => {
    setPage(1);
    toast.success("List refreshed");
  };

  const clearColFilters = () => {
    setColFilters(emptyColFilters());
    setSearch("");
    setPage(1);
    toast.success("Filters cleared");
  };

  const addManifestNo = () => {
    const value = manifestDraft.trim();
    if (!value) return toast.error("Manifest No. is required");
    if (form.manifestNos.includes(value)) return toast.error("Manifest No. already added");
    patchForm({ manifestNos: [...form.manifestNos, value] });
    setManifestDraft("");
    toast.success(`Manifest ${value} added`);
  };

  const removeManifestNo = (value: string) => {
    patchForm({ manifestNos: form.manifestNos.filter((m) => m !== value) });
  };

  const patchChargeDraft = (patch: Partial<ObcChargeDraft>) => {
    setChargeDraft((d) => {
      const next = { ...d, ...patch };
      next.total = (Number.parseFloat(next.amount) || 0).toFixed(2);
      return next;
    });
  };

  const addChargeLine = () => {
    if (!chargeDraft.description) return toast.error("Description is required");
    if (!chargeDraft.amount.trim()) return toast.error("Amount is required");
    const amount = chargeDraft.amount;
    const line: ObcChargeLine = {
      id: crypto.randomUUID(),
      description: chargeDraft.description,
      rate: amount,
      amount,
      fuelApply: chargeDraft.fuel,
      fuelAmt: "0.00",
      taxOnFuel: chargeDraft.taxOnFuel,
      taxApply: chargeDraft.tax,
      igst: "0.00",
      sgst: "0.00",
      cgst: "0.00",
      total: chargeDraft.total || amount,
      chargesType: "Other",
    };
    patchForm({ chargeLines: [...form.chargeLines, line] });
    setChargeDraft(emptyChargeDraft());
    toast.success("Charge line added");
  };

  const removeChargeLine = (id: string) => {
    patchForm({ chargeLines: form.chargeLines.filter((line) => line.id !== id) });
  };

  if (view === "entry") {
    const isEditing = editing !== null;
    const displayBookDate = isEditing ? form.bookDate : todayIso();
    const displayBookTime = isEditing ? form.bookTime : nowTime();

    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Transaction", "Out Scan", "OBC Entry"]} />

        <Card className="min-w-0 overflow-hidden border p-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EntryTab)}>
            <div className="border-b bg-muted/30 px-4 py-3">
              <TabsList className="h-auto gap-1 bg-transparent p-0">
                {(
                  [
                    ["detail", "OBC Detail"],
                    ["manifest", "Manifest No"],
                    ["charges", "Charges"],
                  ] as const
                ).map(([tab, label]) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="rounded-full px-4 py-1.5 data-[state=active]:bg-sidebar data-[state=active]:text-sidebar-foreground data-[state=active]:shadow-none"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="detail" className="mt-0">
              <div className="space-y-4 p-4 md:p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FieldWrapper label="CD No" required>
                    <Input value={form.cdNo} onChange={(e) => patchForm({ cdNo: e.target.value })} />
                  </FieldWrapper>
                  <FieldWrapper label="Pay. Type" required>
                    <Select value={form.payType} onValueChange={(payType) => patchForm({ payType })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Payment Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrapper>
                  <FieldWrapper label="OBC" required>
                    <NameCodeLookupInput lookup="vendor" value={form.obc} onChange={(obc) => patchForm({ obc })} />
                  </FieldWrapper>
                  <FieldWrapper label="Product">
                    <NameCodeLookupInput
                      lookup="product"
                      value={form.product}
                      onChange={(product) => patchForm({ product })}
                    />
                  </FieldWrapper>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FieldWrapper label="Origin" required>
                    <NameCodeLookupInput
                      lookup="destination"
                      value={form.origin}
                      onChange={(origin) => patchForm({ origin })}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Flight">
                    <DualPairInput value={form.flight} onChange={(flight) => patchForm({ flight })} />
                  </FieldWrapper>
                  <FieldWrapper label="Destination" required>
                    <NameCodeLookupInput
                      lookup="destination"
                      value={form.destination}
                      onChange={(destination) => patchForm({ destination })}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="Book Date" required>
                    <Input
                      type="date"
                      value={displayBookDate}
                      onChange={(e) => patchForm({ bookDate: e.target.value })}
                      disabled={!isEditing}
                      readOnly={!isEditing}
                    />
                  </FieldWrapper>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FieldWrapper label="Book Time" required>
                    <Input
                      value={displayBookTime}
                      onChange={(e) =>
                        patchForm({ bookTime: e.target.value.replace(/\D/g, "").slice(0, 4) })
                      }
                      placeholder="HHmm"
                      disabled={!isEditing}
                      readOnly={!isEditing}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="MAWB No." required={formSetupSettings.masterAwbMandatory}>
                    <Input value={form.mawbNo} onChange={(e) => patchForm({ mawbNo: e.target.value })} />
                  </FieldWrapper>
                  <FieldWrapper label="Delivery Vendor" required={formSetupSettings.vendorNameMandatory}>
                    <NameCodeLookupInput
                      lookup="vendor"
                      value={form.deliveryVendor}
                      onChange={(deliveryVendor) => patchForm({ deliveryVendor })}
                    />
                  </FieldWrapper>
                  <FieldWrapper label="OBC Service">
                    <DualPairInput value={form.obcService} onChange={(obcService) => patchForm({ obcService })} />
                  </FieldWrapper>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FieldWrapper label="User Id">
                    <Input value={form.userId} disabled readOnly />
                  </FieldWrapper>
                  <FieldWrapper label="Master EAWB" required={formSetupSettings.eAwbMandatory}>
                    <Input value={form.masterEawb} onChange={(e) => patchForm({ masterEawb: e.target.value })} />
                  </FieldWrapper>
                  <FieldWrapper label="Lock/Un-Lock" className="flex items-end">
                    <label className="flex items-center gap-2 pb-2 text-sm">
                      <Checkbox checked={form.locked} onCheckedChange={(v) => patchForm({ locked: v === true })} />
                      <span className="text-muted-foreground">{form.locked ? "Locked" : "Unlocked"}</span>
                    </label>
                  </FieldWrapper>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_16rem]">
                  <FormSection title="Consignee">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FieldWrapper label="Name">
                        <Input
                          value={form.consigneeName}
                          onChange={(e) => patchForm({ consigneeName: e.target.value })}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Pin Code">
                        <Input value={form.pinCode} onChange={(e) => patchForm({ pinCode: e.target.value })} />
                      </FieldWrapper>
                      <FieldWrapper label="Address 1" className="md:col-span-2">
                        <Input value={form.address1} onChange={(e) => patchForm({ address1: e.target.value })} />
                      </FieldWrapper>
                      <FieldWrapper label="Address 2" className="md:col-span-2">
                        <Input value={form.address2} onChange={(e) => patchForm({ address2: e.target.value })} />
                      </FieldWrapper>
                      <FieldWrapper label="Address 3" className="md:col-span-2">
                        <Input value={form.address3} onChange={(e) => patchForm({ address3: e.target.value })} />
                      </FieldWrapper>
                      <FieldWrapper label="Bag Dox">
                        <Input value={form.bagDox} onChange={(e) => patchForm({ bagDox: e.target.value })} />
                      </FieldWrapper>
                      <FieldWrapper label="Bag Non-Dox">
                        <Input value={form.bagNonDox} onChange={(e) => patchForm({ bagNonDox: e.target.value })} />
                      </FieldWrapper>
                    </div>
                  </FormSection>

                  <FormSection title="Charges">
                    <div className="space-y-4">
                      <FieldWrapper label="Actual Weight">
                        <Input
                          value={form.actualWeight}
                          onChange={(e) => patchForm({ actualWeight: e.target.value })}
                          inputMode="decimal"
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Charge Weight">
                        <Input
                          value={form.chargeWeight}
                          onChange={(e) => patchForm({ chargeWeight: e.target.value })}
                          inputMode="decimal"
                        />
                      </FieldWrapper>
                    </div>
                  </FormSection>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="manifest" className="mt-0">
              <div className="p-4 md:p-6">
                <FormSection title="Manifest No">
                  <div className="flex flex-col gap-4">
                    <div className="flex max-w-md gap-2">
                      <FieldWrapper label="Manifest No." className="min-w-0 flex-1">
                        <Input
                          value={manifestDraft}
                          onChange={(e) => setManifestDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addManifestNo();
                            }
                          }}
                        />
                      </FieldWrapper>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          onClick={addManifestNo}
                          className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                        >
                          Add
                        </Button>
                      </div>
                    </div>

                    {form.manifestNos.length > 0 ? (
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full caption-bottom text-sm">
                          <TableHeader>
                            <TableRow className="bg-sidebar hover:bg-sidebar">
                              <TableHead className="text-sidebar-foreground">SrNo</TableHead>
                              <TableHead className="text-sidebar-foreground">Manifest No.</TableHead>
                              <TableHead className="text-center text-sidebar-foreground">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {form.manifestNos.map((manifestNo, index) => (
                              <TableRow key={manifestNo}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{manifestNo}</TableCell>
                                <TableCell className="text-center">
                                  <IconButton
                                    label="Remove manifest"
                                    variant="ghost"
                                    size="row"
                                    className="text-destructive"
                                    onClick={() => removeManifestNo(manifestNo)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No manifest numbers added yet.</p>
                    )}
                  </div>
                </FormSection>
              </div>
            </TabsContent>

            <TabsContent value="charges" className="mt-0">
              <div className="space-y-4 p-4 md:p-6">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                  {(
                    [
                      ["EBT Amount", chargeSummary.ebtAmount],
                      ["Other Charges", chargeSummary.otherCharges],
                      ["Total", chargeSummary.total],
                      ["Surcharge", chargeSummary.surcharge],
                      ["IGST", chargeSummary.igst],
                      ["CGST", chargeSummary.cgst],
                      ["SGST", chargeSummary.sgst],
                      ["Grand Total", chargeSummary.grandTotal],
                    ] as const
                  ).map(([label, value]) => (
                    <FieldWrapper key={label} label={label}>
                      <Input value={value} disabled readOnly className="bg-muted/40" />
                    </FieldWrapper>
                  ))}
                </div>

                <FormSection title="AWB Charges">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_repeat(4,minmax(0,0.7fr))_minmax(0,0.7fr)_auto] xl:items-end">
                      <FieldWrapper label="Description">
                        <Select
                          value={chargeDraft.description}
                          onValueChange={(description) => patchChargeDraft({ description })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {CHARGE_DESCRIPTIONS.map((desc) => (
                              <SelectItem key={desc} value={desc}>
                                {desc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                      <FieldWrapper label="Amount" required>
                        <Input
                          value={chargeDraft.amount}
                          onChange={(e) => patchChargeDraft({ amount: e.target.value })}
                          inputMode="decimal"
                        />
                      </FieldWrapper>
                      <FieldWrapper label="Fuel">
                        <Select value={chargeDraft.fuel} onValueChange={(fuel) => patchChargeDraft({ fuel })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {YES_NO.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                      <FieldWrapper label="Tax On Fuel">
                        <Select
                          value={chargeDraft.taxOnFuel}
                          onValueChange={(taxOnFuel) => patchChargeDraft({ taxOnFuel })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {YES_NO.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                      <FieldWrapper label="Tax">
                        <Select value={chargeDraft.tax} onValueChange={(tax) => patchChargeDraft({ tax })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {YES_NO.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                      <FieldWrapper label="Total">
                        <Input value={chargeDraft.total} disabled readOnly className="bg-muted/40" />
                      </FieldWrapper>
                      <Button
                        type="button"
                        onClick={addChargeLine}
                        className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 xl:mb-0.5"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add
                      </Button>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[1100px] caption-bottom text-sm">
                        <TableHeader>
                          <TableRow className="bg-sidebar hover:bg-sidebar">
                            {[
                              "SrNo",
                              "Description",
                              "Rate",
                              "Amount",
                              "Fuel Apply",
                              "Fuel Amt",
                              "Tax On Fuel",
                              "TaxApply",
                              "IGST",
                              "SGST",
                              "CGST",
                              "Total",
                              "Charges Type",
                              "Action",
                            ].map((head) => (
                              <TableHead key={head} className="whitespace-nowrap text-sidebar-foreground">
                                {head}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {form.chargeLines.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={14} className="h-24 text-center text-muted-foreground">
                                No charge lines added
                              </TableCell>
                            </TableRow>
                          ) : (
                            form.chargeLines.map((line, index) => (
                              <TableRow key={line.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>{line.description}</TableCell>
                                <TableCell>{line.rate}</TableCell>
                                <TableCell>{line.amount}</TableCell>
                                <TableCell>{line.fuelApply}</TableCell>
                                <TableCell>{line.fuelAmt}</TableCell>
                                <TableCell>{line.taxOnFuel}</TableCell>
                                <TableCell>{line.taxApply}</TableCell>
                                <TableCell>{line.igst}</TableCell>
                                <TableCell>{line.sgst}</TableCell>
                                <TableCell>{line.cgst}</TableCell>
                                <TableCell>{line.total}</TableCell>
                                <TableCell>{line.chargesType}</TableCell>
                                <TableCell className="text-center">
                                  <IconButton
                                    label="Remove charge"
                                    variant="ghost"
                                    size="row"
                                    className="text-destructive"
                                    onClick={() => removeChargeLine(line.id)}
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
                </FormSection>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/10 px-4 py-3 md:px-6">
            <Button onClick={persistEntry} className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90">
              Save
            </Button>
            <Button variant="destructive" onClick={closeEntry} className="min-w-24">
              Close
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Out Scan", "OBC Entry"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">OBC Entry</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage on-board courier AWB entries with manifest and charge details.
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
            <IconButton label="Setup" onClick={openFormSetup}>
              <Settings className="h-4 w-4" />
            </IconButton>
            <IconButton label="Report" onClick={openReport}>
              <FileText className="h-4 w-4" />
            </IconButton>
            <IconButton label="Clear filters" onClick={clearColFilters}>
              <Filter className="h-4 w-4" />
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
            <IconButton label="Export" onClick={handleExport} className="h-9 w-9">
              <Download className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Manifest No.</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Desp. Date</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Origin</TableHead>
                <TableHead className="whitespace-nowrap text-sidebar-foreground">Destination</TableHead>
                <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["manifestNo", "Manifest No."],
                    ["despDate", "Desp. Date"],
                    ["origin", "Origin"],
                    ["destination", "Destination"],
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
                  <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        onClick={() => openEntry(row)}
                        className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        {row.manifestNo}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDisplayDate(row.despDate)}</TableCell>
                    <TableCell>{row.origin}</TableCell>
                    <TableCell>{row.destination}</TableCell>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </div>

        <TablePager
          startIdx={startIdx}
          endIdx={endIdx}
          total={filtered.length}
          currentPage={currentPage}
          totalPages={totalPages}
          setPage={setPage}
        />
      </Card>

      <Dialog open={formSetupOpen} onOpenChange={(open) => !open && closeFormSetup()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Form Setup</DialogTitle>
          </div>
          <div className="space-y-3 p-6">
            {FORM_SETUP_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={formSetupDraft[key]}
                  onCheckedChange={(checked) =>
                    setFormSetupDraft((settings) => ({ ...settings, [key]: checked === true }))
                  }
                />
                <label htmlFor={key} className="text-sm text-foreground">
                  {label}
                </label>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleFormSetupSave} className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Save
            </Button>
            <Button variant="destructive" onClick={closeFormSetup}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={(open) => !open && closeReport()}>
        <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">Report</DialogTitle>
          </div>
          <div className="p-6">
            <FieldWrapper label="Master EWay Bill No">
              <Input
                value={masterEwayBillNo}
                onChange={(e) => setMasterEwayBillNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleReportPrint();
                  }
                }}
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={handleReportPrint} className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Print
            </Button>
            <Button variant="destructive" onClick={closeReport}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete OBC entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will remove manifest ${deleteTarget.manifestNo}. This action cannot be undone.`
                : ""}
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

function FormSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative rounded-md border p-4 pt-6 ${className ?? ""}`}>
      <span className="absolute -top-2.5 left-3 bg-card px-2 text-sm font-medium text-foreground">{title}</span>
      {children}
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
          className="w-20"
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
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}

function DualPairInput({
  value,
  onChange,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
}) {
  return (
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
        className="w-20"
        placeholder="Code"
      />
    </div>
  );
}
