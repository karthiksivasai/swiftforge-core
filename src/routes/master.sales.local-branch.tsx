import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Trash2, Plus, Upload, Trash } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { useLookup, type LookupItem, type LookupKey } from "@/lib/masters/core/lookup";
import {
  localBranchesResource,
  type LocalBranchRow,
} from "@/lib/masters/resources/localBranches";
import {
  localBranchFormToPayload,
  rowToLocalBranchForm,
} from "@/lib/masters/localBranchUiMap";
import { useMasterList, toErrorMessage } from "@/lib/masters/screen";

type PincodeRow = { name: string; code: string };
type BillingStateRow = { name: string; code: string };

const PINCODE_DATA: PincodeRow[] = [
  { name: "Begumpet", code: "500016" },
  { name: "Secunderabad", code: "500003" },
  { name: "Hyderabad GPO", code: "500001" },
  { name: "Ameerpet", code: "500038" },
  { name: "Banjara Hills", code: "500034" },
  { name: "Jubilee Hills", code: "500033" },
  { name: "Kukatpally", code: "500072" },
  { name: "Madhapur", code: "500081" },
  { name: "Gachibowli", code: "500032" },
  { name: "Vanasthalipuram", code: "500070" },
];

const BILLING_STATE_DATA: BillingStateRow[] = [
  { name: "Andhra Pradesh", code: "AP" },
  { name: "Telangana", code: "TS" },
  { name: "Karnataka", code: "KA" },
  { name: "Tamil Nadu", code: "TN" },
  { name: "Kerala", code: "KL" },
  { name: "Maharashtra", code: "MH" },
  { name: "Gujarat", code: "GJ" },
  { name: "Delhi", code: "DL" },
  { name: "Uttar Pradesh", code: "UP" },
  { name: "West Bengal", code: "WB" },
  { name: "Rajasthan", code: "RJ" },
  { name: "Madhya Pradesh", code: "MP" },
];

function LiveLookupDialog({
  open,
  onOpenChange,
  lookupKey,
  title,
  nameHeader,
  codeHeader,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lookupKey: LookupKey;
  title: string;
  nameHeader: string;
  codeHeader: string;
  onSelect: (row: LookupItem) => void;
}) {
  const [query, setQuery] = useState("");
  const { data, isFetching } = useLookup(lookupKey, query, { enabled: open });
  const filtered = data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setQuery("");
      }}
    >
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="flex-row items-center justify-between bg-sidebar px-4 py-3 space-y-0">
          <DialogTitle className="text-sidebar-foreground text-sm font-medium">{title}</DialogTitle>
        </DialogHeader>
        <div className="p-4 space-y-3">
          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Search:</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 w-56"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  <TableHead className="text-sidebar-foreground">{nameHeader}</TableHead>
                  <TableHead className="text-sidebar-foreground">{codeHeader}</TableHead>
                  <TableHead className="text-sidebar-foreground text-center w-32">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFetching && filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                      No data available in table
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.code}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-600/90 h-7"
                          onClick={() => {
                            onSelect(row);
                            onOpenChange(false);
                            setQuery("");
                          }}
                        >
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length === 0 ? "No Record Found" : `${filtered.length} record${filtered.length === 1 ? "" : "s"} found`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LookupDialog<T extends { name: string; code: string }>({
  open,
  onOpenChange,
  title,
  nameHeader,
  codeHeader,
  data,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  nameHeader: string;
  codeHeader: string;
  data: T[];
  onSelect: (row: T) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = data.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.code.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setQuery("");
      }}
    >
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="flex-row items-center justify-between bg-sidebar px-4 py-3 space-y-0">
          <DialogTitle className="text-sidebar-foreground text-sm font-medium">{title}</DialogTitle>
        </DialogHeader>
        <div className="p-4 space-y-3">
          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Search:</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 w-56"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  <TableHead className="text-sidebar-foreground">{nameHeader}</TableHead>
                  <TableHead className="text-sidebar-foreground">{codeHeader}</TableHead>
                  <TableHead className="text-sidebar-foreground text-center w-32">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                      No data available in table
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.code}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.code}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-600/90 h-7"
                          onClick={() => {
                            onSelect(row);
                            onOpenChange(false);
                            setQuery("");
                          }}
                        >
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length === 0 ? "No Record Found" : `${filtered.length} record${filtered.length === 1 ? "" : "s"} found`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/master/sales/local-branch")({
  head: () => ({
    meta: [
      { title: "Local Branch — Master" },
      { name: "description", content: "Configure the local branch company details, terms, bank and voucher tracking." },
    ],
  }),
  component: LocalBranchPage,
});

