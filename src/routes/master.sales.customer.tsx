import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  User,
  FileText,
  FileSignature,
  ClipboardList,
  Bell,
  Eye,
  EyeOff,
  MapPin,
  X,
  Calendar as CalendarIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { toast } from "sonner";

// ---------- Types ----------
type CustomerStatus = "Active" | "In-Active";

type CustomerRow = {
  id: string;
  code: string;
  branch: string;
  serviceCentre: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  status: CustomerStatus;
  contractHead: string;
  // Rest of the wizard state travels with the customer for round-tripping.
  personal: PersonalDetails;
  billing: BillingDetails;
  contract: ContractDetails;
  other: OtherDetails;
  notification: NotificationDetails;
  fuelSurcharges: FuelSurchargeRow[];
  otherCharges: OtherChargeRow[];
  volumetrics: VolumetricRow[];
  kyc: KycRow[];
  addresses: AddressRow[];
};

type PersonalDetails = {
  code: string;
  name: string;
  contactPerson: string;
  address1: string;
  address2: string;
  pinCode: string;
  city: string;
  state: string;
  tel1: string;
  tel2: string;
  emailId: string;
  mobile: string;
  faxNo: string;
  customerBillingState: string;
  serviceCentre: string;
  startDate: string;
  status: CustomerStatus;
  origin: string;
  gstNo: string;
  aadharNo: string;
  dobOnAadhar: string;
  passportNo: string;
  panNo: string;
  tanNo: string;
  invoiceFormat: string;
  customerType: string;
  registerType: string;
};

type BillingDetails = {
  paymentType: string;
  billingType: string;
  creditLimit: string;
  creditDays: string;
  registrationNo: string;
  instructions: string;
  creditPercent: string;
  closingBalance: string;
  unbilledAmount: string;
  rupee: string;
  paisa: string;
  contractHead: string;
  ledgerHead: string;
  contractOrigin: string;
  businessChannel: string;
  iecNo: string;
  bankAdCode: string;
  bankAccount: string;
  bankIfsc: string;
  firm: string;
  lutNumber: string;
  lutIssueDate: string;
  lutTillDate: string;
  shipperType: string;
  nfei: boolean;
  fuelSurcharge: boolean;
  tax: boolean;
  noTariff: boolean;
  inclusiveTax: boolean;
  allowLoginWithOtp: boolean;
};

type ContractDetails = {
  fileName: string;
};

type OtherDetails = {
  salesExecutive: string;
  incentiveType: string;
  incentivePercent: string;
  customerMsg: string;
  accountEmail: string;
  bestRate: string;
  monthlySales: string;
  defaultVendor: string;
  user: string;
  password: string;
  area: string;
  fieldExecutive: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  globalCustomer: boolean;
  apiNames: string;
  measurementUnit: string;
  industry: string;
  geoLocation: string;
  disableCustomerOrigin: boolean;
  enableCustomerTaxAndDutiesPaidBy: boolean;
  enableAwbNo: boolean;
};

type NotificationDetails = {
  emailForwardingInfo: boolean;
  emailOnProgress: boolean;
  eStatement: boolean;
  eInvoice: boolean;
  emailWeightChange: boolean;
  whatsappBookingInfo: boolean;
  whatsappDeliveryInfo: boolean;
  allowBookingWhenCreditLimitOver: boolean;
  allowZeroAmount: boolean;
  bookingNotToVoidShipment: boolean;
};

type FuelSurchargeRow = {
  id: string;
  entryCode: string;
  fromDate: string;
  toDate: string;
  vendor: string;
  product: string;
  destination: string;
  percentage: string;
};

type OtherChargeRow = {
  id: string;
  chargeType: string;
  fromDate: string;
  toDate: string;
  vendor: string;
  service: string;
  product: string;
  origin: string;
  destination: string;
  amount: string;
  minimumValue: string;
};

type VolumetricRow = {
  id: string;
  customerName: string;
  product: string;
  vendor: string;
  service: string;
  cmDivide: string;
  inchDivide: string;
  cft: string;
};

type KycRow = {
  id: string;
  type: string;
  fileName: string;
};

type AddressRow = {
  id: string;
  customer: string;
  contactType: string;
  fromDate: string;
  name: string;
  designation: string;
  email: string;
  mobile: string;
  landline: string;
  extension: string;
  address1: string;
  address2: string;
  address3: string;
  pinCode: string;
  city: string;
  state: string;
  country: string;
  remark: string;
  passportNo: string;
  aadharNo: string;
  gstNo: string;
  panNo: string;
  defaultShipper: boolean;
  iecNo: string;
  adCode: string;
  lutNo: string;
  kycFileName: string;
};

// ---------- Defaults ----------
const emptyPersonal = (): PersonalDetails => ({
  code: "",
  name: "",
  contactPerson: "",
  address1: "",
  address2: "",
  pinCode: "",
  city: "",
  state: "",
  tel1: "",
  tel2: "",
  emailId: "",
  mobile: "",
  faxNo: "",
  customerBillingState: "",
  serviceCentre: "",
  startDate: "",
  status: "Active",
  origin: "",
  gstNo: "",
  aadharNo: "",
  dobOnAadhar: "",
  passportNo: "",
  panNo: "",
  tanNo: "",
  invoiceFormat: "",
  customerType: "Customer",
  registerType: "B2B",
});

const emptyBilling = (): BillingDetails => ({
  paymentType: "Credit",
  billingType: "",
  creditLimit: "",
  creditDays: "",
  registrationNo: "",
  instructions: "",
  creditPercent: "75",
  closingBalance: "0",
  unbilledAmount: "",
  rupee: "",
  paisa: "",
  contractHead: "",
  ledgerHead: "",
  contractOrigin: "",
  businessChannel: "",
  iecNo: "",
  bankAdCode: "",
  bankAccount: "",
  bankIfsc: "",
  firm: "",
  lutNumber: "",
  lutIssueDate: "",
  lutTillDate: "",
  shipperType: "",
  nfei: false,
  fuelSurcharge: true,
  tax: true,
  noTariff: false,
  inclusiveTax: false,
  allowLoginWithOtp: false,
});

const emptyContract = (): ContractDetails => ({ fileName: "" });

const emptyOther = (): OtherDetails => ({
  salesExecutive: "",
  incentiveType: "Percentage",
  incentivePercent: "",
  customerMsg: "",
  accountEmail: "",
  bestRate: "",
  monthlySales: "",
  defaultVendor: "",
  user: "",
  password: "",
  area: "",
  fieldExecutive: "",
  monday: "",
  tuesday: "",
  wednesday: "",
  thursday: "",
  friday: "",
  saturday: "",
  sunday: "",
  globalCustomer: false,
  apiNames: "",
  measurementUnit: "Centimeter",
  industry: "",
  geoLocation: "",
  disableCustomerOrigin: false,
  enableCustomerTaxAndDutiesPaidBy: false,
  enableAwbNo: false,
});

const emptyNotification = (): NotificationDetails => ({
  emailForwardingInfo: true,
  emailOnProgress: true,
  eStatement: true,
  eInvoice: true,
  emailWeightChange: false,
  whatsappBookingInfo: false,
  whatsappDeliveryInfo: false,
  allowBookingWhenCreditLimitOver: false,
  allowZeroAmount: false,
  bookingNotToVoidShipment: false,
});