type CompanyDetails = {
  branchCode: string;
  companyName: string;
  name: string;
  address1: string;
  address2: string;
  pinCode: string;
  city: string;
  state: string;
  serviceCenter: string;
  telephone1: string;
  telephone2: string;
  fax: string;
  website: string;
  email: string;
  panNo: string;
  serviceTaxNo: string;
  billingState: string;
  billingStateCode: string;
  gstNo: string;
  service: string;
  registrationNo: string;
};

type Terms = { [k: string]: string };

type BankDetails = {
  bankName: string;
  accountNo: string;
  accountName: string;
  bankAddress: string;
  ifsc: string;
  micr: string;
};

type Voucher = {
  lastInvoiceNo: string;
  invoicePrefix: string;
  invoiceSuffix: string;
  lastFreeFormInvoiceNo: string;
  freeFormPrefix: string;
  freeFormSuffix: string;
  debitNotePrefix: string;
  debitNoteLastInvoiceNo: string;
  debitNoteSuffix: string;
  creditNotePrefix: string;
  creditNoteLastInvoiceNo: string;
  creditNoteSuffix: string;
  rcpLastNo: string;
};

type FinYearRow = {
  id: string;
  finYear: string;
  fromDate: string;
  toDate: string;
};

const DEFAULT_COMPANY: CompanyDetails = {
  branchCode: "HYD",
  companyName: "Courierwala Express",
  name: "Courierwala Express",
  address1: "UPPER GROUND FLOOR,",
  address2: "1-8-450/1/B-75 SAHASRA,",
  pinCode: "500016",
  city: "INDIAN AIRLINES",
  state: "EMPLOYEES COLONY BEGUMPET",
  serviceCenter: "BEGUMPET",
  telephone1: "8686657209",
  telephone2: "",
  fax: "",
  website: "courierwalaexpress.in",
  email: "courierwalaxpress@gmail.com",
  panNo: "DMIPK0439N",
  serviceTaxNo: "",
  billingState: "Telangana",
  billingStateCode: "TS",
  gstNo: "36DMIPK0439N1ZO",
  service: "",
  registrationNo: "",
};

const DEFAULT_TERMS: Terms = {
  t1: "In Case of any discrepancies in the Invoice, your written notice must reach within 7 days from date of Invoice.",
  t2: "The company reserves the right to charge interest @ 24% p.a. on overdue bills.",
  t3: "All disputes Subject to Hyderabad jurisdiction only.",
  t4: "This is a computer generated statement. Hence signature not required.",
  t5: "",
  t6: "",
  t7: "",
  t8: "",
  t9: "",
  t10: "",
};

const DEFAULT_BANK: BankDetails = {
  bankName: "KOTAK MAHINDRA",
  accountNo: "4013115744",
  accountName: "COURIERWALA EXPRESS",
  bankAddress: "VANASTHALIPURAM",
  ifsc: "KKBK0007460",
  micr: "",
};

const DEFAULT_VOUCHER: Voucher = {
  lastInvoiceNo: "135",
  invoicePrefix: "CW/2026-27/",
  invoiceSuffix: "",
  lastFreeFormInvoiceNo: "0",
  freeFormPrefix: "",
  freeFormSuffix: "",
  debitNotePrefix: "",
  debitNoteLastInvoiceNo: "2",
  debitNoteSuffix: "",
  creditNotePrefix: "",
  creditNoteLastInvoiceNo: "38",
  creditNoteSuffix: "",
  rcpLastNo: "0",
};