const emptyAddress = (): AddressRow => ({
  id: "",
  customer: "",
  contactType: "",
  fromDate: new Date().toISOString().slice(0, 10),
  name: "",
  designation: "",
  email: "",
  mobile: "",
  landline: "",
  extension: "",
  address1: "",
  address2: "",
  address3: "",
  pinCode: "",
  city: "",
  state: "",
  country: "",
  remark: "",
  passportNo: "",
  aadharNo: "",
  gstNo: "",
  panNo: "",
  defaultShipper: false,
  iecNo: "",
  adCode: "",
  lutNo: "",
  kycFileName: "",
});

function emptyCustomer(): CustomerRow {
  return {
    id: "",
    code: "",
    branch: "",
    serviceCentre: "",
    name: "",
    contact: "",
    phone: "",
    email: "",
    status: "Active",
    contractHead: "",
    personal: emptyPersonal(),
    billing: emptyBilling(),
    contract: emptyContract(),
    other: emptyOther(),
    notification: emptyNotification(),
    fuelSurcharges: [],
    otherCharges: [],
    volumetrics: [],
    kyc: [],
    addresses: [],
  };
}

const KYC_TYPES = [
  "Aadhaar Number",
  "Driving License",
  "GSTIN (Normal)",
  "IEC CERTIFICATE",
  "PAN Number",
  "Passport Number",
  "TAN Number",
  "Voter Id",
];

const CUSTOMER_TYPES = ["Customer", "Vendor", "Agent"];
const REGISTER_TYPES = ["B2B", "B2C"];
const PAYMENT_TYPES = ["Credit", "Cash", "Cheque"];
const BILLING_TYPES = ["Select Billing Type", "Weekly", "Monthly", "Fortnightly"];
const FIRMS = ["Select Firm", "Govt", "Non Govt"];
const SHIPPER_TYPES = ["Select Lsp Type", "Individual", "Company"];
const BUSINESS_CHANNELS = [
  "Select Customer Type",
  "Retail",
  "Corporate",
  "E-commerce",
];
const MEASUREMENT_UNITS = ["Centimeter", "Inch"];
const API_NAMES = ["", "DTDC", "BlueDart", "FedEx"];
const INCENTIVE_TYPES = ["Percentage", "Flat"];

const PAGE_SIZE = 10;

// ---------- Route ----------
export const Route = createFileRoute("/master/sales/customer")({
  head: () => ({
    meta: [
      { title: "Customer — Courier ERP" },
      {
        name: "description",
        content:
          "Manage customer master with personal, billing, contract, notification, KYC and address details.",
      },
    ],
  }),
  component: CustomerPage,
});