const DEFAULT_FIN_YEARS: FinYearRow[] = [
  { id: "1", finYear: "2023-2024", fromDate: "2023-04-01", toDate: "2024-03-31" },
  { id: "2", finYear: "2025-2026", fromDate: "2025-04-01", toDate: "2026-03-31" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-lg border border-border bg-card p-6 pt-8">
      <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-3 py-1 text-xs font-medium text-sidebar-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
  type = "text",
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Label className="absolute -top-2 left-3 z-10 bg-card px-1 text-xs text-muted-foreground">
        {label}
      </Label>
      {textarea ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="min-h-[42px] resize-none"
        />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function formatDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function LocalBranchPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(localBranchesResource);
  const live = useMasterList(localBranchesResource, {
    enabled: authed,
    labelRefs: [
      { idField: "branch_id", table: "branches", as: "branch" },
      { idField: "state_id", table: "states", as: "state" },
      { idField: "billing_state_id", table: "states", as: "billing_state" },
    ],
  });
  const queryClient = useQueryClient();

  const [company, setCompany] = useState<CompanyDetails>(DEFAULT_COMPANY);
  const [terms, setTerms] = useState<Terms>(DEFAULT_TERMS);
  const [bank, setBank] = useState<BankDetails>(DEFAULT_BANK);
  const [voucher, setVoucher] = useState<Voucher>(DEFAULT_VOUCHER);
  const [finYears, setFinYears] = useState<FinYearRow[]>(DEFAULT_FIN_YEARS);
  const [companyLogo, setCompanyLogo] = useState<string>("");
  const [signatoryLogo, setSignatoryLogo] = useState<string>("");
  const [fyForm, setFyForm] = useState({ fromDate: "", toDate: "", finYear: "" });
  const [pinLookupOpen, setPinLookupOpen] = useState(false);
  const [stateLookupOpen, setStateLookupOpen] = useState(false);
  const [branchLookupOpen, setBranchLookupOpen] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [rowVersion, setRowVersion] = useState<number | undefined>();
  const [stateId, setStateId] = useState("");
  const [billingStateId, setBillingStateId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [serviceablePincodes, setServiceablePincodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const canSave = !authed || (recordId ? rc.perms.canModify : rc.perms.canAdd);

  useEffect(() => {
    if (!authed) {
      setHydrated(false);
      return;
    }
    if (live.isLoading || hydrated) return;
    const row = live.rows[0] as (LocalBranchRow & Record<string, unknown>) | undefined;
    if (!row) {
      setHydrated(true);
      return;
    }
    const form = rowToLocalBranchForm(row);
    setRecordId(row.id);
    setRowVersion(row.row_version);
    setCompany(form.company);
    setTerms(form.terms);
    setBank(form.bank);
    setVoucher(form.voucher);
    setFinYears(form.finYears.length ? form.finYears : DEFAULT_FIN_YEARS);
    setCompanyLogo(form.companyLogo);
    setSignatoryLogo(form.signatoryLogo);
    setStateId(form.stateId);
    setBillingStateId(form.billingStateId);
    setBranchId(form.branchId);
    setServiceablePincodes(form.serviceablePincodes);
    setHydrated(true);
  }, [authed, live.isLoading, live.rows, hydrated]);

  const setC = (k: keyof CompanyDetails) => (v: string) => setCompany((c) => ({ ...c, [k]: v }));
  const setB = (k: keyof BankDetails) => (v: string) => setBank((b) => ({ ...b, [k]: v }));
  const setV = (k: keyof Voucher) => (v: string) => setVoucher((s) => ({ ...s, [k]: v }));
  const setT = (k: string) => (v: string) => setTerms((t) => ({ ...t, [k]: v }));

  const handleSave = async () => {
    if (!company.branchCode.trim()) return toast.error("Branch Code is required");
    if (!company.name.trim()) return toast.error("Name is required");
    if (!authed) {
      toast.success("Local branch saved");
      return;
    }
    if (!canSave) return toast.error("You do not have permission to save this record");

    setSaving(true);
    try {
      const payload = localBranchFormToPayload({
        company,
        terms,
        bank,
        voucher,
        finYears,
        companyLogo,
        signatoryLogo,
        stateId,
        billingStateId,
        branchId,
        serviceablePincodes,
      });
      if (recordId) {
        const updated = await rc.update.mutateAsync({ id: recordId, patch: payload, rowVersion: rowVersion ?? 0 });
        setRowVersion(updated.row_version);
      } else {
        const created = await rc.create.mutateAsync(payload);
        setRecordId(created.id);
        setRowVersion(created.row_version);
      }
      setHydrated(false);
      await queryClient.invalidateQueries({ queryKey: masterKeys.list(localBranchesResource.key) });
      toast.success("Local branch saved");
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCompany(DEFAULT_COMPANY);
    setTerms(DEFAULT_TERMS);
    setBank(DEFAULT_BANK);
    setVoucher(DEFAULT_VOUCHER);
    setFinYears(DEFAULT_FIN_YEARS);
    setCompanyLogo("");
    setSignatoryLogo("");
    setRecordId(null);
    setRowVersion(undefined);
    setStateId("");
    setBillingStateId("");
    setBranchId("");
    setServiceablePincodes([]);
    setHydrated(false);
    toast.success("Form reset");
  };

  const handleAddFy = () => {
    if (!fyForm.fromDate || !fyForm.toDate || !fyForm.finYear.trim()) {
      toast.error("Fill From Date, To Date and Financial Year");
      return;
    }
    setFinYears((rows) => [
      ...rows,
      { id: String(Date.now()), finYear: fyForm.finYear, fromDate: fyForm.fromDate, toDate: fyForm.toDate },
    ]);
    setFyForm({ fromDate: "", toDate: "", finYear: "" });
    toast.success("Financial year added");
  };

  const handleDeleteFy = (id: string) => {
    setFinYears((rows) => rows.filter((r) => r.id !== id));
    toast.success("Financial year deleted");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setter(file.name);
    toast.success(`${file.name} selected`);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Master</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Sales</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Local Branch</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Local Branch</h1>
        <p className="text-sm text-muted-foreground">
          Configure the local branch company profile, terms, bank details and voucher tracking.
        </p>
      </div>

      {/* Company Details */}
      <Section title="Company Details">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Branch Code" value={company.branchCode} onChange={setC("branchCode")} />
          <Field label="Company Name" value={company.companyName} onChange={setC("companyName")} />
          <Field label="Name" value={company.name} onChange={setC("name")} />
          <Field label="Address 1" value={company.address1} onChange={setC("address1")} textarea />
          <Field label="Address 2" value={company.address2} onChange={setC("address2")} textarea />
          <div className="flex items-end gap-2">
            <Field label="Pin Code" value={company.pinCode} onChange={setC("pinCode")} className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
              onClick={() => setPinLookupOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Field label="City" value={company.city} onChange={setC("city")} />
          <Field label="State" value={company.state} onChange={setC("state")} />
          <div className="flex items-end gap-2">
            <Field
              label="Service Center"
              value={company.serviceCenter}
              onChange={setC("serviceCenter")}
              className="flex-1"
            />
            {authed && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
                onClick={() => setBranchLookupOpen(true)}
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Field label="Telephone 1" value={company.telephone1} onChange={setC("telephone1")} />
          <Field label="Telephone 2" value={company.telephone2} onChange={setC("telephone2")} />
          <Field label="Fax" value={company.fax} onChange={setC("fax")} />
          <Field label="Website" value={company.website} onChange={setC("website")} />
          <Field label="Email" value={company.email} onChange={setC("email")} />
          <Field label="PAN No" value={company.panNo} onChange={setC("panNo")} />
          <Field label="Service Tax No" value={company.serviceTaxNo} onChange={setC("serviceTaxNo")} />
          <div className="flex items-end gap-2">
            <Field label="Billing State" value={company.billingState} onChange={setC("billingState")} className="flex-1" />
            <Input
              value={company.billingStateCode}
              onChange={(e) => setC("billingStateCode")(e.target.value)}
              className="w-20"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
              onClick={() => setStateLookupOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Field label="GST No." value={company.gstNo} onChange={setC("gstNo")} />
          <Field label="Service" value={company.service} onChange={setC("service")} />
          <Field label="Registration No" value={company.registrationNo} onChange={setC("registrationNo")} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">Company Logo</Label>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setCompanyLogo)} />
              <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> Choose
              </span>
            </label>
            <span className="text-xs text-muted-foreground">{companyLogo || "No file selected"}</span>
            {companyLogo && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setCompanyLogo("")}>
                <Trash className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">Signatory Logo</Label>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, setSignatoryLogo)} />
              <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> Choose
              </span>
            </label>
            <span className="text-xs text-muted-foreground">{signatoryLogo || "No file selected"}</span>
            {signatoryLogo && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setSignatoryLogo("")}>
                <Trash className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Section>

      {/* Terms */}
      <Section title="Terms">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 10 }, (_, i) => `t${i + 1}`).map((k, i) => (
            <Field key={k} label={`Terms ${i + 1}`} value={terms[k] ?? ""} onChange={setT(k)} textarea />
          ))}
        </div>
      </Section>

      {/* Bank Details */}
      <Section title="Bank Details">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Bank Name" value={bank.bankName} onChange={setB("bankName")} />
          <Field label="Account No" value={bank.accountNo} onChange={setB("accountNo")} />
          <Field label="Account Name" value={bank.accountName} onChange={setB("accountName")} />
          <Field label="Bank Address" value={bank.bankAddress} onChange={setB("bankAddress")} />
          <Field label="RTGS / NEFT IFSC" value={bank.ifsc} onChange={setB("ifsc")} />
          <Field label="MICR" value={bank.micr} onChange={setB("micr")} />
        </div>
      </Section>

      {/* Last Invoice / Voucher No. */}
      <Section title="Last Invoice / Voucher No.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Last Invoice No" value={voucher.lastInvoiceNo} onChange={setV("lastInvoiceNo")} />
          <Field label="Invoice Prefix" value={voucher.invoicePrefix} onChange={setV("invoicePrefix")} />
          <Field label="Invoice Suffix" value={voucher.invoiceSuffix} onChange={setV("invoiceSuffix")} />
          <Field label="Last Free Form InvoiceNo" value={voucher.lastFreeFormInvoiceNo} onChange={setV("lastFreeFormInvoiceNo")} />
          <Field label="Free Form Prefix" value={voucher.freeFormPrefix} onChange={setV("freeFormPrefix")} />
          <Field label="Free Form Suffix" value={voucher.freeFormSuffix} onChange={setV("freeFormSuffix")} />
          <Field label="Debit Note Prefix" value={voucher.debitNotePrefix} onChange={setV("debitNotePrefix")} />
          <Field label="Debit Note Last Invoice No." value={voucher.debitNoteLastInvoiceNo} onChange={setV("debitNoteLastInvoiceNo")} />
          <Field label="Debit Note Suffix" value={voucher.debitNoteSuffix} onChange={setV("debitNoteSuffix")} />
          <Field label="Credit Note Prefix" value={voucher.creditNotePrefix} onChange={setV("creditNotePrefix")} />
          <Field label="Credit Note Last Invoice No." value={voucher.creditNoteLastInvoiceNo} onChange={setV("creditNoteLastInvoiceNo")} />
          <Field label="Credit Note Suffix" value={voucher.creditNoteSuffix} onChange={setV("creditNoteSuffix")} />
          <Field label="RCP Last No." value={voucher.rcpLastNo} onChange={setV("rcpLastNo")} />
        </div>
      </Section>

      <div className="flex justify-end gap-3">
        <Button
          onClick={handleSave}
          disabled={saving || (authed && !canSave)}
          className="bg-emerald-600 text-white hover:bg-emerald-600/90 min-w-[100px]"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          onClick={handleReset}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 min-w-[100px]"
        >
          Reset
        </Button>
      </div>

      {/* Financial Year */}
      <Section title="Financial year">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto] items-end">
          <Field label="From Date" type="date" value={fyForm.fromDate} onChange={(v) => setFyForm((f) => ({ ...f, fromDate: v }))} />
          <Field label="To Date" type="date" value={fyForm.toDate} onChange={(v) => setFyForm((f) => ({ ...f, toDate: v }))} />
          <Field label="Financial Year" value={fyForm.finYear} onChange={(v) => setFyForm((f) => ({ ...f, finYear: v }))} />
          <Button onClick={handleAddFy} className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 gap-1">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="text-sidebar-foreground">Fin. Year</TableHead>
                <TableHead className="text-sidebar-foreground">From Date</TableHead>
                <TableHead className="text-sidebar-foreground">To Date</TableHead>
                <TableHead className="text-sidebar-foreground text-center w-32">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finYears.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                    No financial years added
                  </TableCell>
                </TableRow>
              ) : (
                finYears.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.finYear}</TableCell>
                    <TableCell>{formatDate(row.fromDate)}</TableCell>
                    <TableCell>{formatDate(row.toDate)}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteFy(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Section>

      {authed ? (
        <>
          <LiveLookupDialog
            open={pinLookupOpen}
            onOpenChange={setPinLookupOpen}
            lookupKey="pin-code"
            title="Pincode"
            nameHeader="Pincode Name"
            codeHeader="PinCode Code"
            onSelect={(row) => {
              setCompany((c) => ({ ...c, pinCode: row.code ?? "", city: row.name }));
              setServiceablePincodes((pins) =>
                row.code && !pins.includes(row.code) ? [...pins, row.code] : pins,
              );
              toast.success(`Selected ${row.name}`);
            }}
          />
          <LiveLookupDialog
            open={stateLookupOpen}
            onOpenChange={setStateLookupOpen}
            lookupKey="state"
            title="Billing State"
            nameHeader="State Name"
            codeHeader="State Code"
            onSelect={(row) => {
              setCompany((c) => ({
                ...c,
                billingState: row.name,
                billingStateCode: row.code ?? "",
              }));
              setBillingStateId(row.id);
              toast.success(`Selected ${row.name}`);
            }}
          />
          <LiveLookupDialog
            open={branchLookupOpen}
            onOpenChange={setBranchLookupOpen}
            lookupKey="branch"
            title="Service Centre (Branch)"
            nameHeader="Branch Name"
            codeHeader="Branch Code"
            onSelect={(row) => {
              setCompany((c) => ({ ...c, serviceCenter: row.name }));
              setBranchId(row.id);
              toast.success(`Selected ${row.name}`);
            }}
          />
        </>
      ) : (
        <>
          <LookupDialog
            open={pinLookupOpen}
            onOpenChange={setPinLookupOpen}
            title="Pincode"
            nameHeader="Pincode Name"
            codeHeader="PinCode Code"
            data={PINCODE_DATA}
            onSelect={(row) => {
              setCompany((c) => ({ ...c, pinCode: row.code, city: row.name }));
              toast.success(`Selected ${row.name}`);
            }}
          />
          <LookupDialog
            open={stateLookupOpen}
            onOpenChange={setStateLookupOpen}
            title="Billing State"
            nameHeader="State Name"
            codeHeader="State Code"
            data={BILLING_STATE_DATA}
            onSelect={(row) => {
              setCompany((c) => ({ ...c, billingState: row.name, billingStateCode: row.code }));
              toast.success(`Selected ${row.name}`);
            }}
          />
        </>
      )}
    </div>
  );
}