// ---------- Main ----------
function CustomerPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    code: "",
    branch: "",
    serviceCentre: "",
    name: "",
    contact: "",
    phone: "",
    email: "",
    status: "",
    contractHead: "",
  });
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [form, setForm] = useState<CustomerRow>(emptyCustomer());
  const [activeTab, setActiveTab] =
    useState<"personal" | "fuel" | "other" | "volumetric" | "kyc" | "address">("personal");
  const [personalStep, setPersonalStep] = useState<0 | 1 | 2 | 3 | 4>(0);

  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = [
          r.code, r.branch, r.serviceCentre, r.name,
          r.contact, r.phone, r.email, r.status, r.contractHead,
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const entries: [keyof typeof colFilters, string][] = [
        ["code", r.code],
        ["branch", r.branch],
        ["serviceCentre", r.serviceCentre],
        ["name", r.name],
        ["contact", r.contact],
        ["phone", r.phone],
        ["email", r.email],
        ["status", r.status],
        ["contractHead", r.contractHead],
      ];
      for (const [key, val] of entries) {
        const f = colFilters[key];
        if (f && !val.toLowerCase().includes(f.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyCustomer());
    setActiveTab("personal");
    setPersonalStep(0);
    setOpen(true);
  };

  const openEdit = (row: CustomerRow) => {
    setEditing(row);
    setForm(structuredClone(row));
    setActiveTab("personal");
    setPersonalStep(0);
    setOpen(true);
  };

  const commitCustomer = () => {
    // Roll wizard fields up into list-view fields.
    const p = form.personal;
    const b = form.billing;
    const patched: CustomerRow = {
      ...form,
      code: p.code || form.code,
      name: p.name || form.name,
      serviceCentre: p.serviceCentre || form.serviceCentre,
      contact: p.contactPerson || form.contact,
      phone: p.mobile || p.tel1 || form.phone,
      email: p.emailId || form.email,
      status: p.status,
      contractHead: b.contractHead || form.contractHead,
    };
    return patched;
  };

  const handleSave = () => {
    if (!form.personal.name.trim()) {
      toast.error("Customer Name is required");
      setActiveTab("personal");
      setPersonalStep(0);
      return;
    }
    if (!form.personal.mobile.trim()) {
      toast.error("Mobile is required");
      setActiveTab("personal");
      setPersonalStep(0);
      return;
    }
    const patched = commitCustomer();
    if (editing) {
      setRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...patched, id: editing.id } : r)),
      );
      toast.success("Customer updated");
    } else {
      const id = crypto.randomUUID();
      setRows((prev) => [{ ...patched, id }, ...prev]);
      toast.success("Customer added");
    }
    setOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.code || deleteTarget.name}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    const header = [
      "Customer Code", "Branch", "Service Centre", "Name",
      "Contact", "Phone", "Email", "Status", "Contract Head",
    ];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [r.code, r.branch, r.serviceCentre, r.name, r.contact, r.phone, r.email, r.status, r.contractHead]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success("Exported customers.csv");
  };

  const handleImport = () => importInputRef.current?.click();
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    toast.success(`Selected ${file.name}`);
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters({
      code: "", branch: "", serviceCentre: "", name: "",
      contact: "", phone: "", email: "", status: "", contractHead: "",
    });
    setPage(1);
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">Master</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">Sales</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Customer</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Customer</h1>
        <p className="text-sm text-muted-foreground">
          Manage customer master records — personal, billing, notification, KYC and address details.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImportFile}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <IconButton label="Export" onClick={handleExport}>
                <Download className="h-4 w-4" />
              </IconButton>
              <IconButton label="Import" onClick={handleImport}>
                <Upload className="h-4 w-4" />
              </IconButton>
              <IconButton label="Refresh" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            </div>
          </TooltipProvider>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search..."
                className="h-9 w-56 pl-8"
              />
            </div>
            <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="text-sidebar-foreground">Customer Code</TableHead>
                <TableHead className="text-sidebar-foreground">Branch</TableHead>
                <TableHead className="text-sidebar-foreground">Service Centre</TableHead>
                <TableHead className="text-sidebar-foreground">Name</TableHead>
                <TableHead className="text-sidebar-foreground">Contact</TableHead>
                <TableHead className="text-sidebar-foreground">Phone</TableHead>
                <TableHead className="text-sidebar-foreground">Email</TableHead>
                <TableHead className="text-sidebar-foreground">Status</TableHead>
                <TableHead className="text-sidebar-foreground">Contract Head</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    ["code", "Customer Code"],
                    ["branch", "Branch"],
                    ["serviceCentre", "Service Centre"],
                    ["name", "Name"],
                    ["contact", "Contact"],
                    ["phone", "Phone"],
                    ["email", "Email"],
                    ["status", "Status"],
                    ["contractHead", "Contract Head"],
                  ] as const
                ).map(([k, ph]) => (
                  <TableHead key={k} className="py-2">
                    <Input
                      value={colFilters[k]}
                      onChange={(e) => {
                        setColFilters((f) => ({ ...f, [k]: e.target.value }));
                        setPage(1);
                      }}
                      placeholder={ph}
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
                  <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.branch}</TableCell>
                    <TableCell>{r.serviceCentre}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.contact}</TableCell>
                    <TableCell>{r.phone}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <span
                        className={
                          r.status === "Active"
                            ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                            : "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>{r.contractHead}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit ${r.code}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label={`Delete ${r.code}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            {filtered.length === 0
              ? "No Record Found"
              : `Showing ${startIdx} to ${endIdx} of ${filtered.length} entries`}
          </span>
          <div className="flex items-center gap-1">
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></PagerButton>
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></PagerButton>
            <CompactPager total={totalPages} current={currentPage} onSelect={setPage} />
            <PagerButton disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></PagerButton>
            <PagerButton disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-4 w-4" /></PagerButton>
          </div>
        </div>
      </Card>

      {/* Wizard Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer" : "Customer"}</DialogTitle>
          </DialogHeader>

          <TabBar
            active={activeTab}
            onChange={(t) => {
              setActiveTab(t);
              if (t === "personal") setPersonalStep(0);
            }}
          />

          {activeTab === "personal" && (
            <PersonalInformationTab
              step={personalStep}
              onStep={setPersonalStep}
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onClose={() => setOpen(false)}
            />
          )}

          {activeTab === "fuel" && (
            <FuelSurchargesTab
              rows={form.fuelSurcharges}
              setRows={(v) => setForm((f) => ({ ...f, fuelSurcharges: v(f.fuelSurcharges) }))}
              onClose={() => setOpen(false)}
            />
          )}

          {activeTab === "other" && (
            <OtherChargesTab
              rows={form.otherCharges}
              setRows={(v) => setForm((f) => ({ ...f, otherCharges: v(f.otherCharges) }))}
              onClose={() => setOpen(false)}
            />
          )}

          {activeTab === "volumetric" && (
            <VolumetricTab
              rows={form.volumetrics}
              setRows={(v) => setForm((f) => ({ ...f, volumetrics: v(f.volumetrics) }))}
              onClose={() => setOpen(false)}
            />
          )}

          {activeTab === "kyc" && (
            <KycTab
              rows={form.kyc}
              setRows={(v) => setForm((f) => ({ ...f, kyc: v(f.kyc) }))}
              onClose={() => setOpen(false)}
            />
          )}

          {activeTab === "address" && (
            <AddressTab
              rows={form.addresses}
              setRows={(v) => setForm((f) => ({ ...f, addresses: v(f.addresses) }))}
              onClose={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.code || deleteTarget?.name}
              </span>
              . This action cannot be undone.
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

// ---------- Tab bar ----------
type TabKey = "personal" | "fuel" | "other" | "volumetric" | "kyc" | "address";

function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "personal", label: "Personal Information" },
    { key: "fuel", label: "Fuel Surcharges" },
    { key: "other", label: "Other Charges" },
    { key: "volumetric", label: "Customer Volumetric" },
    { key: "kyc", label: "KYC Details" },
    { key: "address", label: "Customer Address" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors " +
              (isActive
                ? "bg-sidebar text-sidebar-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent")
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Personal Information (5-step wizard) ----------
function PersonalInformationTab({
  step,
  onStep,
  form,
  setForm,
  onSave,
  onClose,
}: {
  step: 0 | 1 | 2 | 3 | 4;
  onStep: (n: 0 | 1 | 2 | 3 | 4) => void;
  form: CustomerRow;
  setForm: React.Dispatch<React.SetStateAction<CustomerRow>>;
  onSave: () => void;
  onClose: () => void;
}) {
  const steps = [
    { icon: User, label: "Personal Details" },
    { icon: FileText, label: "Billing Details" },
    { icon: FileSignature, label: "Contract Details" },
    { icon: ClipboardList, label: "Other Details" },
    { icon: Bell, label: "Notification" },
  ];

  const next = () => {
    if (step < 4) onStep((step + 1) as 0 | 1 | 2 | 3 | 4);
  };
  const prev = () => {
    if (step > 0) onStep((step - 1) as 0 | 1 | 2 | 3 | 4);
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Stepper */}
      <div className="relative flex items-center justify-between px-2 py-3">
        <div className="absolute left-8 right-8 top-1/2 h-px -translate-y-1/2 bg-border" />
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onStep(i as 0 | 1 | 2 | 3 | 4)}
              className="relative z-10 flex flex-col items-center gap-1.5"
            >
              <span
                className={
                  "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors " +
                  (active
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : done
                      ? "border-emerald-500 bg-background text-emerald-600"
                      : "border-muted bg-background text-muted-foreground")
                }
                aria-label={s.label}
              >
                <Icon className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </div>

      {step === 0 && <StepPersonalDetails form={form} setForm={setForm} />}
      {step === 1 && <StepBillingDetails form={form} setForm={setForm} />}
      {step === 2 && <StepContractDetails form={form} setForm={setForm} />}
      {step === 3 && <StepOtherDetails form={form} setForm={setForm} />}
      {step === 4 && <StepNotification form={form} setForm={setForm} />}

      <DialogFooter className="mt-2 items-center justify-between gap-2 sm:justify-between">
        <div>
          {step > 0 && (
            <Button variant="outline" onClick={prev}>Previous</Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={onSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
            Save
          </Button>
          {step < 4 && (
            <Button onClick={next} className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Next
            </Button>
          )}
          <Button variant="destructive" onClick={onClose}>Close</Button>
        </div>
      </DialogFooter>
    </div>
  );
}

// ---------- Step 1: Personal Details ----------
function StepPersonalDetails({
  form, setForm,
}: {
  form: CustomerRow;
  setForm: React.Dispatch<React.SetStateAction<CustomerRow>>;
}) {
  const p = form.personal;
  const patch = (u: Partial<PersonalDetails>) =>
    setForm((f) => ({ ...f, personal: { ...f.personal, ...u } }));

  return (
    <Section title="Personal Details">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <FieldWrapper label="Code">
          <Input value={p.code} onChange={(e) => patch({ code: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Name" required>
          <Input value={p.name} onChange={(e) => patch({ name: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Contact Person">
          <Input value={p.contactPerson} onChange={(e) => patch({ contactPerson: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Address1">
          <Input value={p.address1} onChange={(e) => patch({ address1: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Address2">
          <Input value={p.address2} onChange={(e) => patch({ address2: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Pin Code">
          <SearchField value={p.pinCode} onChange={(v) => patch({ pinCode: v })} />
        </FieldWrapper>
        <FieldWrapper label="City">
          <Input value={p.city} onChange={(e) => patch({ city: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="State">
          <Input value={p.state} onChange={(e) => patch({ state: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Tel No. 1">
          <Input value={p.tel1} onChange={(e) => patch({ tel1: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Tel No. 2">
          <Input value={p.tel2} onChange={(e) => patch({ tel2: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Email ID">
          <Input placeholder="abc@xyz.com; mno@pqr.net" value={p.emailId} onChange={(e) => patch({ emailId: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Mobile" required>
          <Input value={p.mobile} onChange={(e) => patch({ mobile: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Fax No">
          <Input value={p.faxNo} onChange={(e) => patch({ faxNo: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Customer Billing State" required>
          <SearchField value={p.customerBillingState} onChange={(v) => patch({ customerBillingState: v })} />
        </FieldWrapper>
        <FieldWrapper label="Service Centre" required>
          <SearchField value={p.serviceCentre} onChange={(v) => patch({ serviceCentre: v })} />
        </FieldWrapper>
        <FieldWrapper label="Start Date" required>
          <DateField value={p.startDate} onChange={(v) => patch({ startDate: v })} />
        </FieldWrapper>

        <FieldWrapper label="Status" required>
          <Select value={p.status} onValueChange={(v) => patch({ status: v as CustomerStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="In-Active">In-Active</SelectItem>
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Origin" required>
          <SearchField value={p.origin} onChange={(v) => patch({ origin: v })} />
        </FieldWrapper>
        <FieldWrapper label="GST No.">
          <Input value={p.gstNo} onChange={(e) => patch({ gstNo: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Aadhar No.">
          <Input value={p.aadharNo} onChange={(e) => patch({ aadharNo: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="DOB On Aadhar">
          <DateField value={p.dobOnAadhar} onChange={(v) => patch({ dobOnAadhar: v })} />
        </FieldWrapper>
        <FieldWrapper label="Passport No.">
          <Input value={p.passportNo} onChange={(e) => patch({ passportNo: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="PAN No.">
          <Input value={p.panNo} onChange={(e) => patch({ panNo: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="TAN No.">
          <Input value={p.tanNo} onChange={(e) => patch({ tanNo: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Invoice Format">
          <Input value={p.invoiceFormat} onChange={(e) => patch({ invoiceFormat: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Customer Type">
          <Select value={p.customerType} onValueChange={(v) => patch({ customerType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOMER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Register Type">
          <Select value={p.registerType} onValueChange={(v) => patch({ registerType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {REGISTER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Signature File">
          <FileChoose />
        </FieldWrapper>
      </div>
      <div className="mt-4">
        <FieldWrapper label="Upload Logo">
          <FileChoose />
        </FieldWrapper>
      </div>
    </Section>
  );
}

// ---------- Step 2: Billing Details ----------
function StepBillingDetails({
  form, setForm,
}: {
  form: CustomerRow;
  setForm: React.Dispatch<React.SetStateAction<CustomerRow>>;
}) {
  const b = form.billing;
  const patch = (u: Partial<BillingDetails>) =>
    setForm((f) => ({ ...f, billing: { ...f.billing, ...u } }));

  return (
    <Section title="Billing Details">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <FieldWrapper label="Payment Type" required>
          <Select value={b.paymentType} onValueChange={(v) => patch({ paymentType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Billing Type">
          <Select value={b.billingType || "Select Billing Type"} onValueChange={(v) => patch({ billingType: v === "Select Billing Type" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BILLING_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Credit Limit">
          <Input value={b.creditLimit} onChange={(e) => patch({ creditLimit: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Credit Days">
          <Input value={b.creditDays} onChange={(e) => patch({ creditDays: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Registration No.">
          <Input value={b.registrationNo} onChange={(e) => patch({ registrationNo: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Instructions">
          <Input value={b.instructions} onChange={(e) => patch({ instructions: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Credit %">
          <Input value={b.creditPercent} onChange={(e) => patch({ creditPercent: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Closing Balance">
          <Input value={b.closingBalance} onChange={(e) => patch({ closingBalance: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Unbilled Amount">
          <Input value={b.unbilledAmount} onChange={(e) => patch({ unbilledAmount: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Rupee">
          <Input value={b.rupee} onChange={(e) => patch({ rupee: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Paisa">
          <Input value={b.paisa} onChange={(e) => patch({ paisa: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Contract Head">
          <SearchField value={b.contractHead} onChange={(v) => patch({ contractHead: v })} />
        </FieldWrapper>

        <FieldWrapper label="Ledger Head">
          <SearchField value={b.ledgerHead} onChange={(v) => patch({ ledgerHead: v })} />
        </FieldWrapper>
        <FieldWrapper label="Contract Origin">
          <SearchField value={b.contractOrigin} onChange={(v) => patch({ contractOrigin: v })} />
        </FieldWrapper>
        <FieldWrapper label="Business Channel">
          <Select value={b.businessChannel || "Select Customer Type"} onValueChange={(v) => patch({ businessChannel: v === "Select Customer Type" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUSINESS_CHANNELS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="IEC No.">
          <Input value={b.iecNo} onChange={(e) => patch({ iecNo: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Bank AD Code">
          <Input value={b.bankAdCode} onChange={(e) => patch({ bankAdCode: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Bank Account">
          <Input value={b.bankAccount} onChange={(e) => patch({ bankAccount: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Bank IFSC">
          <Input value={b.bankIfsc} onChange={(e) => patch({ bankIfsc: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Firm">
          <Select value={b.firm || "Select Firm"} onValueChange={(v) => patch({ firm: v === "Select Firm" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIRMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>

        <FieldWrapper label="LUT Number">
          <Input value={b.lutNumber} onChange={(e) => patch({ lutNumber: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="LUT Issue Date">
          <DateField value={b.lutIssueDate} onChange={(v) => patch({ lutIssueDate: v })} />
        </FieldWrapper>
        <FieldWrapper label="LUT Till Date">
          <DateField value={b.lutTillDate} onChange={(v) => patch({ lutTillDate: v })} />
        </FieldWrapper>
        <FieldWrapper label="Shipper Type">
          <Select value={b.shipperType || "Select Lsp Type"} onValueChange={(v) => patch({ shipperType: v === "Select Lsp Type" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SHIPPER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <CheckField label="NFEI" checked={b.nfei} onChange={(v) => patch({ nfei: v })} />
        <CheckField label="Fuel Surcharge" checked={b.fuelSurcharge} onChange={(v) => patch({ fuelSurcharge: v })} />
        <CheckField label="Tax" checked={b.tax} onChange={(v) => patch({ tax: v })} />
        <CheckField label="No Tarrif" checked={b.noTariff} onChange={(v) => patch({ noTariff: v })} />
        <CheckField label="Inclusive Tax" checked={b.inclusiveTax} onChange={(v) => patch({ inclusiveTax: v })} />
        <CheckField label="Allow Login With OTP" checked={b.allowLoginWithOtp} onChange={(v) => patch({ allowLoginWithOtp: v })} />
      </div>
    </Section>
  );
}

// ---------- Step 3: Contract Details ----------
function StepContractDetails({
  form, setForm,
}: {
  form: CustomerRow;
  setForm: React.Dispatch<React.SetStateAction<CustomerRow>>;
}) {
  const c = form.contract;
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <Section title="Contract Details">
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-xs font-medium text-muted-foreground">Upload</Label>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setForm((s) => ({ ...s, contract: { ...s.contract, fileName: f?.name ?? "" } }));
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Choose</Button>
        <span className="text-xs text-muted-foreground">{c.fileName || "No file selected"}</span>
        <Button
          size="sm"
          className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          onClick={() => {
            if (!c.fileName) toast.error("Choose a file first");
            else toast.success(`Rate file uploaded: ${c.fileName}`);
          }}
        >
          Upload Rate File
        </Button>
      </div>
    </Section>
  );
}

// ---------- Step 4: Other Details ----------
function StepOtherDetails({
  form, setForm,
}: {
  form: CustomerRow;
  setForm: React.Dispatch<React.SetStateAction<CustomerRow>>;
}) {
  const o = form.other;
  const patch = (u: Partial<OtherDetails>) =>
    setForm((f) => ({ ...f, other: { ...f.other, ...u } }));
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Section title="Other Details">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <FieldWrapper label="Sales Executive">
          <SearchField value={o.salesExecutive} onChange={(v) => patch({ salesExecutive: v })} />
        </FieldWrapper>
        <FieldWrapper label="Incentive Type">
          <Select value={o.incentiveType} onValueChange={(v) => patch({ incentiveType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INCENTIVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Incentive Percent">
          <Input value={o.incentivePercent} onChange={(e) => patch({ incentivePercent: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Customer Msg">
          <Input value={o.customerMsg} onChange={(e) => patch({ customerMsg: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Account Email">
          <Input placeholder="abc@xyz.com; pqr@mno.net" value={o.accountEmail} onChange={(e) => patch({ accountEmail: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Best Rate">
          <SearchField value={o.bestRate} onChange={(v) => patch({ bestRate: v })} />
        </FieldWrapper>
        <FieldWrapper label="Monthly Sales">
          <Input value={o.monthlySales} onChange={(e) => patch({ monthlySales: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Default Vendor">
          <Input value={o.defaultVendor} onChange={(e) => patch({ defaultVendor: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="User">
          <Input value={o.user} onChange={(e) => patch({ user: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Password">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={o.password}
              onChange={(e) => patch({ password: e.target.value })}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FieldWrapper>
        <FieldWrapper label="Area">
          <SearchField value={o.area} onChange={(v) => patch({ area: v })} />
        </FieldWrapper>
        <FieldWrapper label="Field Executive">
          <SearchField value={o.fieldExecutive} onChange={(v) => patch({ fieldExecutive: v })} />
        </FieldWrapper>

        <FieldWrapper label="Monday">
          <Input value={o.monday} onChange={(e) => patch({ monday: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Tuesday">
          <Input value={o.tuesday} onChange={(e) => patch({ tuesday: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Wednesday">
          <Input value={o.wednesday} onChange={(e) => patch({ wednesday: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Thursday">
          <Input value={o.thursday} onChange={(e) => patch({ thursday: e.target.value })} />
        </FieldWrapper>

        <FieldWrapper label="Friday">
          <Input value={o.friday} onChange={(e) => patch({ friday: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Saturday">
          <Input value={o.saturday} onChange={(e) => patch({ saturday: e.target.value })} />
        </FieldWrapper>
        <FieldWrapper label="Sunday">
          <Input value={o.sunday} onChange={(e) => patch({ sunday: e.target.value })} />
        </FieldWrapper>
        <div className="flex items-end">
          <CheckField label="Global Customer" checked={o.globalCustomer} onChange={(v) => patch({ globalCustomer: v })} />
        </div>

        <FieldWrapper label="API Names">
          <Select value={o.apiNames || "__none"} onValueChange={(v) => patch({ apiNames: v === "__none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="API Names" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">API Names</SelectItem>
              {API_NAMES.filter(Boolean).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Measurement Unit">
          <Select value={o.measurementUnit} onValueChange={(v) => patch({ measurementUnit: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEASUREMENT_UNITS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Industry">
          <SearchField value={o.industry} onChange={(v) => patch({ industry: v })} />
        </FieldWrapper>
        <FieldWrapper label="GeoLocation">
          <div className="relative">
            <Input value={o.geoLocation} onChange={(e) => patch({ geoLocation: e.target.value })} className="pr-9" />
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
              onClick={() => toast.info("Locate on map")}
              aria-label="Locate"
            >
              <MapPin className="h-3.5 w-3.5" />
            </button>
          </div>
        </FieldWrapper>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <CheckField label="Disable Customer Origin" checked={o.disableCustomerOrigin} onChange={(v) => patch({ disableCustomerOrigin: v })} />
        <CheckField label="Enable Customer Tax And Duties Paid By" checked={o.enableCustomerTaxAndDutiesPaidBy} onChange={(v) => patch({ enableCustomerTaxAndDutiesPaidBy: v })} />
        <CheckField label="Enable AWBNo" checked={o.enableAwbNo} onChange={(v) => patch({ enableAwbNo: v })} />
      </div>
    </Section>
  );
}

// ---------- Step 5: Notification ----------
function StepNotification({
  form, setForm,
}: {
  form: CustomerRow;
  setForm: React.Dispatch<React.SetStateAction<CustomerRow>>;
}) {
  const n = form.notification;
  const patch = (u: Partial<NotificationDetails>) =>
    setForm((f) => ({ ...f, notification: { ...f.notification, ...u } }));
  return (
    <Section title="Notification">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <CheckField label="Email Forwarding Info" checked={n.emailForwardingInfo} onChange={(v) => patch({ emailForwardingInfo: v })} />
        <CheckField label="Email on Progress" checked={n.emailOnProgress} onChange={(v) => patch({ emailOnProgress: v })} />
        <CheckField label="EStatement" checked={n.eStatement} onChange={(v) => patch({ eStatement: v })} />
        <CheckField label="E-Invoice" checked={n.eInvoice} onChange={(v) => patch({ eInvoice: v })} />
        <CheckField label="Email Weight Change" checked={n.emailWeightChange} onChange={(v) => patch({ emailWeightChange: v })} />
        <CheckField label="Whatsapp Booking Info" checked={n.whatsappBookingInfo} onChange={(v) => patch({ whatsappBookingInfo: v })} />
        <CheckField label="Whatsapp Delivery Info" checked={n.whatsappDeliveryInfo} onChange={(v) => patch({ whatsappDeliveryInfo: v })} />
        <CheckField label="Allow Booking when Credit Limit Over" checked={n.allowBookingWhenCreditLimitOver} onChange={(v) => patch({ allowBookingWhenCreditLimitOver: v })} />
        <CheckField label="Allow Zero Amount" checked={n.allowZeroAmount} onChange={(v) => patch({ allowZeroAmount: v })} />
        <CheckField label="Booking Not to VOID Shipment" checked={n.bookingNotToVoidShipment} onChange={(v) => patch({ bookingNotToVoidShipment: v })} />
      </div>
    </Section>
  );
}

// ---------- Tab: Fuel Surcharges ----------
function FuelSurchargesTab({
  rows,
  setRows,
  onClose,
}: {
  rows: FuelSurchargeRow[];
  setRows: (u: (prev: FuelSurchargeRow[]) => FuelSurchargeRow[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    entryCode: "", fromDate: "", toDate: "", vendor: "", product: "", destination: "", percentage: "",
  });
  const [dialog, setDialog] = useState<null | FuelSurchargeRow>(null);
  const [form, setForm] = useState<FuelSurchargeRow>({
    id: "", entryCode: "", fromDate: "", toDate: "", vendor: "", product: "", destination: "", percentage: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !Object.values(r).join(" ").toLowerCase().includes(q)) return false;
      for (const k of Object.keys(filters) as (keyof typeof filters)[]) {
        if (filters[k] && !String(r[k]).toLowerCase().includes(filters[k].toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, search, filters]);

  const openAdd = () => {
    setForm({ id: "", entryCode: "", fromDate: "", toDate: "", vendor: "", product: "", destination: "", percentage: "" });
    setDialog({ id: "", entryCode: "", fromDate: "", toDate: "", vendor: "", product: "", destination: "", percentage: "" });
  };
  const save = () => {
    if (dialog?.id) {
      setRows((prev) => prev.map((r) => (r.id === dialog.id ? { ...form, id: dialog.id } : r)));
      toast.success("Fuel surcharge updated");
    } else {
      setRows((prev) => [{ ...form, id: crypto.randomUUID() }, ...prev]);
      toast.success("Fuel surcharge added");
    }
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <SubTableToolbar
        onAdd={openAdd}
        onExport={() => exportSimpleCsv("fuel_surcharges.csv",
          ["Entry Code","From Date","To Date","Vendor","Product","Destination","Percentage"],
          rows.map((r) => [r.entryCode, r.fromDate, r.toDate, r.vendor, r.product, r.destination, r.percentage]),
        )}
        search={search}
        onSearch={setSearch}
      />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              <TableHead className="text-sidebar-foreground">Entry Code</TableHead>
              <TableHead className="text-sidebar-foreground">From Date</TableHead>
              <TableHead className="text-sidebar-foreground">To Date</TableHead>
              <TableHead className="text-sidebar-foreground">Vendor</TableHead>
              <TableHead className="text-sidebar-foreground">Product</TableHead>
              <TableHead className="text-sidebar-foreground">Destination</TableHead>
              <TableHead className="text-sidebar-foreground">Percentage</TableHead>
              <TableHead className="w-24 text-center text-sidebar-foreground">Action</TableHead>
            </TableRow>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              {(["entryCode","fromDate","toDate","vendor","product","destination","percentage"] as const).map((k) => (
                <TableHead key={k} className="py-2">
                  <Input value={filters[k]} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))} className="h-8" />
                </TableHead>
              ))}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">No data available in table</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.entryCode}</TableCell>
                <TableCell>{r.fromDate}</TableCell>
                <TableCell>{r.toDate}</TableCell>
                <TableCell>{r.vendor}</TableCell>
                <TableCell>{r.product}</TableCell>
                <TableCell>{r.destination}</TableCell>
                <TableCell>{r.percentage}</TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setForm(r); setDialog(r); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DialogFooter>
        <Button variant="destructive" onClick={onClose}>Close</Button>
      </DialogFooter>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{dialog?.id ? "Edit Fuel Surcharge" : "Fuel Surcharge"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 py-2">
            <FieldWrapper label="Entry Code"><Input value={form.entryCode} onChange={(e) => setForm({ ...form, entryCode: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="From Date"><DateField value={form.fromDate} onChange={(v) => setForm({ ...form, fromDate: v })} /></FieldWrapper>
            <FieldWrapper label="To Date"><DateField value={form.toDate} onChange={(v) => setForm({ ...form, toDate: v })} /></FieldWrapper>
            <FieldWrapper label="Vendor"><SearchField value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} /></FieldWrapper>
            <FieldWrapper label="Product"><SearchField value={form.product} onChange={(v) => setForm({ ...form, product: v })} /></FieldWrapper>
            <FieldWrapper label="Destination"><SearchField value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} /></FieldWrapper>
            <FieldWrapper label="Percentage"><Input value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} /></FieldWrapper>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={save} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={() => setDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Tab: Other Charges ----------
function OtherChargesTab({
  rows,
  setRows,
  onClose,
}: {
  rows: OtherChargeRow[];
  setRows: (u: (prev: OtherChargeRow[]) => OtherChargeRow[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | OtherChargeRow>(null);
  const emptyRow = (): OtherChargeRow => ({
    id: "", chargeType: "", fromDate: "", toDate: "", vendor: "", service: "", product: "", origin: "", destination: "", amount: "", minimumValue: "",
  });
  const [form, setForm] = useState<OtherChargeRow>(emptyRow());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => !q || Object.values(r).join(" ").toLowerCase().includes(q));
  }, [rows, search]);

  const save = () => {
    if (dialog?.id) {
      setRows((prev) => prev.map((r) => (r.id === dialog.id ? { ...form, id: dialog.id } : r)));
    } else {
      setRows((prev) => [{ ...form, id: crypto.randomUUID() }, ...prev]);
    }
    toast.success("Charge saved");
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-9 gap-1.5" onClick={() => { setForm(emptyRow()); setDialog(emptyRow()); }}>
            <Plus className="h-4 w-4" /> Add
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => toast.info("Bulk Update")}>
            <Plus className="h-4 w-4" /> Bulk Update
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={() => exportSimpleCsv("other_charges.csv",
            ["Charge Type","From Date","To Date","Vendor","Service","Product","Origin","Destination","Amount","Minimum Value"],
            rows.map((r) => [r.chargeType, r.fromDate, r.toDate, r.vendor, r.service, r.product, r.origin, r.destination, r.amount, r.minimumValue]),
          )}>Export</Button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-9 w-56 pl-8" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              <TableHead className="text-sidebar-foreground">SrNo</TableHead>
              <TableHead className="text-sidebar-foreground">Charge Type</TableHead>
              <TableHead className="text-sidebar-foreground">From Date</TableHead>
              <TableHead className="text-sidebar-foreground">To Date</TableHead>
              <TableHead className="text-sidebar-foreground">Vendor</TableHead>
              <TableHead className="text-sidebar-foreground">Service</TableHead>
              <TableHead className="text-sidebar-foreground">Product</TableHead>
              <TableHead className="text-sidebar-foreground">Origin</TableHead>
              <TableHead className="text-sidebar-foreground">Destination</TableHead>
              <TableHead className="text-sidebar-foreground">Amount</TableHead>
              <TableHead className="text-sidebar-foreground">Minimum Value</TableHead>
              <TableHead className="w-24 text-center text-sidebar-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="h-24 text-center text-sm text-muted-foreground">No data available in table</TableCell></TableRow>
            ) : filtered.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{r.chargeType}</TableCell>
                <TableCell>{r.fromDate}</TableCell>
                <TableCell>{r.toDate}</TableCell>
                <TableCell>{r.vendor}</TableCell>
                <TableCell>{r.service}</TableCell>
                <TableCell>{r.product}</TableCell>
                <TableCell>{r.origin}</TableCell>
                <TableCell>{r.destination}</TableCell>
                <TableCell>{r.amount}</TableCell>
                <TableCell>{r.minimumValue}</TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setForm(r); setDialog(r); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DialogFooter>
        <Button variant="destructive" onClick={onClose}>Close</Button>
      </DialogFooter>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{dialog?.id ? "Edit Charge" : "Other Charge"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 py-2">
            <FieldWrapper label="Charge Type"><Input value={form.chargeType} onChange={(e) => setForm({ ...form, chargeType: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="From Date"><DateField value={form.fromDate} onChange={(v) => setForm({ ...form, fromDate: v })} /></FieldWrapper>
            <FieldWrapper label="To Date"><DateField value={form.toDate} onChange={(v) => setForm({ ...form, toDate: v })} /></FieldWrapper>
            <FieldWrapper label="Vendor"><SearchField value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} /></FieldWrapper>
            <FieldWrapper label="Service"><SearchField value={form.service} onChange={(v) => setForm({ ...form, service: v })} /></FieldWrapper>
            <FieldWrapper label="Product"><SearchField value={form.product} onChange={(v) => setForm({ ...form, product: v })} /></FieldWrapper>
            <FieldWrapper label="Origin"><SearchField value={form.origin} onChange={(v) => setForm({ ...form, origin: v })} /></FieldWrapper>
            <FieldWrapper label="Destination"><SearchField value={form.destination} onChange={(v) => setForm({ ...form, destination: v })} /></FieldWrapper>
            <FieldWrapper label="Amount"><Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Minimum Value"><Input value={form.minimumValue} onChange={(e) => setForm({ ...form, minimumValue: e.target.value })} /></FieldWrapper>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={save} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={() => setDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Tab: Volumetric ----------
function VolumetricTab({
  rows,
  setRows,
  onClose,
}: {
  rows: VolumetricRow[];
  setRows: (u: (prev: VolumetricRow[]) => VolumetricRow[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | VolumetricRow>(null);
  const emptyRow = (): VolumetricRow => ({ id: "", customerName: "", product: "", vendor: "", service: "", cmDivide: "", inchDivide: "", cft: "" });
  const [form, setForm] = useState<VolumetricRow>(emptyRow());
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => !q || Object.values(r).join(" ").toLowerCase().includes(q));
  }, [rows, search]);
  const save = () => {
    if (dialog?.id) setRows((prev) => prev.map((r) => (r.id === dialog.id ? { ...form, id: dialog.id } : r)));
    else setRows((prev) => [{ ...form, id: crypto.randomUUID() }, ...prev]);
    toast.success("Volumetric saved");
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <SubTableToolbar
        onAdd={() => { setForm(emptyRow()); setDialog(emptyRow()); }}
        onExport={() => exportSimpleCsv("volumetrics.csv",
          ["Customer Name","Product","Vendor","Service","CM Divide","Inch Divide","CFT"],
          rows.map((r) => [r.customerName, r.product, r.vendor, r.service, r.cmDivide, r.inchDivide, r.cft]),
        )}
        search={search}
        onSearch={setSearch}
      />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              <TableHead className="text-sidebar-foreground">Customer Name</TableHead>
              <TableHead className="text-sidebar-foreground">Product</TableHead>
              <TableHead className="text-sidebar-foreground">Vendor</TableHead>
              <TableHead className="text-sidebar-foreground">service</TableHead>
              <TableHead className="text-sidebar-foreground">CM Divide</TableHead>
              <TableHead className="text-sidebar-foreground">Inch Divide</TableHead>
              <TableHead className="text-sidebar-foreground">CFT</TableHead>
              <TableHead className="w-24 text-center text-sidebar-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">No data available in table</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.customerName}</TableCell>
                <TableCell>{r.product}</TableCell>
                <TableCell>{r.vendor}</TableCell>
                <TableCell>{r.service}</TableCell>
                <TableCell>{r.cmDivide}</TableCell>
                <TableCell>{r.inchDivide}</TableCell>
                <TableCell>{r.cft}</TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setForm(r); setDialog(r); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DialogFooter><Button variant="destructive" onClick={onClose}>Close</Button></DialogFooter>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{dialog?.id ? "Edit Volumetric" : "Volumetric"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 py-2">
            <FieldWrapper label="Customer Name"><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Product"><SearchField value={form.product} onChange={(v) => setForm({ ...form, product: v })} /></FieldWrapper>
            <FieldWrapper label="Vendor"><SearchField value={form.vendor} onChange={(v) => setForm({ ...form, vendor: v })} /></FieldWrapper>
            <FieldWrapper label="Service"><SearchField value={form.service} onChange={(v) => setForm({ ...form, service: v })} /></FieldWrapper>
            <FieldWrapper label="CM Divide"><Input value={form.cmDivide} onChange={(e) => setForm({ ...form, cmDivide: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Inch Divide"><Input value={form.inchDivide} onChange={(e) => setForm({ ...form, inchDivide: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="CFT"><Input value={form.cft} onChange={(e) => setForm({ ...form, cft: e.target.value })} /></FieldWrapper>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={save} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={() => setDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Tab: KYC Details ----------
function KycTab({
  rows,
  setRows,
  onClose,
}: {
  rows: KycRow[];
  setRows: (u: (prev: KycRow[]) => KycRow[]) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<string>(KYC_TYPES[0]);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex flex-wrap items-end gap-3 rounded-md border p-4">
        <div className="min-w-56">
          <Label className="text-xs font-medium text-muted-foreground">KYC Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KYC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium text-muted-foreground">Select File</Label>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Choose</Button>
          <span className="text-xs text-muted-foreground">{fileName || "No file selected"}</span>
        </div>
        <Button
          size="sm"
          className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          onClick={() => {
            if (!fileName) return toast.error("Choose a file first");
            setRows((prev) => [{ id: crypto.randomUUID(), type, fileName }, ...prev]);
            setFileName("");
            toast.success("KYC uploaded");
          }}
        >
          Upload
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="text-sidebar-foreground">Type</TableHead>
                <TableHead className="text-sidebar-foreground">File</TableHead>
                <TableHead className="w-24 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.type}</TableCell>
                  <TableCell>{r.fileName}</TableCell>
                  <TableCell className="text-center">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogFooter><Button variant="destructive" onClick={onClose}>Close</Button></DialogFooter>
    </div>
  );
}

// ---------- Tab: Customer Address ----------
function AddressTab({
  rows,
  setRows,
  onClose,
}: {
  rows: AddressRow[];
  setRows: (u: (prev: AddressRow[]) => AddressRow[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | AddressRow>(null);
  const [form, setForm] = useState<AddressRow>(emptyAddress());
  const [contactTypeOpen, setContactTypeOpen] = useState(false);
  const [contactTypes, setContactTypes] = useState<{ id: string; name: string }[]>([
    { id: "1", name: "GENZ" },
  ]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      !q || [r.name, r.designation, r.mobile, r.city, r.kycFileName, r.fromDate]
        .join(" ").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const openAdd = () => {
    setForm(emptyAddress());
    setDialog(emptyAddress());
  };

  const save = () => {
    if (!form.contactType.trim()) return toast.error("Contact Type is required");
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.mobile.trim()) return toast.error("Mobile No. is required");
    if (!form.pinCode.trim()) return toast.error("PinCode is required");

    if (dialog?.id) {
      setRows((prev) => prev.map((r) => (r.id === dialog.id ? { ...form, id: dialog.id } : r)));
    } else {
      setRows((prev) => [{ ...form, id: crypto.randomUUID() }, ...prev]);
    }
    toast.success("Address saved");
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <SubTableToolbar
        onAdd={openAdd}
        onExport={() => exportSimpleCsv("customer_addresses.csv",
          ["Contact Person","Start Date","Designation","Mobile","City","Filename"],
          rows.map((r) => [r.name, r.fromDate, r.designation, r.mobile, r.city, r.kycFileName]),
        )}
        search={search}
        onSearch={setSearch}
      />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-sidebar hover:bg-sidebar">
              <TableHead className="text-sidebar-foreground">Contact Person</TableHead>
              <TableHead className="text-sidebar-foreground">Start Date</TableHead>
              <TableHead className="text-sidebar-foreground">Designation</TableHead>
              <TableHead className="text-sidebar-foreground">Mobile</TableHead>
              <TableHead className="text-sidebar-foreground">City</TableHead>
              <TableHead className="text-sidebar-foreground">Filename</TableHead>
              <TableHead className="w-24 text-center text-sidebar-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">No data available in table</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.fromDate}</TableCell>
                <TableCell>{r.designation}</TableCell>
                <TableCell>{r.mobile}</TableCell>
                <TableCell>{r.city}</TableCell>
                <TableCell>{r.kycFileName}</TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setForm(r); setDialog(r); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DialogFooter><Button variant="destructive" onClick={onClose}>Close</Button></DialogFooter>

      {/* Address form dialog */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog?.id ? "Edit Address" : "Address"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 py-2">
            <FieldWrapper label="Customer"><Input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Contact Type" required>
              <div className="flex gap-1">
                <SearchField value={form.contactType} onChange={(v) => setForm({ ...form, contactType: v })} />
                <Button size="icon" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" onClick={() => setContactTypeOpen(true)} aria-label="Manage Contact Types">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </FieldWrapper>
            <FieldWrapper label="From Date" required>
              <DateField value={form.fromDate} onChange={(v) => setForm({ ...form, fromDate: v })} />
            </FieldWrapper>
            <FieldWrapper label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FieldWrapper>

            <FieldWrapper label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Email"><Input placeholder="abc@xyz.com, pqr@mno.net" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Mobile No." required><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Landline No."><Input value={form.landline} onChange={(e) => setForm({ ...form, landline: e.target.value })} /></FieldWrapper>

            <FieldWrapper label="Extension No."><Input value={form.extension} onChange={(e) => setForm({ ...form, extension: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Address 1"><Input value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Address 2"><Input value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Address 3"><Input value={form.address3} onChange={(e) => setForm({ ...form, address3: e.target.value })} /></FieldWrapper>

            <FieldWrapper label="PinCode" required><SearchField value={form.pinCode} onChange={(v) => setForm({ ...form, pinCode: v })} /></FieldWrapper>
            <FieldWrapper label="City"><SearchField value={form.city} onChange={(v) => setForm({ ...form, city: v })} /></FieldWrapper>
            <FieldWrapper label="State"><SearchField value={form.state} onChange={(v) => setForm({ ...form, state: v })} /></FieldWrapper>
            <FieldWrapper label="Country"><SearchField value={form.country} onChange={(v) => setForm({ ...form, country: v })} /></FieldWrapper>

            <FieldWrapper label="Remark"><Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Passport No."><Input value={form.passportNo} onChange={(e) => setForm({ ...form, passportNo: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="Aadhar No."><Input value={form.aadharNo} onChange={(e) => setForm({ ...form, aadharNo: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="GST No."><Input value={form.gstNo} onChange={(e) => setForm({ ...form, gstNo: e.target.value })} /></FieldWrapper>

            <FieldWrapper label="PAN No."><Input value={form.panNo} onChange={(e) => setForm({ ...form, panNo: e.target.value })} /></FieldWrapper>
            <div className="flex items-end">
              <CheckField label="Default Shipper" checked={form.defaultShipper} onChange={(v) => setForm({ ...form, defaultShipper: v })} />
            </div>
            <FieldWrapper label="IEC No."><Input value={form.iecNo} onChange={(e) => setForm({ ...form, iecNo: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="AD Code"><Input value={form.adCode} onChange={(e) => setForm({ ...form, adCode: e.target.value })} /></FieldWrapper>

            <FieldWrapper label="LUT No."><Input value={form.lutNo} onChange={(e) => setForm({ ...form, lutNo: e.target.value })} /></FieldWrapper>
            <FieldWrapper label="KYC Image">
              <FileChoose value={form.kycFileName} onChange={(v) => setForm({ ...form, kycFileName: v })} />
            </FieldWrapper>
          </div>
          <DialogFooter className="gap-2">
            <Button onClick={save} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={() => setDialog(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Master (Contact Type) dialog */}
      <ContactTypeMasterDialog
        open={contactTypeOpen}
        onOpenChange={setContactTypeOpen}
        rows={contactTypes}
        setRows={setContactTypes}
        onPick={(name) => setForm((f) => ({ ...f, contactType: name }))}
      />
    </div>
  );
}

function ContactTypeMasterDialog({
  open, onOpenChange, rows, setRows, onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: { id: string; name: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ id: string; name: string }[]>>;
  onPick: (name: string) => void;
}) {
  const [value, setValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const save = () => {
    const name = value.trim();
    if (!name) return toast.error("Contact Type is required");
    if (editingId) {
      setRows((prev) => prev.map((r) => (r.id === editingId ? { ...r, name } : r)));
      toast.success("Contact Type updated");
    } else {
      setRows((prev) => [...prev, { id: crypto.randomUUID(), name }]);
      toast.success("Contact Type added");
    }
    setValue("");
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <div className="flex items-center justify-between rounded-t-lg bg-sidebar px-4 py-3 text-sidebar-foreground">
          <span className="text-sm font-semibold">Contact Master</span>
          <button onClick={() => onOpenChange(false)} className="text-sidebar-foreground/80 hover:text-sidebar-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-2">
              <FieldWrapper label="Contact Type" required>
                <Input value={value} onChange={(e) => setValue(e.target.value)} className="w-56" />
              </FieldWrapper>
              <Button onClick={save} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search:" className="h-9 w-56 pl-8" />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  <TableHead className="text-sidebar-foreground">Contact Type</TableHead>
                  <TableHead className="w-32 text-sidebar-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="h-16 text-center text-sm text-muted-foreground">No data</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <button className="text-left hover:text-primary" onClick={() => { onPick(r.name); onOpenChange(false); }}>
                        {r.name}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingId(r.id); setValue(r.name); }}>
                          <Pencil className="h-4 w-4 text-primary" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Helpers ----------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border">
      <div className="border-b bg-sidebar px-3 py-1.5">
        <span className="inline-block rounded-full bg-sidebar text-xs font-medium text-sidebar-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FieldWrapper({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" aria-label="Search" onClick={() => toast.info("Lookup")}>
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="pr-9" />
      <CalendarIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>{label}</span>
    </label>
  );
}

function FileChoose({ value, onChange }: { value?: string; onChange?: (v: string) => void } = {}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(value ?? "");
  return (
    <div className="flex items-center gap-2">
      <input ref={ref} type="file" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]?.name ?? "";
        setName(f);
        onChange?.(f);
      }} />
      <Button variant="outline" size="sm" type="button" onClick={() => ref.current?.click()}>Choose</Button>
      <span className="text-xs text-muted-foreground">{(value ?? name) || "No file selected"}</span>
    </div>
  );
}

function SubTableToolbar({
  onAdd, onExport, search, onSearch,
}: {
  onAdd: () => void;
  onExport: () => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button size="sm" className="h-9 gap-1.5" onClick={onAdd}>
        <Plus className="h-4 w-4" /> Add
      </Button>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-9" onClick={onExport}>Export</Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search:" className="h-9 w-56 pl-8" />
        </div>
      </div>
    </div>
  );
}

function exportSimpleCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [
    header.join(","),
    ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast.success(`Exported ${filename}`);
}

function CompactPager({ total, current, onSelect }: { total: number; current: number; onSelect: (n: number) => void }) {
  const pages: (number | "…")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push("…");
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push("…");
    pages.push(total);
  }
  return (
    <>
      {pages.map((p, i) => p === "…" ? (
        <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
      ) : (
        <button key={p} onClick={() => onSelect(p)}
          className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors ${p === current ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"}`}>
          {p}
        </button>
      ))}
    </>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="outline" className="h-9 w-9 bg-background" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PagerButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">
      {children}
    </button>
  );
}
